import { describe, expect, it } from 'vitest'

import { acceptsHtml, negotiateAgentPage } from '@/lib/http/agent-content-negotiation'

function request(url: string, accept?: string, method = 'GET'): Request {
  return new Request(`https://ae.example${url}`, {
    method,
    ...(accept === undefined ? {} : { headers: { accept } }),
  })
}

describe('acceptsHtml', () => {
  it('treats a missing, empty, or wildcard Accept as a browser', () => {
    expect(acceptsHtml(null)).toBe(true)
    expect(acceptsHtml('   ')).toBe(true)
    expect(acceptsHtml('*/*')).toBe(true)
    expect(acceptsHtml('text/*')).toBe(true)
    expect(acceptsHtml('text/html,application/xhtml+xml;q=0.9,*/*;q=0.8')).toBe(true)
  })

  it('treats an Accept that excluded HTML as a machine caller', () => {
    expect(acceptsHtml('text/markdown')).toBe(false)
    expect(acceptsHtml('application/json')).toBe(false)
    expect(acceptsHtml('text/markdown;q=1.0, application/json;q=0.8')).toBe(false)
  })
})

describe('negotiateAgentPage', () => {
  it('serves markdown for a public page requested as markdown', () => {
    expect(negotiateAgentPage(request('/', 'text/markdown'))).toEqual({ kind: 'serve_markdown', path: '/' })
    expect(negotiateAgentPage(request('/registry', 'text/markdown'))).toEqual({ kind: 'serve_markdown', path: '/registry' })
    expect(negotiateAgentPage(request('/adelaide-locksmith', 'application/json')))
      .toEqual({ kind: 'serve_markdown', path: '/adelaide-locksmith' })
  })

  it('keeps the query string out of the negotiated path', () => {
    expect(negotiateAgentPage(request('/registry?q=plumber', 'text/markdown')))
      .toEqual({ kind: 'serve_markdown', path: '/registry' })
  })

  it('never intercepts a browser request', () => {
    expect(negotiateAgentPage(request('/', 'text/html')).kind).toBe('serve_html')
    expect(negotiateAgentPage(request('/')).kind).toBe('serve_html')
  })

  it('never intercepts a route that already answers machines', () => {
    for (const path of ['/api/businesses', '/api/v1/requests', '/llms.txt', '/SKILL.md', '/robots.txt', '/sitemap.xml', '/.well-known/ucp', '/adelaide-locksmith/ucp']) {
      expect(negotiateAgentPage(request(path, 'application/json')).kind).toBe('serve_html')
    }
  })

  it('never intercepts an operator surface, an asset, or a write', () => {
    expect(negotiateAgentPage(request('/owner/status', 'text/markdown')).kind).toBe('serve_html')
    expect(negotiateAgentPage(request('/admin/claims', 'text/markdown')).kind).toBe('serve_html')
    expect(negotiateAgentPage(request('/assets/app.css', 'text/markdown')).kind).toBe('serve_html')
    expect(negotiateAgentPage(request('/', 'text/markdown', 'POST')).kind).toBe('serve_html')
  })
})
