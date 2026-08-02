import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

/**
 * A cold agent that fetches a page route with `Accept: text/markdown` used to
 * receive a framework 500 (`Only HTML requests are supported here`), because
 * the SSR handler only serves HTML and wildcard Accept headers. Rendering the
 * same public page as markdown costs nothing and turns that dead end into the
 * document the caller was asking for.
 *
 * This is negotiation, not a second product surface: the markdown is projected
 * from the same source reads the HTML page uses.
 */

/** Route prefixes that already answer machines, or that never answer them. */
const reservedPathPrefixes = [
  '/api/',
  '/_serverFn/',
  '/_build/',
  '/assets/',
  '/.well-known/',
  '/oauth/',
  '/agent-access',
  '/admin/',
  '/owner/',
  '/sign-in',
  '/sign-up',
] as const

/** Exact paths that already serve a machine-readable document of their own. */
const reservedPaths = [
  '/llms.txt',
  '/robots.txt',
  '/sitemap.xml',
  '/SKILL.md',
  '/mcp',
] as const

/**
 * `/{slug}/ucp` and `/{slug}/tools/{id}` already answer machines under a
 * business slug, so they are reserved by suffix rather than by prefix.
 */
const reservedPathSuffixes = ['/ucp'] as const
const reservedPathSegments = ['/tools/'] as const

export type AgentPageNegotiation =
  | Readonly<{ kind: 'serve_html' }>
  | Readonly<{ kind: 'serve_markdown'; path: string }>

/**
 * A wildcard and `text/html` both mean "a browser will do", so only a caller
 * that excluded HTML is asking for something else.
 */
export function acceptsHtml(accept: string | null): boolean {
  const header = accept === null || accept.trim().length === 0 ? '*/*' : accept
  return header
    .split(',')
    .some((part) => {
      const mediaType = part.split(';')[0]?.trim().toLowerCase() ?? ''
      return mediaType === '*/*' || mediaType === 'text/*' || mediaType === 'text/html'
    })
}

export function negotiateAgentPage(request: Request): AgentPageNegotiation {
  if (request.method !== 'GET' && request.method !== 'HEAD') return { kind: 'serve_html' }
  if (acceptsHtml(request.headers.get('accept'))) return { kind: 'serve_html' }

  // The router presents `/SKILL.md` as `/SKILL.md/`, so normalize before matching.
  const rawPath = new URL(request.url).pathname
  const path = rawPath.length > 1 ? trimTrailingSlashes(rawPath) : rawPath
  if (reservedPaths.some((reserved) => path === reserved)) return { kind: 'serve_html' }
  if (reservedPathPrefixes.some((prefix) => path.startsWith(prefix))) return { kind: 'serve_html' }
  if (reservedPathSuffixes.some((suffix) => path.endsWith(suffix))) return { kind: 'serve_html' }
  if (reservedPathSegments.some((segment) => path.includes(segment))) return { kind: 'serve_html' }
  // A dotted final segment is an asset request, not a page.
  if (path.split('/').at(-1)?.includes('.') === true) return { kind: 'serve_html' }

  return { kind: 'serve_markdown', path }
}

export function agentMarkdownResponse(body: string, status: 200 | 404 | 406 = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vary': 'Accept',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
