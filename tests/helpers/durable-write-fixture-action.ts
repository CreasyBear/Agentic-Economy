import { z } from 'zod'

import { defineAction, type Action, type ActionResult } from '@/modules/common/action'
import { isRecord } from '@/modules/common/is-record'

const durableWriteFixtureInputSchema = z.object({
  target: z.object({
    businessId: z.string(),
    serviceId: z.string().optional(),
    offeringRef: z.string().optional(),
    capabilityKind: z.string().optional(),
  }),
  body: z.string().max(2_000),
  contact: z.object({
    name: z.string().max(200).optional(),
    email: z.string().max(254).optional(),
    phone: z.string().max(32).optional(),
  }),
  expectedDigest: z.string(),
  operationKey: z.string(),
})

type DurableWriteFixtureInput = z.infer<typeof durableWriteFixtureInputSchema>

const durableWriteFixtureOutputSchema = z.object({
  kind: z.string(),
}).passthrough()

function contactFieldKeys(contact: DurableWriteFixtureInput['contact']): readonly string[] {
  return [
    ...(contact.name === undefined ? [] : ['contact.name']),
    ...(contact.email === undefined ? [] : ['contact.email']),
    ...(contact.phone === undefined ? [] : ['contact.phone']),
  ]
}

function fieldLimit(field: string): number | undefined {
  switch (field) {
    case 'body':
      return 2_000
    case 'contact.name':
      return 200
    case 'contact.email':
      return 254
    case 'contact.phone':
      return 32
    default:
      return undefined
  }
}

/**
 * Test-only mutating action for Action Invocation control-plane tests.
 * Not registered in the product action list.
 */
export const durableWriteFixtureAction: Action<DurableWriteFixtureInput, ActionResult> = defineAction({
  id: 'test.durable_write',
  name: 'Durable write fixture',
  summary: 'Development-only mutating fixture for Action Invocation tests.',
  boundaries: ['Not a product surface. Never registered in findAction.'],
  schema: durableWriteFixtureInputSchema,
  outputSchema: durableWriteFixtureOutputSchema,
  parameters: [
    {
      name: 'body',
      type: 'string',
      description: 'Fixture message body.',
      required: true,
    },
    {
      name: 'contact.email',
      type: 'string',
      description: 'Fixture contact email.',
      required: false,
    },
  ],
  readOnly: false,
  effect: {
    class: 'disclosure',
    reversible: false,
    recipientKind: 'business',
    dataClasses: ['contact', 'query_text'],
    spendExposure: 'none',
    approval: 'mandate_eligible',
  },
  surfaces: ['agentJson'],
  invocationContract: {
    version: 'test.durable_write:v1',
    consequenceClass: 'communication',
    materialInputPaths: [
      'target',
      'body',
      'contact',
      'expectedDigest',
      'operationKey',
    ],
    authorityRequirement: 'principal',
    retryClass: 'attributable_retry',
    expectedEvidence: ['attributable receipt', 'notification queue state'],
    safeContinuations: ['inspect the returned receipt', 'wait for human review'],
    invalidationConditions: [
      'material input changes',
      'target changes',
      'authority expires',
      'principal or caller changes',
    ],
    developmentAttemptTimeoutMs: 30_000,
    reconciliationEvidenceSource: 'test.durable_write:delivery-observer:v1',
  },
  projectInvocationPreparation: (input) => {
    const fields = ['body', ...contactFieldKeys(input.contact)]
    return {
      dataUse: {
        fields,
        limits: Object.fromEntries(
          fields.flatMap((field) => {
            const limit = fieldLimit(field)
            return limit === undefined ? [] : [[field, limit]]
          }),
        ),
      },
    }
  },
  classifyInvocationResult: (result) => {
    if (result.kind === 'error') return { outcome: 'refused', referenceable: false }
    const receipt = result.receipt
    if (!isRecord(receipt)) {
      return { outcome: 'completed', referenceable: true }
    }
    return receipt.notificationStatus === 'queued'
      ? { outcome: 'queued_communication', referenceable: true }
      : { outcome: 'completed', referenceable: true }
  },
  run: async ({ data, context }) => {
    const adapter = context.developmentOnlyDurableWriteAdapter
    if (adapter === undefined) {
      return {
        kind: 'error',
        code: 'development_adapter_required',
        retryable: false,
        reason: 'Durable write fixture requires the labelled development adapter.',
      }
    }
    return adapter(data)
  },
})

export function requireDurableWriteFixtureAction(): Action<DurableWriteFixtureInput, ActionResult> {
  return durableWriteFixtureAction
}
