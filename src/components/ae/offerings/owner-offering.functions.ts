import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { exactAmountSchema } from '@/modules/money/public'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import {
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  isSupportedOfferingCurrency,
  normalizeOfferingPrice,
  supportedOfferingCurrencySchema,
} from '@/modules/catalog/public'
import type {
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
  OfferingAccessPathRecord,
  OfferingPrice,
  OfferingPriceInput,
} from '@/modules/catalog/public'
import {
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import { publishGateRefusal } from './AeOwnerOfferings.exports'
import type { OwnerOfferingEditorValue, OwnerOfferingSaveResult } from './AeOwnerOfferings'

export type OwnerOfferingSupplyReadResult =
  | Readonly<{
      kind: 'available'
      businessId: string
      business: Readonly<{ name: string; slug: string; publicStatus: string; publishedPhone?: string }>
      offerings: readonly Readonly<{
        offeringRef: string
        businessId: string
        currentRevision: number
        status: BusinessOfferingRecord['status']
        createdAt: number
        updatedAt: number
        revision?: BusinessOfferingRevisionRecord
        accessPaths: readonly OfferingAccessPathRecord[]
      }>[]
      projection: Readonly<{ status: 'current' | 'projection_pending'; observedAt?: number; disposition?: 'current' | 'partial' | 'stale'; lastErrorCode?: string }>
    }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable'; reason?: string }>

type OfferingCommandResult =
  | Readonly<{ kind: 'ok'; code: string; resultRef?: string; currentRevision?: number }>
  | Readonly<{ kind: 'error'; code: string; reason: string }>

type SourceWriteFields = Readonly<{
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>

type SourceWriteArgs = Readonly<{
  businessId: string
  operationKey: string
  correlationId: string
}> & SourceWriteFields

const accessDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('human_request'), channel: z.enum(['phone', 'website']), disclosure: z.string(), url: z.string().optional(),
  }).superRefine((descriptor, context) => {
    if (descriptor.channel !== 'website') return
    try {
      if (descriptor.url === undefined || new URL(descriptor.url).protocol !== 'https:') throw new Error('not_https')
    } catch {
      context.addIssue({ code: 'custom', path: ['url'], message: 'Website paths require a valid HTTPS URL.' })
    }
  }),
  z.object({
    kind: z.literal('external_operation'), name: z.string(), summary: z.string(), url: z.string(),
    method: z.string().optional(), documentationUrl: z.string().optional(),
    interfaceDescription: z.object({ format: z.string(), url: z.string().optional() }).optional(),
    authenticationSummary: z.string().optional(), pricingSummary: z.string().optional(),
    provenance: z.enum(['business_declared', 'publicly_observed']),
  }),
])
const supportedExactAmountSchema = exactAmountSchema.superRefine((amount, context) => {
  if (!isSupportedOfferingCurrency(amount.currency)) context.addIssue({ code: 'custom', message: 'Unsupported offering price currency.' })
})

/**
 * The comparable price exactly as the client normalized it. The shape is
 * checked here; `normalizeOfferingPrice` is still re-run on the way through, so
 * a payload that skipped the editor cannot publish an inconsistent price.
 */
const offeringPriceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('quote_only'),
    currency: supportedOfferingCurrencySchema,
    unit: z.enum(OfferingPriceUnitValues).optional(),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues),
  }),
  z.strictObject({
    kind: z.union([z.literal('fixed'), z.literal('from')]),
    amount: supportedExactAmountSchema,
    unit: z.enum(OfferingPriceUnitValues).optional(),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues),
  }),
  z.strictObject({
    kind: z.literal('range'),
    minimum: supportedExactAmountSchema,
    maximum: supportedExactAmountSchema,
    unit: z.enum(OfferingPriceUnitValues).optional(),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues),
  }),
])

const editorSchema = z.object({
  requestKey: z.string().min(8).max(200),
  businessId: z.string().min(1),
  value: z.object({
    offeringRef: z.string().optional(), expectedRevision: z.number().int().nonnegative(),
    name: z.string(), category: z.string(), summary: z.string(),
    serviceAreaSummary: z.string(), availabilitySummary: z.string(), pricingSummary: z.string(),
    price: offeringPriceSchema.optional(),
    status: z.enum(['draft', 'published', 'paused', 'retired']),
    accessPaths: z.array(z.object({ accessPathRef: z.string().optional(), status: z.enum(['draft', 'published', 'withdrawn']), descriptor: accessDescriptorSchema })).max(20),
  }),
})

const readSupplyQuery = sourceQuery<Record<string, never>, OwnerOfferingSupplyReadResult>('catalog:getCurrentOwnerOfferingSupply')
const createOfferingMutation = sourceMutation<SourceWriteArgs & { offeringRef: string; facts: OfferingFacts }, OfferingCommandResult>('catalog:createBusinessOffering')
const reviseOfferingMutation = sourceMutation<SourceWriteArgs & { offeringRef: string; expectedRevision: number; facts: OfferingFacts }, OfferingCommandResult>('catalog:reviseBusinessOffering')
const changeStatusMutation = sourceMutation<SourceWriteArgs & { offeringRef: string; expectedRevision: number; status: OwnerOfferingEditorValue['status'] }, OfferingCommandResult>('catalog:changeBusinessOfferingStatus')
const upsertPathMutation = sourceMutation<SourceWriteArgs & { offeringRef: string; accessPathRef: string; expectedRevision: number; status: 'draft' | 'published'; descriptor: OwnerOfferingEditorValue['accessPaths'][number]['descriptor'] }, OfferingCommandResult>('catalog:upsertOfferingAccessPath')
const withdrawPathMutation = sourceMutation<SourceWriteArgs & { accessPathRef: string; expectedRevision: number }, OfferingCommandResult>('catalog:withdrawOfferingAccessPath')

type OfferingFacts = Readonly<{ name: string; category: string; summary: string; serviceAreaSummary?: string; availabilitySummary?: string; pricingSummary?: string; price?: OfferingPrice }>

export const readOwnerOfferingSupplyServer = createServerFn().handler(async (): Promise<OwnerOfferingSupplyReadResult> => {
  try {
    return await callSourceQuery(readSupplyQuery, {})
  } catch (error) {
    console.error('[owner-offerings] supply source read failed', sanitizeTelemetryError(error))
    return { kind: 'error', code: 'source_unavailable', reason: 'The Operation source did not answer. Try again.' }
  }
})

export const saveOwnerOfferingServer = createServerFn({ method: 'POST' })
  .validator((data) => editorSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerOfferingSaveResult> => {
    const value = normalizeEditorValue(data.value)
    // Requiredness is a publish gate, not a save gate. A draft may park empty.
    const missing = publishGateRefusal(value)
    if (missing !== undefined) return { kind: 'invalid', field: missing.field, message: missing.message }
    const offeringRef = value.offeringRef ?? `offering:${data.businessId}:${data.requestKey}`
    const facts = compactFacts(value)
    const correlationId = `owner-offering:${data.requestKey}`
    const first = value.offeringRef === undefined
      ? await write(
        context,
        {
          businessId: data.businessId,
          offeringRef,
          facts,
          operationKey: `owner-offering:${data.requestKey}:create`,
          correlationId,
        },
        (args) => callSourceMutation(createOfferingMutation, args),
      )
      : await write(
        context,
        {
          businessId: data.businessId,
          offeringRef,
          expectedRevision: value.expectedRevision,
          facts,
          operationKey: `owner-offering:${data.requestKey}:revise`,
          correlationId,
        },
        (args) => callSourceMutation(reviseOfferingMutation, args),
      )
    if (first.kind === 'error') return toSaveError(first)

    const completedSteps: string[] = ['details']
    if (first.currentRevision === undefined) {
      return partialRefusal('Operation details were saved, but its revision could not be confirmed. Try again.', offeringRef, value.expectedRevision, completedSteps)
    }
    const currentRevision = first.currentRevision
    const status = await write(
      context,
      {
        businessId: data.businessId,
        offeringRef,
        expectedRevision: currentRevision,
        status: value.status,
        operationKey: `owner-offering:${data.requestKey}:status`,
        correlationId,
      },
      (args) => callSourceMutation(changeStatusMutation, args),
    )
    if (status.kind === 'error') return partialRefusal('Operation details were saved, but its public state could not be changed. Try again.', offeringRef, currentRevision, completedSteps)
    completedSteps.push('public_state')

    for (const [index, path] of value.accessPaths.entries()) {
      const accessPathRef = path.accessPathRef ?? `access:${offeringRef}:${data.requestKey}:${index}`
      const pathResult = path.status === 'withdrawn'
        ? path.accessPathRef === undefined
          ? { kind: 'ok' as const, code: 'not_persisted' }
          : await write(
            context,
            {
              businessId: data.businessId,
              accessPathRef,
              expectedRevision: currentRevision,
              operationKey: `owner-offering:${data.requestKey}:withdraw-${index}`,
              correlationId,
            },
            (args) => callSourceMutation(withdrawPathMutation, args),
          )
        : await write(
          context,
          {
            businessId: data.businessId,
            offeringRef,
            accessPathRef,
            expectedRevision: currentRevision,
            status: path.status as 'draft' | 'published',
            descriptor: path.descriptor,
            operationKey: `owner-offering:${data.requestKey}:path-${index}`,
            correlationId,
          },
          (args) => callSourceMutation(upsertPathMutation, args),
        )
      if (pathResult.kind === 'error') return partialRefusal('Operation details were saved, but one access route could not be saved. Try again.', offeringRef, currentRevision, completedSteps)
      completedSteps.push(`access_path_${index}`)
    }

    return {
      kind: 'saved',
      message: 'Operation and access routes saved.',
      value: { ...value, offeringRef: offeringRef as never, expectedRevision: currentRevision },
    }
  })

async function write<T extends Record<string, unknown>>(
  context: unknown,
  command: T,
  execute: (args: T & SourceWriteFields) => Promise<OfferingCommandResult>,
): Promise<OfferingCommandResult> {
  try {
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: 'catalog_publish',
      operationKey: String(command.operationKey),
      correlationId: String(command.correlationId),
    })
    return await execute({
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
  } catch {
    return { kind: 'error', code: 'source_unavailable', reason: 'The Operation source did not answer. Try again.' }
  }
}

function compactFacts(value: OwnerOfferingEditorValue): OfferingFacts {
  return {
    name: value.name.trim().length === 0 ? 'Untitled Operation' : value.name,
    category: value.category,
    summary: value.summary,
    ...(value.serviceAreaSummary.trim() === '' ? {} : { serviceAreaSummary: value.serviceAreaSummary }),
    ...(value.availabilitySummary.trim() === '' ? {} : { availabilitySummary: value.availabilitySummary }),
    ...(value.pricingSummary.trim() === '' ? {} : { pricingSummary: value.pricingSummary }),
    ...(value.price === undefined ? {} : { price: value.price }),
  }
}

function normalizeEditorValue(value: z.infer<typeof editorSchema>['value']): OwnerOfferingEditorValue {
  return {
    ...(value.offeringRef === undefined ? {} : { offeringRef: value.offeringRef as never }),
    expectedRevision: value.expectedRevision,
    name: value.name,
    category: value.category,
    summary: value.summary,
    serviceAreaSummary: value.serviceAreaSummary,
    availabilitySummary: value.availabilitySummary,
    pricingSummary: value.pricingSummary,
    price: value.price === undefined ? undefined : normalizeOfferingPrice(toOfferingPriceInput(value.price)),
    status: value.status,
    accessPaths: value.accessPaths.map((path) => ({
      ...(path.accessPathRef === undefined ? {} : { accessPathRef: path.accessPathRef }),
      status: path.status,
      descriptor: path.descriptor as OwnerOfferingEditorValue['accessPaths'][number]['descriptor'],
    })),
  }
}

/** Zod optionals arrive as `T | undefined`; the price contract wants absence. */
function toOfferingPriceInput(price: z.infer<typeof offeringPriceSchema>): OfferingPriceInput {
  const shared = {
    kind: price.kind,
    taxTreatment: price.taxTreatment,
    ...(price.unit === undefined ? {} : { unit: price.unit }),
  }
  if (price.kind === 'quote_only') return { ...shared, currency: price.currency }
  if (price.kind === 'range') return { ...shared, minimum: price.minimum, maximum: price.maximum }
  return { ...shared, amount: price.amount }
}

function toSaveError(result: Extract<OfferingCommandResult, { kind: 'error' }>): OwnerOfferingSaveResult {
  if (result.code === 'revision_conflict') return { kind: 'revision_conflict', message: 'Reload the latest Operation before saving your changes.' }
  if (result.code === 'invalid_offering' || result.code === 'invalid_access_path' || result.code === 'limit_exceeded') return { kind: 'invalid', message: result.reason }
  return { kind: 'refused', message: result.reason }
}

function partialRefusal(message: string, offeringRef: string, currentRevision: number, completedSteps: readonly string[]): OwnerOfferingSaveResult {
  return { kind: 'refused', message, retry: { offeringRef, currentRevision, completedSteps: [...completedSteps] } }
}
