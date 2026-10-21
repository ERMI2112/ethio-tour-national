import 'reflect-metadata';

import { Module, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { HotelOnboardingService } from '@ethio-tour/backend-domain';

import { KeycloakAuthGuard } from '../auth/keycloak-auth.guard';
import { HotelApplicationsController } from './hotel-onboarding.controller';
import { HotelLocationSearchQueryDto } from './hotel-onboarding.dto';
import { HotelRequestBodyGuard } from './hotel-request-body.guard';

const listLocations = vi.fn(async () => ({
  directoryRelease: {
    id: 'synthetic-a',
    sourceEdition: 'test',
    effectiveFrom: null,
    synthetic: true,
  },
  items: [],
  nextCursor: null,
}));

@Module({
  controllers: [HotelApplicationsController],
  providers: [
    HotelRequestBodyGuard,
    KeycloakAuthGuard,
    { provide: HotelOnboardingService, useValue: { listLocations } },
  ],
})
class QueryTestModule {}

describe('hotel location HTTP query validation', () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    vi.spyOn(KeycloakAuthGuard.prototype, 'canActivate').mockImplementation(
      async (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest<{
          headers: { authorization?: string };
          registryActor?: unknown;
        }>();
        // This fixture belongs only to the in-process HTTP validation tests.
        if (request.headers.authorization !== 'Bearer synthetic-http-test')
          throw new UnauthorizedException();
        request.registryActor = { issuer: 'https://synthetic.example.test', subjectId: 'test' };
        return true;
      },
    );
    // Vitest's esbuild transform omits decorator type metadata; set the same
    // metadata emitted by tsc so this exercises Nest's actual route/global pipes.
    Reflect.defineMetadata(
      'design:paramtypes',
      [Object, HotelLocationSearchQueryDto],
      HotelApplicationsController.prototype,
      'locations',
    );
    app = await NestFactory.create(QueryTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  async function request(query: string, authenticated = true) {
    return fetch(`${base}/api/hotels/locations${query}`, {
      headers: authenticated ? { authorization: 'Bearer synthetic-http-test' } : {},
    });
  }

  it('requires authentication', async () => {
    expect((await request('', false)).status).toBe(401);
  });

  it('accepts bounded search parameters through the real Nest pipes', async () => {
    expect((await request('?query=Central&language=en&limit=2')).status).toBe(200);
    expect(listLocations).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ query: 'Central', language: 'en', limit: 2 }),
    );
  });

  it.each([
    '?bureauOrganizationId=forged',
    '?scopeUnitId=forged',
    '?geographyReleaseId=forged',
    '?page=2',
    '?limit=0',
    '?limit=51',
    '?limit=1.5',
    '?query=one&query=two',
    `?query=${'x'.repeat(101)}`,
  ])('rejects unsupported or invalid input %s before invoking the service', async (query) => {
    const before = listLocations.mock.calls.length;
    expect((await request(query)).status).toBe(400);
    expect(listLocations.mock.calls.length).toBe(before);
  });
});
