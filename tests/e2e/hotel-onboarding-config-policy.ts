const allowedLoopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

export interface DisposableUrlOptions {
  apiPath?: string;
  requireRootPath?: boolean;
}

export function assertDisposableOptIn(value: string | undefined): void {
  if (value !== 'true') {
    throw new Error('HOTEL_E2E_DISPOSABLE must be explicitly set to true.');
  }
}

export function parseDisposableLoopbackUrl(
  name: string,
  value: string | undefined,
  options: DisposableUrlOptions = {},
): URL {
  if (!value) throw new Error(`${name} is required for the hotel acceptance journey.`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !allowedLoopbackHosts.has(hostname) ||
    url.port === '56320' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must use HTTP(S), an allowed loopback host and port, and no embedded credentials or query data.`,
    );
  }

  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
  if (options.apiPath && normalizedPath !== options.apiPath) {
    throw new Error(`${name} must identify the ${options.apiPath} base path.`);
  }
  if (options.requireRootPath && normalizedPath !== '/') {
    throw new Error(`${name} must identify the workspace origin without an application subpath.`);
  }

  url.pathname = normalizedPath;
  return url;
}
