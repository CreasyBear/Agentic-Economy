// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'

afterEach(cleanup)

const digest = `sha256:${'a'.repeat(64)}`

describe('Add Tool', () => {
  it('shows one public x402 URL and no other source, price, or environment choice', () => {
    render(<AeSupplySourceNativeStart businessRef="business:one" onPreview={vi.fn()} onConnect={vi.fn()} onSelectCandidate={vi.fn()} onPublish={vi.fn()} />)
    expect(screen.getByLabelText('x402 resource URL')).toBeTruthy()
    expect(screen.queryByText('OpenAPI')).toBeNull()
    expect(screen.queryByText('MCP')).toBeNull()
    expect(screen.queryByText('Agent Plugin')).toBeNull()
    expect(screen.queryByText('Sandbox')).toBeNull()
    expect(screen.queryByText('Production')).toBeNull()
    expect(screen.queryByText('Free')).toBeNull()
    expect(screen.queryByLabelText('AUD price')).toBeNull()
  })

  it('shows the challenge payee and the payee-proof action after preview', async () => {
    const onPreview = vi.fn().mockResolvedValue({
      kind: 'ready',
      sourceDigest: digest,
      sourceRevision: `x402:${digest}`,
      provenance: { sourceKind: 'x402', sourceUrl: 'https://api.onesource.io/api/chain/block-number', authority: 'observed_external' },
      authentication: [{ kind: 'x402_wallet' }],
      candidates: [{
        candidateRef: digest,
        sourceSelector: { resourceUrl: 'https://api.onesource.io/api/chain/block-number', method: 'GET' },
        title: 'Block number',
        description: 'Current block',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: { value: { type: 'string' } } },
        authentication: { kind: 'x402_wallet' },
        validationExampleAvailable: true,
        x402: {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '1000',
          asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          payTo: '0x1111111111111111111111111111111111111111',
          environment: 'production',
        },
        disposition: { kind: 'supported' },
      }],
    })
    const onSelectCandidate = vi.fn().mockResolvedValue({ kind: 'saved' })
    render(<AeSupplySourceNativeStart businessRef="business:one" onPreview={onPreview} onConnect={vi.fn()} onSelectCandidate={onSelectCandidate} onPublish={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('x402 resource URL'), { target: { value: 'https://api.onesource.io/api/chain/block-number' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(await screen.findByText(/0x1111111111111111111111111111111111111111/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Select Block number' }))
    expect(await screen.findByRole('button', { name: 'Prove payTo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    expect(await screen.findByText('Choose a connected source before submitting this Tool.')).toBeTruthy()
    expect(screen.queryByLabelText('The information is accurate')).toBeNull()
  })

  it('asks for the request method only after both challenges are payable', async () => {
    const onPreview = vi.fn()
      .mockResolvedValueOnce({
        kind: 'action_required',
        requiredAction: {
          action: 'supply.source.preview',
          blockedCapabilities: ['supply.publish'],
          cta: null,
          ctaLabel: 'Check source',
          description: 'Both GET and POST returned an x402 payment challenge. Choose one method, then preview again.',
          iconUrl: null,
          status: 'required',
          title: 'Choose the request method',
        },
      })
      .mockResolvedValueOnce({
        kind: 'ready',
        sourceDigest: digest,
        sourceRevision: `x402:${digest}`,
        provenance: { sourceKind: 'x402', sourceUrl: 'https://api.onesource.io/api/chain/block-number', authority: 'observed_external' },
        authentication: [{ kind: 'x402_wallet' }],
        candidates: [{
          candidateRef: digest,
          sourceSelector: { resourceUrl: 'https://api.onesource.io/api/chain/block-number', method: 'GET' },
          title: 'Block number',
          description: 'Current block',
          authentication: { kind: 'x402_wallet' },
          validationExampleAvailable: true,
          x402: {
            scheme: 'exact',
            network: 'eip155:8453',
            amount: '1000',
            asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            payTo: '0x52e29e0d2aa49bfbfc548c0a9f2196f4aa51f3ea',
            environment: 'production',
          },
          disposition: { kind: 'supported' },
        }],
      })
    render(<AeSupplySourceNativeStart businessRef="business:one" onPreview={onPreview} onConnect={vi.fn()} onSelectCandidate={vi.fn()} onPublish={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('x402 resource URL'), { target: { value: 'https://api.onesource.io/api/chain/block-number' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(await screen.findByText('Choose the request method')).toBeTruthy()
    expect(onPreview.mock.calls[0]?.[0]).toEqual({ kind: 'x402', resourceUrl: 'https://api.onesource.io/api/chain/block-number' })
    expect(screen.queryByRole('radio', { name: 'GET' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'GET' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(await screen.findByText(/0x52e29e0d2aa49bfbfc548c0a9f2196f4aa51f3ea/)).toBeTruthy()
    expect(onPreview.mock.calls[1]?.[0]).toEqual({
      kind: 'x402',
      resourceUrl: 'https://api.onesource.io/api/chain/block-number',
      method: 'GET',
    })
  })

  it('drops the derived method and environment when the resource URL changes', async () => {
    const ready = {
      kind: 'ready' as const,
      sourceDigest: digest,
      sourceRevision: `x402:${digest}`,
      provenance: { sourceKind: 'x402' as const, sourceUrl: 'https://api.onesource.io/api/chain/block-number', authority: 'observed_external' as const },
      authentication: [{ kind: 'x402_wallet' as const }],
      candidates: [{
        candidateRef: digest,
        sourceSelector: { resourceUrl: 'https://api.onesource.io/api/chain/block-number', method: 'GET' as const },
        title: 'Block number',
        description: 'Current block',
        authentication: { kind: 'x402_wallet' as const },
        validationExampleAvailable: true,
        x402: {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '1000',
          asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          payTo: '0x52e29e0d2aa49bfbfc548c0a9f2196f4aa51f3ea',
          environment: 'production' as const,
        },
        disposition: { kind: 'supported' as const },
      }],
    }
    const onPreview = vi.fn()
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce({
        kind: 'action_required',
        requiredAction: {
          action: 'supply.source.preview',
          blockedCapabilities: ['supply.publish'],
          cta: null,
          ctaLabel: 'Check source',
          description: 'Both GET and POST returned an x402 payment challenge. Choose one method, then preview again.',
          iconUrl: null,
          status: 'required',
          title: 'Choose the request method',
        },
      })
    render(<AeSupplySourceNativeStart businessRef="business:one" onPreview={onPreview} onConnect={vi.fn()} onSelectCandidate={vi.fn()} onPublish={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('x402 resource URL'), { target: { value: 'https://api.onesource.io/api/chain/block-number' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(await screen.findByText(/0x52e29e0d2aa49bfbfc548c0a9f2196f4aa51f3ea/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source' }))
    fireEvent.change(screen.getByLabelText('x402 resource URL'), { target: { value: 'https://pay.example/resource' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(await screen.findByText('Choose the request method')).toBeTruthy()
    expect(onPreview.mock.calls[1]?.[0]).toEqual({ kind: 'x402', resourceUrl: 'https://pay.example/resource' })
  })

  it('shows one named preview correction', async () => {
    const onPreview = vi.fn().mockResolvedValue({
      kind: 'action_required',
      requiredAction: {
        action: 'supply.source.preview',
        blockedCapabilities: ['supply.publish'],
        cta: null,
        ctaLabel: 'Check source',
        description: 'The unpaid endpoint must answer with HTTP 402 and an x402 v2 PaymentRequired challenge.',
        iconUrl: null,
        status: 'required',
        title: 'x402 source needs attention',
      },
    })
    render(<AeSupplySourceNativeStart businessRef="business:one" onPreview={onPreview} onConnect={vi.fn()} onSelectCandidate={vi.fn()} onPublish={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('x402 resource URL'), { target: { value: 'https://api.onesource.io/api/chain/block-number' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(await screen.findByText('x402 source needs attention')).toBeTruthy()
  })
})
