import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import {
  assertDisposableOptIn,
  parseDisposableLoopbackUrl,
} from './hotel-onboarding-config-policy';

export interface HotelE2eIdentity {
  username: string;
  password: string;
}

export interface HotelE2eIdentities {
  applicant: HotelE2eIdentity;
  bureauReviewer: HotelE2eIdentity;
  administrator: HotelE2eIdentity;
}

export interface HotelE2eConfiguration {
  workspaceUrl: URL;
  apiUrl: URL;
  keycloakIssuerUrl: URL;
  identities: HotelE2eIdentities;
}

function requiredUrl(name: string, mustEndWithApi = false): URL {
  const options = mustEndWithApi
    ? { apiPath: '/api' }
    : name === 'HOTEL_E2E_WORKSPACE_URL'
      ? { requireRootPath: true }
      : {};
  return parseDisposableLoopbackUrl(name, process.env[name], options);
}

function isWithin(parent: string, child: string): boolean {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..')
  );
}

function identityFrom(value: unknown): HotelE2eIdentity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const identity = value as Record<string, unknown>;
  if (
    typeof identity.username !== 'string' ||
    !identity.username.trim() ||
    identity.username !== identity.username.trim() ||
    [...identity.username].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20 || codePoint === 0x7f;
    }) ||
    typeof identity.password !== 'string' ||
    identity.password.length === 0 ||
    Object.keys(identity).some((key) => !['username', 'password'].includes(key))
  ) {
    return null;
  }
  return { username: identity.username, password: identity.password };
}

function loadIdentities(): HotelE2eIdentities {
  const configuredPath = process.env.HOTEL_E2E_IDENTITIES_FILE;
  if (!configuredPath) {
    throw new Error(
      'HOTEL_E2E_IDENTITIES_FILE must point to a secure identity file outside the repository.',
    );
  }
  if (!isAbsolute(configuredPath)) {
    throw new Error('HOTEL_E2E_IDENTITIES_FILE must be an absolute path outside the repository.');
  }

  let identityPath: string;
  let identityFile: string;
  try {
    const repositoryRoot = realpathSync(process.cwd());
    identityPath = realpathSync(configuredPath);
    if (isWithin(repositoryRoot, identityPath)) {
      throw new Error('inside repository');
    }
    identityFile = readFileSync(identityPath, 'utf8');
  } catch {
    throw new Error(
      'The configured hotel identity file must exist outside the repository and be readable.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(identityFile);
  } catch {
    throw new Error(
      'The hotel identity file must contain valid JSON with three synthetic identities.',
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'The hotel identity file must contain applicant, bureauReviewer, and administrator entries.',
    );
  }
  const input = parsed as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['applicant', 'bureauReviewer', 'administrator'].includes(key),
    )
  ) {
    throw new Error(
      'The hotel identity file may contain only the three required synthetic account entries.',
    );
  }
  const applicant = identityFrom(input.applicant);
  const bureauReviewer = identityFrom(input.bureauReviewer);
  const administrator = identityFrom(input.administrator);
  if (!applicant || !bureauReviewer || !administrator) {
    throw new Error('Each synthetic identity must contain a non-empty username and password.');
  }

  const usernames = [applicant.username, bureauReviewer.username, administrator.username];
  if (new Set(usernames.map((username) => username.toLocaleLowerCase('en-US'))).size !== 3) {
    throw new Error(
      'Applicant, Bureau reviewer, and Administrator must be three distinct Keycloak accounts.',
    );
  }

  return { applicant, bureauReviewer, administrator };
}

assertDisposableOptIn(process.env.HOTEL_E2E_DISPOSABLE);

export const hotelE2eConfig: HotelE2eConfiguration = {
  workspaceUrl: requiredUrl('HOTEL_E2E_WORKSPACE_URL'),
  apiUrl: requiredUrl('HOTEL_E2E_API_URL', true),
  keycloakIssuerUrl: requiredUrl('HOTEL_E2E_KEYCLOAK_ISSUER_URL'),
  identities: loadIdentities(),
};

if (process.env.PWDEBUG || /(?:^|,)\s*pw:|playwright/i.test(process.env.DEBUG ?? '')) {
  throw new Error('Disable Playwright debug logging for the credential-bearing hotel journey.');
}
