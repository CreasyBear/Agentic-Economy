import { z } from 'zod'

import {
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from '@/modules/catalog/public'
import { defineAction } from '@/modules/common/action'
import { registryDetailAction } from '@/modules/registry/registry.actions'
import { SandboxQuoteProvenance } from './checkup-quote'
import { resolveCheckupQuote } from './public'

const checkupQuoteInputSchema = z.strictObject({
  slug: z.string().min(1).max(200).describe('Published business slug'),
})

const checkupQuoteOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('quoted'),
    quote: z.strictObject({
      provenance: z.literal(SandboxQuoteProvenance).describe('Sandbox provenance label; never evidence of provider fulfilment'),
      slug: z.string().describe('Published business slug the quote is for'),
      service: z.string().describe('Published offering name the quote prices'),
      price: z.strictObject({
        currency: z.string().describe('ISO 4217 currency code'),
        amountMinor: z.number().describe('Published amount in minor currency units'),
        unit: z.enum(OfferingPriceUnitValues).optional().describe('Unit the price applies to'),
        taxTreatment: z.enum(OfferingPriceTaxTreatmentValues).optional().describe('Published tax treatment'),
      }),
      nextAvailable: z.string().describe('Next sandbox appointment slot, ISO 8601'),
      quotedAt: z.string().describe('When the quote was produced, ISO 8601'),
      validUntil: z.string().describe('When the quote expires, ISO 8601'),
    }),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    code: z.enum(['unknown_offering', 'ambiguous_offering']),
    reason: z.string(),
  }),
])

export type SandboxCheckupQuoteResult = z.infer<typeof checkupQuoteOutputSchema>

export const sandboxCheckupQuoteAction = defineAction({
  id: 'sandbox.checkup_quote',
  name: 'Quote a standard checkup (sandbox)',
  summary:
    'Return a priced, time-bounded sandbox quote for the single fixed-price checkup offering a published business exposes. ' +
    'The same resolution backs POST /api/sandbox/$slug/checkup-quote.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'The quote is an AE sandbox operation proving the contract shape, not provider fulfilment or payment.',
    'A refusal means no single fixed-price checkup offering is published for that slug; do not invent one.',
  ],
  schema: checkupQuoteInputSchema,
  outputSchema: checkupQuoteOutputSchema,
  parameters: [
    {
      name: 'slug',
      type: 'string',
      description: 'Published business slug, as returned by the services list or search.',
      required: true,
    },
  ],
  readOnly: true,
  effect: {
    class: 'comparison_quote',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'answerThread'],
  run: async ({ data, context }): Promise<SandboxCheckupQuoteResult> => {
    const detail = await registryDetailAction.run({
      data: { slug: data.slug.trim() },
      context,
    })
    const result = resolveCheckupQuote({
      slug: data.slug.trim(),
      requestedAt: Date.now(),
      offerings: detail.kind === 'found' ? detail.business.offerings : [],
    })
    if (result.kind === 'error') {
      return {
        kind: 'refused',
        code: result.code,
        reason: result.code === 'ambiguous_offering'
          ? 'More than one published fixed-price checkup offering matched this slug.'
          : 'No published fixed-price checkup offering exists for this slug.',
      }
    }
    return { kind: 'quoted', quote: result.quote }
  },
})
