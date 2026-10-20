import type {
  CreateAttractionRequest,
  CreateDestinationRequest,
  CreateRevisionRequest,
  CreateHotelApplicationRequest,
  DecideHotelAdmissionRequest,
  DecideHotelApplicationRequest,
  HealthResponse,
  HotelAdmissionQueueResponse,
  HotelApplicationListResponse,
  HotelApplicationResponse,
  HotelBureauCaseListResponse,
  PrivateRegistryResourceResponse,
  PublicAttraction,
  PublicDestination,
  PublicRegistryList,
  PublishRevisionRequest,
  ReviewRevisionRequest,
  SubmitRevisionRequest,
  SubmitHotelApplicationRequest,
  UpdateHotelApplicationRequest,
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

export const API_UNAUTHORIZED_EVENT = 'ethio-tour:unauthorized';

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

export function createHotelApplication(
  request: CreateHotelApplicationRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationResponse> {
  return apiRequest('hotels/applications', 'POST', options, request);
}

export function getMyHotelApplications(
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationListResponse> {
  return apiRequest('hotels/applications', 'GET', options);
}

export function getMyHotelApplication(
  applicationId: string,
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationResponse> {
  return apiRequest(`hotels/applications/${encodeURIComponent(applicationId)}`, 'GET', options);
}

export function getAdmittedHotelWorkspace(
  applicationId: string,
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationResponse> {
  return apiRequest(`hotels/workspace/${encodeURIComponent(applicationId)}`, 'GET', options);
}

export function createHotelApplicationRevision(
  applicationId: string,
  request: UpdateHotelApplicationRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationResponse> {
  return apiRequest(
    `hotels/applications/${encodeURIComponent(applicationId)}/revisions`,
    'POST',
    options,
    request,
  );
}

export function submitHotelApplication(
  applicationId: string,
  request: SubmitHotelApplicationRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationResponse> {
  return apiRequest(
    `hotels/applications/${encodeURIComponent(applicationId)}/submit`,
    'POST',
    options,
    request,
  );
}

export function getBureauHotelCases(
  options: AuthenticatedApiRequestOptions,
): Promise<HotelBureauCaseListResponse> {
  return apiRequest('bureau/hotel-cases', 'GET', options);
}

export function decideHotelApplication(
  caseId: string,
  request: DecideHotelApplicationRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationResponse> {
  return apiRequest(
    `bureau/hotel-cases/${encodeURIComponent(caseId)}/decision`,
    'POST',
    options,
    request,
  );
}

export function getHotelAdmissionQueue(
  options: AuthenticatedApiRequestOptions,
): Promise<HotelAdmissionQueueResponse> {
  return apiRequest('admin/hotel-admissions', 'GET', options);
}

export function decideHotelAdmission(
  applicationId: string,
  request: DecideHotelAdmissionRequest,
  options: AuthenticatedApiRequestOptions,
): Promise<HotelApplicationResponse> {
  return apiRequest(
    `admin/hotel-admissions/${encodeURIComponent(applicationId)}/decision`,
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
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
    }
    throw new ApiClientError('The API request failed', response.status);
  }

  return (await response.json()) as T;
}
