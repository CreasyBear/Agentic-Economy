/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AePaidOperationCard } from '@/components/ae/action-invocation/AePaidOperationCard'
import { projectHostedPaidOperationCardInput } from '@/modules/action-invocation/paid-operation-card-contract'
import {
  createPaidOperationSemantics,
  projectRichPaidOperation,
  projectStructuredPaidOperation,
  type PaidOperationPresentationBlock,
  type PaidOperationSemantics,
} from '@/modules/action-invocation/paid-operation-semantics'

afterEach(cleanup)

describe('Phase 3C hosted paid-operation UI contract', () => {
  it('renders source-issued Action Detail instead of a raw JSON customer surface', () => {
    const detailRoute = readFileSync(
      'src/routes/actions.paid.$invocationRef.tsx',
      'utf8',
    )

    expect(detailRoute).not.toMatch(/<pre\b|JSON\.stringify\s*\(\s*result\.body/u)
    expect(detailRoute).toContain('<AePaidOperationCard')
    expect(detailRoute).toContain('semanticDigest: readback.projection.semanticDigest')
    expect(detailRoute).toContain('expectedInvocationVersion: readback.expectedInvocationVersion')
    expect(detailRoute).not.toContain('serializeEmbeddedProjection(readback.projection)')
  })

  it('locks the paid-operation reading order and pre-authority language', () => {
    const semantics = fixture()
    const { container } = render(
      <AePaidOperationCard semantics={semantics} card={cardInput(semantics)} />,
    )

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'Translate a menu into French',
    )
    expect(screen.getByText('Ready for permission')).toBeTruthy()
    expect(screen.getAllByText('Local labelled sandbox')).toHaveLength(2)
    expect(screen.getAllByText('Labelled mock provider')).toHaveLength(2)
    expect(screen.getByText('local_labelled_sandbox_fixture')).toBeTruthy()

    const sectionHeadings = screen.getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(sectionHeadings).toEqual([
      'Consequence',
      'Current truth',
      'Payment and result truth',
      'Safe next action',
      'Operation details',
      'Evidence',
    ])
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(0)
  })

  it('renders all seven closed blocks and fails closed for executable content', () => {
    const blocks: readonly PaidOperationPresentationBlock[] = [
      { kind: 'text', label: 'Text', value: 'Plain text only' },
      { kind: 'measurement', label: 'Length', value: 840, unit: 'words' },
      { kind: 'money', label: 'Price', amountMinor: 250, currency: 'AUD' },
      { kind: 'timestamp', label: 'Received', value: '2026-07-21T00:00:00.000Z' },
      {
        kind: 'source',
        label: 'Source',
        providerId: 'provider:translation',
        providerName: 'Plain Language Translations',
        operationRevision: 'translation:v2',
      },
      { kind: 'reference', label: 'Reference', value: 'document:menu:fr' },
      { kind: 'status', label: 'Review', value: 'Terminology checked', tone: 'positive' },
    ]
    const semantics = fixture({
      presentation: {
        ...fixture().presentation,
        blocks,
      },
    })
    const unsafeBlocks = [
      { kind: 'executable', label: 'Executable payload', value: 'Run executable' },
      { kind: 'html', label: 'HTML payload', value: '<button>Run HTML</button>' },
      { kind: 'markdown', label: 'Markdown payload', value: '[Run Markdown](invalid)' },
      { kind: 'url', label: 'URL payload', value: 'https://fixture.invalid/run' },
      { kind: 'tool', label: 'Tool payload', value: 'Run tool' },
      { kind: 'form', label: 'Form payload', value: 'Run form' },
      { kind: 'component', label: 'Component payload', value: 'Run component' },
    ]
    const unsafe = {
      ...semantics,
      presentation: {
        ...semantics.presentation,
        blocks: [
          ...blocks,
          ...unsafeBlocks,
        ],
      },
    } as unknown as PaidOperationSemantics

    render(<AePaidOperationCard
      semantics={unsafe}
      card={{
        ...cardInput(semantics),
        operationBlocks: unsafe.presentation.blocks,
      }}
    />)

    for (const label of [
      'Text',
      'Length',
      'Price',
      'Received',
      'Source',
      'Reference',
      'Review',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    for (const { label, value } of unsafeBlocks) {
      expect(screen.queryByText(label)).toBeNull()
      expect(document.body.textContent).not.toContain(value)
    }
  })

  it('keeps the shared card query and provider agnostic within the paid-operation class', () => {
    const source = readFileSync(
      'src/components/ae/action-invocation/AePaidOperationCard.tsx',
      'utf8',
    )

    expect(source).not.toMatch(/\bBTC\b|\bcrypto\b|x402/u)
    expect(source).not.toMatch(/providerId\s*(?:===|!==|==|!=)|switch\s*\([^)]*providerId/u)

    const semantics = fixture()
    render(<AePaidOperationCard semantics={semantics} card={cardInput(semantics)} />)
    expect(screen.getByText('Translate a menu into French')).toBeTruthy()
    expect(screen.getByText('A$2.50')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\bBTC\b|\bcrypto\b|x402/u)
  })
})

function cardInput(semantics: PaidOperationSemantics) {
  return projectHostedPaidOperationCardInput({
    semantics,
    human: projectRichPaidOperation(semantics),
    agent: projectStructuredPaidOperation(semantics),
  }, 'Labelled mock provider')
}

function fixture(
  overrides: Partial<Omit<PaidOperationSemantics, 'schema'>> = {},
): PaidOperationSemantics {
  return createPaidOperationSemantics({
    identity: {
      invocationRef: 'invocation:translation',
      expectedInvocationVersion: 1,
    },
    operation: {
      operationKey: 'documents.translate',
      providerId: 'provider:translation',
      providerName: 'Plain Language Translations',
      operationRevision: 'translation:v2',
      materialInputs: {
        document: 'menu',
        targetLanguage: 'French',
      },
    },
    presentation: {
      title: 'Translate a menu into French',
      summary: 'A labelled mock provider will translate the supplied menu.',
      blocks: [
        { kind: 'text', label: 'Target language', value: 'French' },
      ],
    },
    maximumAuthorizedCharge: { currency: 'AUD', amountMinor: 250 },
    queryRelease: { state: 'not_released' },
    paymentAuthorization: { state: 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Local labelled sandbox',
      evidenceClass: 'local_labelled_sandbox_fixture',
      claimCeiling: 'Local browser mechanics only.',
    },
    error: null,
    continuations: [{
      kind: 'authorize',
      command: 'authorize_paid_operation',
      requiredInput: ['authorityDecision'],
      expectedInvocationVersion: 1,
      authorityRequired: true,
    }],
    ...overrides,
  })
}
