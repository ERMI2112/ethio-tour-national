import 'reflect-metadata';
import { Module, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HotelOnboardingError, HotelOnboardingService } from '@ethio-tour/backend-domain';
import { KeycloakAuthGuard } from '../auth/keycloak-auth.guard';
import {
  AdministratorHotelAdmissionsController,
  BureauHotelCasesController,
  HotelApplicationsController,
} from './hotel-onboarding.controller';
import { HotelRequestBodyGuard } from './hotel-request-body.guard';
import { CreateHotelApplicationDto } from './hotel-onboarding.dto';

const hotels = {
  createApplication: vi.fn(async (_actor, request) => request),
  updateDraft: vi.fn(async (_actor, _id, _version, content) => ({ content })),
  submitApplication: vi.fn(async () => ({})),
  decideBureauCase: vi.fn(async () => {
    throw new HotelOnboardingError('forbidden', 'missing-scope');
  }),
  decideAdmission: vi.fn(async () => ({})),
  listLocations: vi.fn(async () => ({
    items: [{ id: 'location', label: 'Synthetic location', parentId: null, hierarchy: [] }],
  })),
  getBureauCase: vi.fn(async () => {
    throw new HotelOnboardingError('not_found', 'The private hotel application was not found.');
  }),
};

@Module({
  controllers: [
    HotelApplicationsController,
    BureauHotelCasesController,
    AdministratorHotelAdmissionsController,
  ],
  providers: [
    KeycloakAuthGuard,
    HotelRequestBodyGuard,
    { provide: HotelOnboardingService, useValue: hotels },
  ],
})
class HttpTestModule {}

let app: INestApplication;
let base: string;
const id = '3e1d52cc-83f1-4ce0-8fcb-59a488b83571';
const content = {
  claimedHotelName: 'Synthetic HTTP hotel',
  applicantNotes: '',
  administrativeUnitId: 'location',
};

beforeAll(async () => {
  vi.spyOn(KeycloakAuthGuard.prototype, 'canActivate').mockImplementation(
    async (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest();
      if (request.headers.authorization !== 'Bearer synthetic-test')
        throw new UnauthorizedException();
      request.registryActor = {
        issuer: 'https://identity.example.test',
        subjectId: 'synthetic-test',
      };
      return true;
    },
  );
  // Vitest's esbuild transform omits design metadata; reproduce tsc's body metadata.
  Reflect.defineMetadata(
    'design:paramtypes',
    [Object, CreateHotelApplicationDto],
    HotelApplicationsController.prototype,
    'create',
  );
  app = await NestFactory.create(HttpTestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }),
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  if (app) await app.close();
  vi.restoreAllMocks();
});

async function post(path: string, body: unknown) {
  return fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('hotel HTTP boundary with the actual global whitelist pipe', () => {
  it('requires authentication on the location directory', async () => {
    expect((await fetch(`${base}/api/hotels/locations`)).status).toBe(401);
    const result = await fetch(`${base}/api/hotels/locations`, {
      headers: { authorization: 'Bearer synthetic-test' },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ items: [{ id: 'location' }] });
  });
  it('preserves selected location through the global pipe and validates malformed content', async () => {
    const result = await post('hotels/applications', { content });
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ content });
    expect(
      (await post('hotels/applications', { content: { ...content, administrativeUnitId: null } }))
        .status,
    ).toBe(400);
  });
  it.each([
    'ownerProfileId',
    'applicantProfileId',
    'bureauOrganizationId',
    'scopeUnitId',
    'location',
    'locationSnapshot',
    'isSynthetic',
    'unexpected',
  ])('rejects raw top-level %s before stripping', async (key) => {
    expect((await post('hotels/applications', { content, [key]: 'forged' })).status).toBe(400);
  });
  it.each([
    'ownerProfileId',
    'organizationId',
    'bureauOrganizationId',
    'scopeUnitId',
    'locationSnapshot',
    'isSynthetic',
  ])('rejects raw nested %s before stripping', async (key) => {
    expect(
      (await post('hotels/applications', { content: { ...content, [key]: 'forged' } })).status,
    ).toBe(400);
  });
  it.each([
    `hotels/applications/${id}/revisions`,
    `hotels/applications/${id}/submit`,
    `bureau/hotel-cases/${id}/decision`,
    `admin/hotel-admissions/${id}/decision`,
  ])('rejects forged authority on %s', async (path) => {
    expect((await post(path, { expectedVersion: 1, bureauOrganizationId: 'forged' })).status).toBe(
      400,
    );
  });
  it('returns identical 404 details for unknown and inaccessible case IDs, and 403 for a denied known decision', async () => {
    const headers = { authorization: 'Bearer synthetic-test' };
    const known = await fetch(`${base}/api/bureau/hotel-cases/${id}`, { headers });
    const unknown = await fetch(
      `${base}/api/bureau/hotel-cases/62363e1a-c716-4454-9bc9-c6c336c9a17e`,
      { headers },
    );
    expect(known.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await known.json()).toEqual(await unknown.json());
    expect(
      (
        await post(`bureau/hotel-cases/${id}/decision`, {
          expectedVersion: 1,
          decision: 'approve',
          reason: 'Synthetic',
        })
      ).status,
    ).toBe(403);
  });
});
