import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { requiresChatProviders } from '@/routes/__root'

const source = readFileSync(
  fileURLToPath(new URL('../../../src/routes/__root.tsx', import.meta.url)),
  'utf8',
)

describe('operation chat provider boundary', () => {
  it('selects only thread and share routes', () => {
    expect(requiresChatProviders('/t/new')).toBe(true)
    expect(requiresChatProviders('/t/thread-1')).toBe(true)
    expect(requiresChatProviders(`/s/${'a'.repeat(64)}`)).toBe(true)
    expect(requiresChatProviders('/market')).toBe(false)
    expect(requiresChatProviders('/api/chat/anonymous')).toBe(false)
  })

  it('nests Convex inside Clerk using the installed integration', () => {
    expect(source).toContain("import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'")
    expect(source).toContain("import { ConvexProviderWithClerk } from 'convex/react-clerk'")
    expect(source).toMatch(/<ClerkProvider[^>]*>[\s\S]*<ChatConvexProvider>\{children\}<\/ChatConvexProvider>[\s\S]*<\/ClerkProvider>/u)
    expect(source).toContain('<ConvexProviderWithClerk client={client} useAuth={useAuth}>')
  })

  it('does not bypass chat providers in local E2E mode', () => {
    expect(source).toMatch(/const content = requiresChatProviders\(pathname\)[\s\S]*: isLocalE2EAuthBypassEnabled\(\)/u)
  })

  it('constructs Convex lazily and renders an accessible missing-config state', () => {
    expect(source).toContain("const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()")
    expect(source).toContain('useState(() => new ConvexReactClient(convexUrl))')
    expect(source).toContain('role="status"')
    expect(source).toContain('Chat is unavailable')
    expect(source).toContain('The chat service is not configured.')
  })
})
