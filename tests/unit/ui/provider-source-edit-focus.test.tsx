// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
afterEach(cleanup)
it('focuses Source after Edit without taking initial focus or executing a preview', async () => {
  const preview = vi.fn()
  const source = { kind: 'x402' as const, resourceUrl: 'https://seller.example/tool', method: 'GET' as const, environment: 'sandbox' as const }
  render(<AeSupplySourceNativeStart businessRef="business:one" onPreview={preview} onConnect={vi.fn()} onSelectCandidate={vi.fn()} onPublish={vi.fn()} initial={{ source, candidateRef: 'candidate', preview: { kind: 'ready', sourceDigest: 'digest', sourceRevision: 'revision', provenance: { sourceKind: 'x402', sourceUrl: source.resourceUrl, authority: 'observed_external' }, authentication: [{ kind: 'public' }], candidates: [{ candidateRef: 'candidate', sourceSelector: { resourceUrl: source.resourceUrl, method: source.method }, title: 'Tool', description: 'Observed Tool', disposition: { kind: 'supported' }, authentication: { kind: 'public' }, validationExampleAvailable: true }] } }} />)
  expect(document.activeElement).toBe(document.body)
  fireEvent.click(screen.getByRole('button', { name: /Edit Source/i }))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Add Tool' })))
  expect(preview).not.toHaveBeenCalled()
})
