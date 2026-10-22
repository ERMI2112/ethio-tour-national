export function getPublicUrl(): string {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_PUBLIC_URL || 'http://localhost:3000');
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
    throw new Error('NEXT_PUBLIC_PUBLIC_URL must be an HTTP(S) application origin.');
  }
}
