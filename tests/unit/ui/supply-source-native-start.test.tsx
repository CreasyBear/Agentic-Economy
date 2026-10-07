// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
import { SupplyPublicationFlow } from '@/components/ae/supply/SupplyPublicationFlow'
import { SUPPLY_PUBLICATION_FIELD_IDS } from '@/components/ae/supply/supply-source-native-start-presentation'

afterEach(cleanup)

const digest = `sha256:${'a'.repeat(64)}`

type SupplyPublicationFlowProps = ComponentProps<typeof SupplyPublicationFlow>

const supplyCandidate: SupplyPublicationFlowProps['selected'] = {
  candidateRef: digest,
  sourceSelector: { resourceUrl: 'https://api.onesource.io/api/chain/block-number', method: 'GET' },
  title: 'Block number',
  description: 'Current block',
  authentication: { kind: 'public' },
  validationExampleAvailable: true,
  disposition: { kind: 'supported' },
}

function supplyPublicationFlowProps(overrides: Partial<SupplyPublicationFlowProps> = {}): SupplyPublicationFlowProps {
  return {
    reviewing: false,
    name: 'Block number',
    description: 'Current block',
    category: 'Research',
    serviceArea: '',
    availability: '',
    selected: supplyCandidate,
    pricingKind: 'free',
    price: '',
    connectionRef: '',
    eligibleConnections: [],
    connecting: false,
    externalEffect: false,
    dataRelease: false,
    financialExposure: false,
    dataClassification: 'public',
    attestation: {
      authorisedToPublish: false,
      informationAccurate: true,
      publishAfterSuccessfulValidation: true,
    },
    saving: false,
    disabled: false,
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onServiceAreaChange: vi.fn(),
    onAvailabilityChange: vi.fn(),
    onPricingKindChange: vi.fn(),
    onPriceChange: vi.fn(),
    onConnectionRefChange: vi.fn(),
    onConnect: vi.fn(),
    onExternalEffectChange: vi.fn(),
    onDataReleaseChange: vi.fn(),
    onFinancialExposureChange: vi.fn(),
    onDataClassificationChange: vi.fn(),
    onAttestationChange: vi.fn(),
    onContinueToReview: vi.fn(),
    onEditTerms: vi.fn(),
    onSubmit: vi.fn(),
    publishAuthorityRequired: true,
    ...overrides,
  }
}

describe('Supply publication checkbox presentation', () => {
  it('gives each consequence and publication-authority checkbox one visible accessible name', () => {
    const props = supplyPublicationFlowProps()
    const { rerender } = render(<SupplyPublicationFlow {...props} />)
    const consequenceLabels = [
      ['Change an external system', 'supply-effect-external'],
      ['Send input data to the Provider', 'supply-effect-data'],
      ['Create financial exposure', 'supply-effect-financial'],
    ] as const

    for (const [label, id] of consequenceLabels) {
      const matching = screen.getAllByRole('checkbox', { name: label })
      expect(matching).toHaveLength(1)
      expect(matching[0]?.id).toBe(id)
    }

    rerender(<SupplyPublicationFlow {...props} reviewing />)
    const authorityLabel = 'I am authorised to list this endpoint for this business'
    const authorityControl = screen.getAllByRole('checkbox', { name: authorityLabel })
    expect(authorityControl).toHaveLength(1)
    expect(authorityControl[0]?.id).toBe(SUPPLY_PUBLICATION_FIELD_IDS.attestation)
  })

  it('dispatches each controlled consequence boolean once and reflects only a rerendered value', () => {
    const props = supplyPublicationFlowProps()
    const { rerender } = render(<SupplyPublicationFlow {...props} />)
    const consequenceCases = [
      { label: 'Change an external system', onChange: props.onExternalEffectChange },
      { label: 'Send input data to the Provider', onChange: props.onDataReleaseChange },
      { label: 'Create financial exposure', onChange: props.onFinancialExposureChange },
    ] as const

    for (const { label, onChange } of consequenceCases) {
      const checkbox = screen.getByRole('checkbox', { name: label })
      fireEvent.click(checkbox)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(true)
      expect(checkbox.getAttribute('aria-checked')).toBe('false')
    }

    rerender(<SupplyPublicationFlow {...props} externalEffect dataRelease financialExposure />)
    for (const { label } of consequenceCases) {
      expect(screen.getByRole('checkbox', { name: label }).getAttribute('aria-checked')).toBe('true')
    }
  })

  it('dispatches the authority attestation key and boolean while keeping its value caller-controlled', () => {
    const props = supplyPublicationFlowProps({ reviewing: true })
    const { rerender } = render(<SupplyPublicationFlow {...props} />)
    const checkbox = screen.getByRole('checkbox', { name: 'I am authorised to list this endpoint for this business' })

    fireEvent.click(checkbox)

    expect(props.onAttestationChange).toHaveBeenCalledTimes(1)
    expect(props.onAttestationChange).toHaveBeenCalledWith('authorisedToPublish', true)
    expect(checkbox.getAttribute('aria-checked')).toBe('false')

    rerender(<SupplyPublicationFlow {...props} attestation={{ ...props.attestation, authorisedToPublish: true }} />)
    expect(screen.getByRole('checkbox', { name: 'I am authorised to list this endpoint for this business' }).getAttribute('aria-checked')).toBe('true')
  })

  it('does not dispatch from a disabled consequence checkbox or its visible label', () => {
    const onExternalEffectChange = vi.fn()
    render(<SupplyPublicationFlow {...supplyPublicationFlowProps({ disabled: true, onExternalEffectChange })} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Change an external system' })
    const label = screen.getByText('Change an external system', { exact: true })

    fireEvent.click(label)
    fireEvent.click(checkbox)

    expect(onExternalEffectChange).not.toHaveBeenCalled()
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
  })

  it('keeps checkbox activation separate from review and submit actions', () => {
    const editing = supplyPublicationFlowProps()
    const { unmount } = render(<SupplyPublicationFlow {...editing} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Change an external system' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send input data to the Provider' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create financial exposure' }))

    expect(editing.onContinueToReview).not.toHaveBeenCalled()
    expect(editing.onSubmit).not.toHaveBeenCalled()
    unmount()

    const reviewing = supplyPublicationFlowProps({ reviewing: true })
    render(<SupplyPublicationFlow {...reviewing} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'I am authorised to list this endpoint for this business' }))
    expect(reviewing.onContinueToReview).not.toHaveBeenCalled()
    expect(reviewing.onSubmit).not.toHaveBeenCalled()
  })

  it('focuses the existing authority checkbox ID when attestation validation fails', () => {
    render(<SupplyPublicationFlow {...supplyPublicationFlowProps({
      reviewing: true,
      invalidField: 'attestation',
      fieldError: 'Confirm all three publication statements before submitting.',
    })} />)
    const checkbox = screen.getByRole('checkbox', { name: 'I am authorised to list this endpoint for this business' })

    expect(checkbox.id).toBe(SUPPLY_PUBLICATION_FIELD_IDS.attestation)
    expect(document.activeElement).toBe(checkbox)
  })
})

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
        ownerHandoff: {
          actor: 'business_owner',
          reason: 'source_attention_required',
          destination: '/owner/operations/new',
          ctaLabel: 'Check source',
          description: 'Both GET and POST returned an x402 payment challenge. Choose one method, then preview again.',
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
        ownerHandoff: {
          actor: 'business_owner',
          reason: 'source_attention_required',
          destination: '/owner/operations/new',
          ctaLabel: 'Check source',
          description: 'Both GET and POST returned an x402 payment challenge. Choose one method, then preview again.',
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
      ownerHandoff: {
        actor: 'business_owner',
          reason: 'source_attention_required',
        destination: '/owner/operations/new',
        ctaLabel: 'Check source',
        description: 'The unpaid endpoint must answer with HTTP 402 and an x402 v2 PaymentRequired challenge.',
        title: 'x402 source needs attention',
      },
    })
    render(<AeSupplySourceNativeStart businessRef="business:one" onPreview={onPreview} onConnect={vi.fn()} onSelectCandidate={vi.fn()} onPublish={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('x402 resource URL'), { target: { value: 'https://api.onesource.io/api/chain/block-number' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(await screen.findByText('x402 source needs attention')).toBeTruthy()
  })
})
