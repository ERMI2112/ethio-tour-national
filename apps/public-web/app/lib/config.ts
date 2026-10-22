export function getWorkspaceUrl(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_WORKSPACE_URL;
  if (!configuredOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_WORKSPACE_URL is required for production builds.');
  }
  try {
    const url = new URL(configuredOrigin || 'http://localhost:3001');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/*$/.test(url.pathname)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error('NEXT_PUBLIC_WORKSPACE_URL must be an HTTP(S) application origin.');
  }
}
