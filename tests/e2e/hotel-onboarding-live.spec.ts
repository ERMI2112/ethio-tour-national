import {
  expect,
  test,
  type APIResponse,
  type Browser,
  type Page,
  type Response,
} from '@playwright/test';
import type { HotelE2eIdentity } from './hotel-onboarding-support';
import { hotelE2eConfig } from './hotel-onboarding-support';

interface SignedInActor {
  page: Page;
  accessToken: string;
  apiResponses: ApiResponseRecord[];
}

interface ApiResponseRecord {
  method: string;
  origin: string;
  pathname: string;
  status: number;
  route: string;
}

interface CreateApplicationResponse {
  id: string;
  status: string;
  version: number;
}

const apiBasePath = hotelE2eConfig.apiUrl.pathname.replace(/\/+$/, '');
const authorizePath = `${hotelE2eConfig.keycloakIssuerUrl.pathname.replace(/\/+$/, '')}/protocol/openid-connect/auth`;
const tokenPath = `${hotelE2eConfig.keycloakIssuerUrl.pathname.replace(/\/+$/, '')}/protocol/openid-connect/token`;
const workspaceCallback = new URL('/auth/callback', hotelE2eConfig.workspaceUrl).href;

function isApiHotelPath(pathname: string): boolean {
  return /\/api\/(?:hotels\/|bureau\/hotel-cases|admin\/hotel-admissions)/.test(pathname);
}

function observeApiResponses(page: Page): ApiResponseRecord[] {
  const responses: ApiResponseRecord[] = [];
  page.on('response', (response) => {
    try {
      const url = new URL(response.url());
      if (!isApiHotelPath(url.pathname)) return;
      const apiIndex = url.pathname.lastIndexOf('/api/');
      responses.push({
        method: response.request().method(),
        origin: url.origin,
        pathname: url.pathname,
        status: response.status(),
        route: url.pathname.slice(apiIndex + '/api/'.length),
      });
    } catch {
      // Ignore non-HTTP browser responses without exposing their contents.
    }
  });
  return responses;
}

async function expectUiApiResponse(
  responses: ApiResponseRecord[],
  method: string,
  route: string,
  status: number,
): Promise<void> {
  await expect
    .poll(() => latestResponse(responses, method, route)?.status ?? null, {
      message: `Expected ${method} /api/${route} to return HTTP ${status}.`,
    })
    .toBe(status);

  const response = latestResponse(responses, method, route);
  expect(response?.origin, `API origin for ${method} /api/${route}`).toBe(
    hotelE2eConfig.apiUrl.origin,
  );
  expect(response?.pathname, `API path for ${method} /api/${route}`).toBe(
    `${apiBasePath}/${route}`,
  );
}

function latestResponse(
  responses: ApiResponseRecord[],
  method: string,
  route: string,
): ApiResponseRecord | undefined {
  return responses.filter((entry) => entry.method === method && entry.route === route).at(-1);
}

function expectConfiguredApiUrl(response: Response, routePattern: RegExp, label: string): void {
  const url = new URL(response.url());
  expect(url.origin, `${label} API origin`).toBe(hotelE2eConfig.apiUrl.origin);
  expect(url.pathname.startsWith(`${apiBasePath}/`), `${label} API base path`).toBe(true);
  expect(url.pathname.slice(apiBasePath.length + 1), `${label} API route`).toMatch(routePattern);
}

function listenForTokenResponse(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    if (response.request().method() !== 'POST') return false;
    try {
      const url = new URL(response.url());
      return url.pathname.endsWith('/protocol/openid-connect/token');
    } catch {
      return false;
    }
  });
}

async function signInThroughKeycloak(
  browser: Browser,
  identity: HotelE2eIdentity,
  route: string,
): Promise<SignedInActor & { close: () => Promise<void> }> {
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  const apiResponses = observeApiResponses(page);
  const loginPath = route.startsWith('/') ? route : `/${route}`;
  try {
    await page.goto(loginPath);
    const authorizeRequestPromise = page.waitForRequest((request) => {
      try {
        return new URL(request.url()).pathname.endsWith('/protocol/openid-connect/auth');
      } catch {
        return false;
      }
    });
    await page
      .getByRole('button', { name: /sign in with keycloak/i })
      .last()
      .click();
    const authorizeRequest = await authorizeRequestPromise;
    const authorizeUrl = new URL(authorizeRequest.url());

    expect(authorizeUrl.origin).toBe(hotelE2eConfig.keycloakIssuerUrl.origin);
    expect(authorizeUrl.pathname).toBe(authorizePath);
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(Boolean(authorizeUrl.searchParams.get('code_challenge'))).toBe(true);
    expect(Boolean(authorizeUrl.searchParams.get('state'))).toBe(true);
    expect(Boolean(authorizeUrl.searchParams.get('nonce'))).toBe(true);
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(workspaceCallback);
    expect(authorizeUrl.searchParams.get('client_id')).toBe('workspace-web');

    const tokenResponsePromise = listenForTokenResponse(page);
    try {
      await page.locator('#username').fill(identity.username);
      await page.locator('#password').fill(identity.password);
      await page.locator('#kc-login').click();
    } catch {
      throw new Error('The synthetic Keycloak identity could not complete the sign-in form.');
    }
    const tokenResponse = await tokenResponsePromise;
    const tokenUrl = new URL(tokenResponse.url());
    expect(tokenUrl.origin).toBe(hotelE2eConfig.keycloakIssuerUrl.origin);
    expect(tokenUrl.pathname).toBe(tokenPath);
    if (!tokenResponse.ok()) {
      throw new Error('Keycloak did not complete the authorization-code exchange.');
    }
    let tokens: { access_token?: unknown; token_type?: unknown; expires_in?: unknown };
    try {
      tokens = (await tokenResponse.json()) as typeof tokens;
    } catch {
      throw new Error('Keycloak returned an unreadable access-token response.');
    }
    if (
      typeof tokens.access_token !== 'string' ||
      !tokens.access_token ||
      typeof tokens.token_type !== 'string' ||
      tokens.token_type.toLowerCase() !== 'bearer' ||
      typeof tokens.expires_in !== 'number' ||
      tokens.expires_in <= 0
    ) {
      throw new Error('Keycloak returned an incomplete access-token response.');
    }

    try {
      await page.waitForFunction(
        (expectedPath) => window.location.pathname === expectedPath,
        loginPath,
        { timeout: 45_000 },
      );
    } catch {
      throw new Error('Keycloak sign-in did not return to the requested workspace route.');
    }
    return {
      page,
      accessToken: tokens.access_token,
      apiResponses,
      close: () => context.close(),
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

function apiRequestUrl(route: string): string {
  return new URL(route.replace(/^\//, ''), `${hotelE2eConfig.apiUrl.href.replace(/\/+$/, '')}/`)
    .href;
}

async function authenticatedGet(actor: SignedInActor, route: string): Promise<APIResponse> {
  return actor.page.request.get(apiRequestUrl(route), {
    headers: { authorization: `Bearer ${actor.accessToken}` },
  });
}

async function expectStatus(
  response: Response | APIResponse,
  status: number,
  assertion: string,
): Promise<void> {
  expect(response.status(), assertion).toBe(status);
}

async function expectPrivateBodyDoesNotContain(
  response: APIResponse,
  privateMarker: string,
  assertion: string,
): Promise<void> {
  const body = await response.text();
  if (body.includes(privateMarker)) throw new Error(assertion);
}

test('applicant submission, scoped Bureau review, Administrator admission, and private workspace access', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const actors: Array<{ close: () => Promise<void> }> = [];
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const hotelName = `Synthetic E2E hotel ${uniqueSuffix}`;
  const applicantNotes = `Synthetic acceptance-only application ${uniqueSuffix}`;

  try {
    const applicant = await signInThroughKeycloak(
      browser,
      hotelE2eConfig.identities.applicant,
      '/hotels',
    );
    actors.push(applicant);
    await expectUiApiResponse(applicant.apiResponses, 'GET', 'hotels/applications', 200);

    await applicant.page.getByRole('link', { name: 'Bureau review queue' }).click();
    await expect(applicant.page.locator('p.error-message[role="alert"]')).toContainText(
      'not permitted',
    );
    await expectUiApiResponse(applicant.apiResponses, 'GET', 'bureau/hotel-cases', 403);
    await applicant.page.getByRole('link', { name: 'Administrator admission' }).click();
    await expect(applicant.page.locator('p.error-message[role="alert"]')).toContainText(
      'not permitted',
    );
    await expectUiApiResponse(applicant.apiResponses, 'GET', 'admin/hotel-admissions', 403);
    await applicant.page.getByRole('link', { name: 'Applicant applications' }).click();

    const newApplicationForm = applicant.page.getByRole('region', { name: 'Start an application' });
    await newApplicationForm.getByLabel('Hotel name stated in this application').fill(hotelName);
    await newApplicationForm.getByLabel('Application notes').fill(applicantNotes);
    const createResponsePromise = applicant.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/hotels/applications'),
    );
    await applicant.page.getByRole('button', { name: 'Create private draft' }).click();
    const createResponse = await createResponsePromise;
    await expectStatus(createResponse, 201, 'Applicant draft creation');
    const created = (await createResponse.json()) as CreateApplicationResponse;
    if (typeof created.id !== 'string' || !created.id || created.status !== 'draft') {
      throw new Error('The API did not return the expected private draft contract.');
    }
    await expectUiApiResponse(applicant.apiResponses, 'POST', 'hotels/applications', 201);
    await expect(applicant.page.getByRole('heading', { name: hotelName })).toBeVisible();

    const applicationRoute = `hotels/applications/${encodeURIComponent(created.id)}`;
    const ownerRead = await authenticatedGet(applicant, applicationRoute);
    await expectStatus(ownerRead, 200, 'Applicant reads own application');
    const ownerProjection = (await ownerRead.json()) as Record<string, unknown>;
    for (const privateField of [
      'issuer',
      'subjectId',
      'profileId',
      'membershipId',
      'providerOrganizationId',
    ]) {
      if (privateField in ownerProjection) {
        throw new Error(
          'The applicant projection exposed an internal identity or organization field.',
        );
      }
    }

    const unadmittedWorkspace = await authenticatedGet(
      applicant,
      `hotels/workspace/${encodeURIComponent(created.id)}`,
    );
    await expectStatus(
      unadmittedWorkspace,
      404,
      'Unadmitted applicant workspace is non-enumerating',
    );
    await expectPrivateBodyDoesNotContain(
      unadmittedWorkspace,
      hotelName,
      'An unadmitted workspace response exposed private application content.',
    );

    const submitResponsePromise = applicant.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(`/api/hotels/applications/${created.id}/submit`),
    );
    await applicant.page.getByRole('button', { name: 'Submit this version for review' }).click();
    const submitResponse = await submitResponsePromise;
    await expectStatus(submitResponse, 201, 'Applicant submits the draft');
    const submitted = (await submitResponse.json()) as { status?: unknown };
    if (submitted.status !== 'submitted')
      throw new Error('The API did not return submitted status.');
    await expectUiApiResponse(
      applicant.apiResponses,
      'POST',
      `hotels/applications/${created.id}/submit`,
      201,
    );

    const bureau = await signInThroughKeycloak(
      browser,
      hotelE2eConfig.identities.bureauReviewer,
      '/bureau/hotel-cases',
    );
    actors.push(bureau);
    await expectUiApiResponse(bureau.apiResponses, 'GET', 'bureau/hotel-cases', 200);
    await expect(bureau.page.getByRole('heading', { name: hotelName })).toBeVisible();
    const bureauCaseCard = bureau.page
      .locator('article.application-card')
      .filter({ has: bureau.page.getByRole('heading', { name: hotelName }) });
    await expect(bureauCaseCard.locator('.status')).toHaveText('in review');
    await expect(bureau.page.getByText(applicantNotes)).toBeVisible();
    const bureauOwnerAttempt = await authenticatedGet(bureau, applicationRoute);
    await expectStatus(
      bureauOwnerAttempt,
      404,
      'Bureau reviewer cannot read applicant-owned application endpoint',
    );
    await expectPrivateBodyDoesNotContain(
      bureauOwnerAttempt,
      hotelName,
      'A non-owner application response exposed private application content.',
    );
    await expectStatus(
      await authenticatedGet(bureau, `admin/hotel-admissions`),
      403,
      'Bureau reviewer cannot read Administrator queue',
    );

    await bureauCaseCard.getByLabel('Decision for this submitted version').selectOption('approve');
    await bureauCaseCard.getByLabel('Reason').fill('Synthetic pilot Bureau review result.');
    const bureauDecisionPromise = bureau.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/bureau\/hotel-cases\/[^/]+\/decision$/.test(new URL(response.url()).pathname),
    );
    await bureauCaseCard.getByRole('button', { name: 'Record Bureau decision' }).click();
    const bureauDecisionResponse = await bureauDecisionPromise;
    await expectStatus(bureauDecisionResponse, 201, 'Scoped Bureau decision');
    expectConfiguredApiUrl(
      bureauDecisionResponse,
      /^bureau\/hotel-cases\/[^/]+\/decision$/,
      'Bureau decision',
    );
    await expectUiApiResponse(bureau.apiResponses, 'GET', 'bureau/hotel-cases', 200);

    const administrator = await signInThroughKeycloak(
      browser,
      hotelE2eConfig.identities.administrator,
      '/admin/hotel-admissions',
    );
    actors.push(administrator);
    await expectUiApiResponse(administrator.apiResponses, 'GET', 'admin/hotel-admissions', 200);
    await expect(administrator.page.getByRole('heading', { name: hotelName })).toBeVisible();
    const administratorApplicationCard = administrator.page
      .locator('article.application-card')
      .filter({ has: administrator.page.getByRole('heading', { name: hotelName }) });
    await expect(
      administratorApplicationCard.getByText(/Synthetic Bureau outcome: approve/i),
    ).toBeVisible();
    const administratorOwnerAttempt = await authenticatedGet(administrator, applicationRoute);
    await expectStatus(
      administratorOwnerAttempt,
      404,
      'Administrator cannot read applicant-owned application endpoint',
    );
    await expectPrivateBodyDoesNotContain(
      administratorOwnerAttempt,
      hotelName,
      'A non-owner application response exposed private application content.',
    );
    await expectStatus(
      await authenticatedGet(administrator, `bureau/hotel-cases`),
      403,
      'Administrator cannot read scoped Bureau queue',
    );
    await expectStatus(
      await authenticatedGet(administrator, `hotels/workspace/${encodeURIComponent(created.id)}`),
      404,
      'Administrator cannot read another account private workspace',
    );

    await administratorApplicationCard
      .getByLabel('Private platform admission decision')
      .selectOption('admit');
    await administratorApplicationCard
      .getByLabel('Reason', { exact: true })
      .fill('Synthetic pilot private workspace admission.');
    const admissionPromise = administrator.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(
          `/api/admin/hotel-admissions/${created.id}/decision`,
        ),
    );
    await administratorApplicationCard
      .getByRole('button', { name: 'Record private admission decision' })
      .click();
    const admissionResponse = await admissionPromise;
    await expectStatus(admissionResponse, 201, 'Administrator private admission');
    expectConfiguredApiUrl(
      admissionResponse,
      /^admin\/hotel-admissions\/[^/]+\/decision$/,
      'Administrator admission',
    );

    await expectStatus(
      await authenticatedGet(bureau, `hotels/workspace/${encodeURIComponent(created.id)}`),
      404,
      'Bureau reviewer cannot read admitted applicant private workspace',
    );
    await expectStatus(
      await authenticatedGet(administrator, `hotels/workspace/${encodeURIComponent(created.id)}`),
      404,
      'Administrator cannot read admitted applicant private workspace',
    );

    const returningApplicant = await signInThroughKeycloak(
      browser,
      hotelE2eConfig.identities.applicant,
      '/hotels',
    );
    actors.push(returningApplicant);
    await expectUiApiResponse(returningApplicant.apiResponses, 'GET', 'hotels/applications', 200);
    const applicationCard = returningApplicant.page
      .locator('article.application-card')
      .filter({ has: returningApplicant.page.getByRole('heading', { name: hotelName }) });
    await expect(applicationCard).toContainText('approved');
    await expect(applicationCard).toContainText('admitted');
    await applicationCard.getByRole('link', { name: 'Direct workspace link' }).click();
    await expectUiApiResponse(
      returningApplicant.apiResponses,
      'GET',
      `hotels/workspace/${created.id}`,
      200,
    );
    await expect(
      returningApplicant.page.getByRole('heading', { name: 'Admitted hotel workspace' }),
    ).toBeVisible();
    await expect(returningApplicant.page.getByText(hotelName)).toBeVisible();
    await expect(
      returningApplicant.page.getByText(
        /No listing, booking, subscription, or payment is enabled/i,
      ),
    ).toBeVisible();
  } finally {
    await Promise.all(actors.map((actor) => actor.close()));
  }
});
