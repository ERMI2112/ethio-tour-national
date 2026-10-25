export function corsAllowedOrigins(value = process.env.CORS_ALLOWED_ORIGINS): string[] {
  if (!value?.trim()) return [];

  return [
    ...new Set(
      value
        .split(',')
        .map((candidate) => candidate.trim())
        .filter(Boolean)
        .map(validateOrigin),
    ),
  ];
}

function validateOrigin(candidate: string): string {
  if (candidate === '*') {
    throw new Error('CORS_ALLOWED_ORIGINS must not contain a wildcard.');
  }

  const url = new URL(candidate);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.origin !== candidate
  ) {
    throw new Error(`CORS_ALLOWED_ORIGINS contains an invalid origin: ${candidate}`);
  }

  return url.origin;
}
