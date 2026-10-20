import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDestination,
  createHotelApplication,
  decideHotelApplication,
  getAdmittedHotelWorkspace,
  getApiHealth,
  getPublicDestinations,
} from './index';

describe('API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
