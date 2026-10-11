// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@tanstack/react-start', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tanstack/react-start')>()), useServerFn: (fn: unknown) => fn }))
vi.mock('@clerk/tanstack-react-start', () => ({ useReverification: (fn: unknown) => fn }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({ AeOperatorPage: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/ae/layout/AeNavigationSafetyBoundary', () => ({ AeNavigationSafetyBoundary: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({ filterOwnerSupplyAuthorityOptions: (_business: string, connections: unknown[]) => connections, assessOwnerSupplySourceServer: vi.fn(), previewOwnerSupplySourceServer: vi.fn(), publishOwnerSupplySourceServer: vi.fn(), saveOwnerSupplySourceDraftServer: vi.fn().mockResolvedValue({ kind: 'saved' }), readOwnerProviderConnectionsServer: vi.fn(), resumeOwnerSupplySourceDraftServer: vi.fn(), startOwnerSupplySourceConnectionServer: vi.fn() }))
import { AeOwnerSupplySourceStartPage, type AeOwnerSupplySourceStartPageProps } from '@/components/ae/supply/AeOwnerSupplySourceStartPage'
afterEach(cleanup)
function props(draft: string): AeOwnerSupplySourceStartPageProps {
  const source = { kind: 'x402' as const, resourceUrl: `https://seller.example/${draft}`, method: 'GET' as const, environment: 'sandbox' as const }
  const candidate = { candidateRef: draft, sourceSelector: { resourceUrl: source.resourceUrl, method: source.method }, title: draft, description: 'Observed description', authentication: { kind: 'public' as const }, validationExampleAvailable: true, disposition: { kind: 'supported' as const } }
  return { search: { draft }, navigate: vi.fn(), data: {
    identity: { kind: 'available', businessId: 'business:one' } as AeOwnerSupplySourceStartPageProps['data']['identity'], connections: [], resumeRequested: true, sourceUnavailable: false,
    resume: { kind: 'available', candidateRef: draft, source, preview: { kind: 'ready', sourceDigest: 'digest', sourceRevision: 'revision', provenance: { sourceKind: 'x402', sourceUrl: source.resourceUrl, authority: 'observed_external' }, authentication: [{ kind: 'public' }], candidates: [candidate] }, terms: { name: draft, description: 'Saved description', category: 'Research', serviceArea: '', availability: '', pricingKind: 'free', price: '', externalEffect: false, dataRelease: false, financialExposure: false, dataClassification: 'public' } },
  } }
}
it('reconciles the visible saved terms after changing draft URLs and clears stale forms when Add Tool starts anew', async () => {
  const view = render(<AeOwnerSupplySourceStartPage {...props('Draft A')} />)
  expect((screen.getByLabelText('Tool name') as HTMLInputElement).value).toBe('Draft A')
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
  const originalAuthority = await screen.findByRole('checkbox', { name: 'I am authorised to list this endpoint for this business' })
  fireEvent.click(originalAuthority)
  expect(originalAuthority.getAttribute('aria-checked')).toBe('true')
  view.rerender(<AeOwnerSupplySourceStartPage {...props('Draft B')} />)
  expect((screen.getByLabelText('Tool name') as HTMLInputElement).value).toBe('Draft B')
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
  expect((await screen.findByRole('checkbox', { name: 'I am authorised to list this endpoint for this business' })).getAttribute('aria-checked')).toBe('false')
  const fresh = props('unused')
  view.rerender(<AeOwnerSupplySourceStartPage {...fresh} search={{}} data={{ ...fresh.data, resume: { kind: 'not_found' }, resumeRequested: false }} />)
  expect(screen.queryByLabelText('Tool name')).toBeNull()
  expect((screen.getByLabelText('x402 resource URL') as HTMLInputElement).value).toBe('')
})

it('retains later-page inventory context in the saved setup reopening URL', () => {
  const input = props('sha256:exact-draft')
  render(<AeOwnerSupplySourceStartPage {...input} search={{ ...input.search, inventoryQ: 'weather forecast', inventorySort: 'relevance', inventoryCursor: 'opaque:+/=' }} />)
  const reopen = new URL(screen.getByRole('link', { name: 'Reopen this saved setup' }).getAttribute('href')!, 'https://aecon.test')
  expect(reopen.searchParams.get('draft')).toBe('sha256:exact-draft')
  expect(reopen.searchParams.get('inventoryCursor')).toBe('opaque:+/=')
  expect(reopen.searchParams.get('inventoryQ')).toBe('weather forecast')
})
