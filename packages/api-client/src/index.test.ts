import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  API_UNAUTHORIZED_EVENT,
  createDestination,
  createHotelApplication,
  decideHotelApplication,
  getAdmittedHotelWorkspace,
  getApiHealth,
  getHotelLocations,
  searchHotelLocations,
  getHotelBureauCase,
  getPublicDestinations,
} from './index';

describe('API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('loads only minimal server-owned hotel location labels through the protected API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetchMock);
    await getHotelLocations({ apiBaseUrl: 'http://api:4000/api', accessToken: 'synthetic-token' });
    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/hotels/locations', {
      method: 'GET',
      cache: 'no-store',
      headers: { authorization: 'Bearer synthetic-token' },
    });
  });

  it('searches a pinned hotel geography release through bounded API query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          directoryRelease: {
            id: 'release-a',
            sourceEdition: 'synthetic-2026-01',
            effectiveFrom: null,
            synthetic: true,
          },
          items: [],
          nextCursor: null,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await searchHotelLocations(
      { query: 'Gondar / town', language: 'am-Ethi', limit: 20, cursor: 'opaque+/=' },
      { apiBaseUrl: 'http://api:4000/api', accessToken: 'synthetic-token' },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api:4000/api/hotels/locations?query=Gondar+%2F+town&language=am-Ethi&limit=20&cursor=opaque%2B%2F%3D',
      {
        method: 'GET',
        cache: 'no-store',
        headers: { authorization: 'Bearer synthetic-token' },
      },
    );
  });

  it('encodes a private Bureau case ID without choosing an office or scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await getHotelBureauCase('case/1', {
      apiBaseUrl: 'http://api:4000/api',
      accessToken: 'synthetic-token',
    });
    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/bureau/hotel-cases/case%2F1', {
      method: 'GET',
      cache: 'no-store',
      headers: { authorization: 'Bearer synthetic-token' },
    });
  });

  it('preserves a structured stale-directory error without exposing server error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ code: 'LOCATION_RELEASE_STALE', message: 'Server-only detail' }),
            { status: 409 },
          ),
        ),
    );
    await expect(
      searchHotelLocations(
        {},
        {
          apiBaseUrl: 'http://api:4000/api',
          accessToken: 'synthetic-token',
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'LOCATION_RELEASE_STALE',
      message: 'The API request failed',
    });
  });

  it('prefers the explicit public API URL for browser requests over the internal API URL', async () => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:55473/api');
    vi.stubEnv('API_BASE_URL', 'http://api:4000/api');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getPublicDestinations();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:55473/api/public/destinations', {
      method: 'GET',
      cache: 'no-store',
      headers: {},
    });
  });

  it('prefers the internal API URL for server callers when a public URL is also configured', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:55473/api');
    vi.stubEnv('API_BASE_URL', 'http://api:4000/api');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getApiHealth();

    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/health', expect.any(Object));
  });

  it('falls back to the public API URL for a local server without an internal URL', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:55473/api');
    vi.stubEnv('API_BASE_URL', '');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getPublicDestinations();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:55473/api/public/destinations',
      expect.any(Object),
    );
  });

  it('does not use the internal API URL in a browser without public configuration', async () => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubEnv('API_BASE_URL', 'http://api:4000/api');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getPublicDestinations();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/public/destinations',
      expect.any(Object),
    );
  });

  it('reads health only through the configured API base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'api',
          status: 'ok',
          phase: '1B',
          timestamp: new Date().toISOString(),
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getApiHealth('http://api:4000/api');

    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/health', {
      method: 'GET',
      cache: 'no-store',
      headers: {},
    });
  });

  it('loads only public API projections without requesting infrastructure directly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getPublicDestinations({ apiBaseUrl: 'http://api:4000/api/' });

    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/public/destinations', {
      method: 'GET',
      cache: 'no-store',
      headers: {},
    });
  });

  it('sends protected mutations to the API with the typed request and bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'resource-1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = {
      organizationId: 'demo-org-woreda-gondar',
      administrativeUnitId: 'demo-unit-woreda-gondar',
      content: { title: 'Synthetic', summary: 'Demo text' },
    };

    await createDestination(request, {
      apiBaseUrl: 'http://api:4000/api',
      accessToken: 'test-token',
    });

    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/registry/destinations', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify(request),
    });
  });

  it('sends only applicant content to the private hotel application API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'application-1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = {
      content: { claimedHotelName: 'Synthetic hotel', applicantNotes: 'Pilot-only.' },
    };

    await createHotelApplication(request, {
      apiBaseUrl: 'http://api:4000/api',
      accessToken: 'test-token',
    });

    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/hotels/applications', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify(request),
    });
  });

  it('signals session invalidation when the API rejects an expired bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const browserEvents = new EventTarget();
    const listener = vi.fn();
    browserEvents.addEventListener(API_UNAUTHORIZED_EVENT, listener);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', browserEvents);

    await expect(
      getAdmittedHotelWorkspace('application-1', {
        apiBaseUrl: 'http://api:4000/api',
        accessToken: 'expired-token',
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sends Bureau decisions only to the case decision route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'application-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = {
      expectedVersion: 2,
      decision: 'approve' as const,
      reason: 'Synthetic review.',
    };

    await decideHotelApplication('case-id', request, {
      apiBaseUrl: 'http://api:4000/api',
      accessToken: 'test-token',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api:4000/api/bureau/hotel-cases/case-id/decision',
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test-token',
        },
        body: JSON.stringify(request),
      },
    );
  });

  it('loads an admitted provider workspace through the authenticated API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'application/1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getAdmittedHotelWorkspace('application/1', {
      apiBaseUrl: 'http://api:4000/api',
      accessToken: 'test-token',
    });

    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/hotels/workspace/application%2F1', {
      method: 'GET',
      cache: 'no-store',
      headers: { authorization: 'Bearer test-token' },
    });
  });
});
