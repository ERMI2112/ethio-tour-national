import type {
  CreateAttractionRequest,
  CreateDestinationRequest,
  CreateRevisionRequest,
  HealthResponse,
  PrivateRegistryResourceResponse,
  PublicAttraction,
  PublicDestination,
  PublicRegistryList,
  PublishRevisionRequest,
  ReviewRevisionRequest,
  SubmitRevisionRequest,
  WithdrawPublicationRequest,
} from '@ethio-tour/contracts';

export interface ApiRequestOptions {
  apiBaseUrl?: string;
  accessToken?: string;
}

export interface AuthenticatedApiRequestOptions extends ApiRequestOptions {
  accessToken: string;
}

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
  return apiRequest('health', 'GET', { apiBaseUrl });
}

export function getPublicDestinations(
  options: ApiRequestOptions = {},
): Promise<PublicRegistryList<PublicDestination>> {
  return apiRequest('public/destinations', 'GET', options);
}

export function getPublicDestination(
  resourceId: string,
  options: ApiRequestOptions = {},
): Promise<PublicDestination> {
  return apiRequest(`public/destinations/${encodeURIComponent(resourceId)}`, 'GET', options);
}

export function getPublicAttractions(
  options: ApiRequestOptions = {},
): Promise<PublicRegistryList<PublicAttraction>> {
  return apiRequest('public/attractions', 'GET', options);
}

export function getPublicAttraction(
  resourceId: string,
  options: ApiRequestOptions = {},
): Promise<PublicAttraction> {
  return apiRequest(`public/attractions/${encodeURIComponent(resourceId)}`, 'GET', options);
}

export function getPrivateRegistryResource(
  resourceId: string,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest(`registry/${encodeURIComponent(resourceId)}`, 'GET', options);
}

export function createDestination(
  request: CreateDestinationRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest('registry/destinations', 'POST', options, request);
}

export function createAttraction(
  request: CreateAttractionRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest('registry/attractions', 'POST', options, request);
}

export function createRegistryRevision(
  resourceId: string,
  request: CreateRevisionRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest(
    `registry/${encodeURIComponent(resourceId)}/revisions`,
    'POST',
    options,
    request,
  );
}

export function submitRegistryRevision(
  resourceId: string,
  request: SubmitRevisionRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest(`registry/${encodeURIComponent(resourceId)}/submit`, 'POST', options, request);
}

export function reviewRegistryRevision(
  resourceId: string,
  request: ReviewRevisionRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest(`registry/${encodeURIComponent(resourceId)}/review`, 'POST', options, request);
}

export function publishRegistryRevision(
  resourceId: string,
  request: PublishRevisionRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest(`registry/${encodeURIComponent(resourceId)}/publish`, 'POST', options, request);
}

export function withdrawRegistryPublication(
  resourceId: string,
  request: WithdrawPublicationRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<PrivateRegistryResourceResponse> {
  return apiRequest(
    `registry/${encodeURIComponent(resourceId)}/withdraw`,
    'POST',
    options,
    request,
  );
}

async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  options: ApiRequestOptions,
  body?: unknown,
): Promise<T> {
  const apiBaseUrl = options.apiBaseUrl ?? process.env.API_BASE_URL ?? 'http://localhost:4000/api';
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
  const init: RequestInit = { method, cache: 'no-store', headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/${path}`, init);

  if (!response.ok) {
    throw new ApiClientError('The API request failed', response.status);
  }

  return (await response.json()) as T;
}
