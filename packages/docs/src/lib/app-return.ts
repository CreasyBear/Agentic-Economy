const canonicalAppOrigin = 'https://app.aecon.ai';

/** Navigation only: never accept a return target from a reader-provided URL. */
export function docsAppReturnUrl(value: string | undefined): string {
  let base: URL;
  try { base = new URL(value?.trim() || canonicalAppOrigin); } catch { base = new URL(canonicalAppOrigin); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback)) || base.username || base.password || base.search || base.hash || base.pathname !== '/') base = new URL(canonicalAppOrigin);
  return new URL('/market', base).href;
}
