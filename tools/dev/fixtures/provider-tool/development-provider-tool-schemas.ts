import { z } from 'zod'

/**
 * Shared with development-provider-tool.actions.ts (which defines the
 * development actions against these schemas) and
 * development-provider-tool-context.ts (which only needs the input types to
 * type its dependency-injection surface). Kept in its own leaf file so the
 * context module does not need to import the actions module back.
 */

export const developmentLabel = z.literal('MOCK/DEVELOPMENT ONLY')

export const developmentProviderToolInputSchema = z.object({
  environment: developmentLabel,
  slot: z.object({
    slotRef: z.string().min(1),
    providerRef: z.string().min(1),
    offeringRef: z.string().min(1),
    bindingRef: z.string().min(1),
    contractRef: z.string().min(1),
    actionVersion: z.literal('v1'),
    startsAt: z.string().datetime(),
    freshAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    termsDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    provenance: z.object({
      source: z.literal('mock_provider_availability'),
      observationRef: z.string().min(1),
      observedBy: z.string().min(1),
    }),
  }),
  customer: z.object({
    principalRef: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
  }),
  disclosure: z.object({
    fields: z.tuple([z.literal('customer.name'), z.literal('customer.email')]),
    recipient: z.string().min(1),
    purpose: z.literal('create_development_effect'),
  }),
  operationKey: z.string().min(1),
})

export type DevelopmentProviderToolInput = z.infer<typeof developmentProviderToolInputSchema>

export const developmentProviderToolCancellationInputSchema = z.object({
  environment: developmentLabel,
  effectRef: z.string().min(1),
  providerRef: z.string().min(1),
  principalRef: z.string().min(1),
  reason: z.string().min(1),
  operationKey: z.string().min(1),
})

export type DevelopmentProviderToolCancellationInput = z.infer<typeof developmentProviderToolCancellationInputSchema>
