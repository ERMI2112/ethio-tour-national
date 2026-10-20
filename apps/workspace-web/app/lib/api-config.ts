export function getClientApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configuredUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be configured for workspace-web.');
  }
  return configuredUrl;
}
