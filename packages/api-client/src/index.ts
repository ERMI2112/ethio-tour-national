import type { HealthResponse } from '@ethio-tour/contracts';

export class ApiClientError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function getApiHealth(
  apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000/api',
): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`, { cache: 'no-store' });

  if (!response.ok) {
    throw new ApiClientError('The API health request failed', response.status);
  }

  return (await response.json()) as HealthResponse;
}
