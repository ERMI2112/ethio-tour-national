import { afterEach, describe, expect, it, vi } from 'vitest';

import { getApiHealth } from './index';

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
          phase: '1A',
          timestamp: new Date().toISOString(),
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getApiHealth('http://api:4000/api');

    expect(fetchMock).toHaveBeenCalledWith('http://api:4000/api/health', {
      cache: 'no-store',
    });
  });
});
