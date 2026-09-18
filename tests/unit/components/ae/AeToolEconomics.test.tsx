// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeToolDecision } from '@/components/ae/market/tool-detail/AeToolDecision'
import { AeToolEconomics } from '@/components/ae/market/tool-detail/AeToolEconomics'
import { toToolInspectorModel } from '@/components/ae/market/tool-detail/tool-inspector-model'
import {
  toolDetailOutputSchema,
  type PublicToolDescriptor,
} from '@/modules/capability-supply/public'

function economicsTool(
  overrides: Partial<PublicToolDescriptor['commercial']> = {},
): PublicToolDescriptor {
  const parsed = toolDetailOutputSchema.parse({
    kind: 'found',
    schemaVersion: 'registry-tools:v3',
    tool: {
      toolRef: `operation:v1:${'a'.repeat(64)}`,
      toolId: 'op_test_a',
      callVia: '/api/v1/tools/call',
      paymentLane: 'brokered',
      contract: {
        capabilityId: 'fx.convert',
        version: 1,
        inputJsonSchema: {},
        outputJsonSchema: {},
        customerAnnotations: [],
      },
      business: { businessId: 'b_acme', slug: 'acme-tools', name: 'Acme Tools' },
      listing: {
        listingRef: 'listing:v1:x',
        revision: 2,
        label: 'Currency conversion',
        summary: 'Convert between currencies.',
      },
      summary: 'Convert USD to EUR at live rates.',
      commercial: {
        price: { kind: 'fixed', amount: { currency: 'USD', units: '25', exponent: 2 } },
        materialTerms: [{ label: 'Terms note', value: 'Charged per call.' }],
        relationship: { kind: 'direct', summary: 'Served by Acme.' },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      cancellation: { kind: 'adapter_managed' },
      recovery: { idempotency: 'required', recovery: 'retry_safe' },
      authentication: { kind: 'x402' },
      transport: { method: 'POST', requestTimeoutMs: 30000 },
      provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
      listingTier: 'reviewed',
      availability: { posture: 'routeable' },
      navigation: [{
        relation: 'call',
        pathTemplate: '/api/v1/tools/call',
        method: 'POST',
        actionId: 'tool.call',
        authentication: 'required',
        surfaces: ['http', 'cli', 'mcp', 'chat'],
      }],
    },
  })
  if (parsed.kind !== 'found') throw new Error('fixture_parse_wrong_branch')
  return {
    ...parsed.tool,
    commercial: {
      ...parsed.tool.commercial,
      ...overrides,
    },
  }
}

afterEach(cleanup)

describe('AeToolEconomics', () => {
  it('does not label an unavailable display price as Fixed price', () => {
    const view = render(
      <AeToolEconomics
        tool={economicsTool({
          price: { kind: 'fixed', amount: { currency: 'USD', units: '25', exponent: 2 } },
          displayPrice: { kind: 'unavailable', reason: 'fx_missing' },
        })}
      />,
    )
    expect(view.queryByText('Fixed price')).toBeNull()
    expect(view.getByText('AUD estimate temporarily unavailable per Call')).toBeTruthy()
  })

  it('charges 0% on x402 Calls and does not show the Account loading fee', () => {
    const view = render(<AeToolEconomics tool={economicsTool()} />)
    expect(view.getByText('Call fee')).toBeTruthy()
    expect(view.getByText('0%')).toBeTruthy()
    expect(view.queryByText('No Call markup')).toBeNull()
    expect(view.queryByText('Top-up fee')).toBeNull()
    expect(view.queryByText('5% fee + GST on the fee')).toBeNull()
    expect(view.queryByText('2.5% fee + GST on the fee')).toBeNull()
  })

  it('keeps AeToolDecision at 0% Call fee without a loading-fee row', () => {
    const tool = economicsTool()
    const model = toToolInspectorModel(tool)
    const view = render(<AeToolDecision tool={tool} model={model} />)
    expect(view.getByText('0%')).toBeTruthy()
    expect(view.queryByText('Top-up fee')).toBeNull()
    expect(view.queryByText('5% fee + GST on the fee')).toBeNull()
  })
})
