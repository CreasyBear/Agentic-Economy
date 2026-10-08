export type PublicDocumentationLinks = Readonly<{
  home: string
  customer: string
  authority: string
  recovery: string
  api: string
}>

/** Optional public docs root, configured by the deployer rather than a navigation URL. */
export function resolvePublicDocumentationLinks(value: string | undefined): PublicDocumentationLinks | undefined {
  if (value === undefined || value.trim() === '') return undefined
  let root: URL
  try { root = new URL(value.trim()) } catch { return undefined }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(root.hostname)
  if ((root.protocol !== 'https:' && !(root.protocol === 'http:' && loopback)) || root.username !== '' || root.password !== '' || root.search !== '' || root.hash !== '') return undefined
  root.pathname = root.pathname.replace(/\/+$/u, '') + '/'
  const page = (path: string) => new URL(path, root).href
  return {
    home: root.href.replace(/\/$/u, ''),
    customer: page('guides/customer'),
    authority: page('concepts/authority'),
    recovery: page('guides/recovery'),
    api: page('reference'),
  }
}
