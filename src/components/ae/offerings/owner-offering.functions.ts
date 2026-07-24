import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import type {
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
  OfferingAccessPathRecord,
} from '@/modules/catalog/public'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'
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
      cutover: Readonly<{ mode: string; lastCheckStatus: string; postCutoverNativeChanges: boolean }>
      projection: Readonly<{ status: string; observedAt?: number; disposition?: string; lastErrorCode?: string }>
    }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable'; reason?: string }>

type OfferingCommandResult =
  | Readonly<{ kind: 'ok'; code: string; resultRef?: string; currentRevision?: number }>
  | Readonly<{ kind: 'error'; code: string; reason: string }>

type SourceWriteArgs = Readonly<{
  businessId: string
  operationKey: string
  correlationId: string
  sourceWrite: SourceWriteAdmission
}>

const accessDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('human_request'), channel: z.enum(['phone', 'website', 'ae_inquiry']), disclosure: z.string(), url: z.string().optional(),
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

const editorSchema = z.object({
  requestKey: z.string().min(8).max(200),
  businessId: z.string().min(1),
  value: z.object({
    offeringRef: z.string().optional(), expectedRevision: z.number().int().nonnegative(),
    name: z.string(), category: z.string(), summary: z.string(),
    serviceAreaSummary: z.string(), availabilitySummary: z.string(), pricingSummary: z.string(),
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

type OfferingFacts = Readonly<{ name: string; category: string; summary: string; serviceAreaSummary?: string; availabilitySummary?: string; pricingSummary?: string }>

export const readOwnerOfferingSupplyServer = createServerFn().handler(async (): Promise<OwnerOfferingSupplyReadResult> => {
  try {
    return await callSourceQuery(readSupplyQuery, {})
  } catch (error) {
    return { kind: 'error', code: 'source_unavailable', reason: error instanceof Error ? error.message : 'Offering source is unavailable.' }
  }
})

export const saveOwnerOfferingServer = createServerFn({ method: 'POST' })
  .validator((data) => editorSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerOfferingSaveResult> => {
    const value = normalizeEditorValue(data.value)
    const offeringRef = value.offeringRef ?? `offering:${data.businessId}:${data.requestKey}`
    const facts = compactFacts(value)
    const first = value.offeringRef === undefined
      ? await write(context, data.businessId, data.requestKey, 'create', (source) => callSourceMutation(createOfferingMutation, { ...source, offeringRef, facts }))
      : await write(context, data.businessId, data.requestKey, 'revise', (source) => callSourceMutation(reviseOfferingMutation, { ...source, offeringRef, expectedRevision: value.expectedRevision, facts }))
    if (first.kind === 'error') return toSaveError(first)

    const currentRevision = first.currentRevision ?? Math.max(1, value.expectedRevision + (value.offeringRef === undefined ? 0 : 1))
    const completedSteps: string[] = ['details']
    const status = await write(context, data.businessId, data.requestKey, 'status', (source) => callSourceMutation(changeStatusMutation, { ...source, offeringRef, expectedRevision: currentRevision, status: value.status }))
    if (status.kind === 'error') return partialRefusal(`Offering details were saved, but its public state was not changed: ${status.reason}`, offeringRef, currentRevision, completedSteps)
    completedSteps.push('public_state')

    for (const [index, path] of value.accessPaths.entries()) {
      const accessPathRef = path.accessPathRef ?? `access:${offeringRef}:${data.requestKey}:${index}`
      const pathResult = path.status === 'withdrawn'
        ? path.accessPathRef === undefined
          ? { kind: 'ok' as const, code: 'not_persisted' }
          : await write(context, data.businessId, data.requestKey, `withdraw-${index}`, (source) => callSourceMutation(withdrawPathMutation, { ...source, accessPathRef, expectedRevision: currentRevision }))
        : await write(context, data.businessId, data.requestKey, `path-${index}`, (source) => callSourceMutation(upsertPathMutation, { ...source, offeringRef, accessPathRef, expectedRevision: currentRevision, status: path.status as 'draft' | 'published', descriptor: path.descriptor }))
      if (pathResult.kind === 'error') return partialRefusal(`Offering details were saved, but one way to get started was not: ${pathResult.reason}`, offeringRef, currentRevision, completedSteps)
      completedSteps.push(`access_path_${index}`)
    }

    return {
      kind: 'saved',
      message: 'Your Offering and its ways to get started were saved.',
      value: { ...value, offeringRef: offeringRef as never, expectedRevision: currentRevision },
    }
  })

async function write(
  context: unknown,
  businessId: string,
  requestKey: string,
  step: string,
  execute: (source: SourceWriteArgs) => Promise<OfferingCommandResult>,
): Promise<OfferingCommandResult> {
  const operationKey = `owner-offering:${requestKey}:${step}`
  const correlationId = `owner-offering:${requestKey}`
  try {
    const sourceWrite = await sourceWriteAdmissionFromContext({ context, scope: 'catalog_publish', operationKey, correlationId })
    return await execute({ businessId, operationKey, correlationId, sourceWrite })
  } catch (error) {
    return { kind: 'error', code: 'source_unavailable', reason: error instanceof Error ? error.message : 'Offering source is unavailable.' }
  }
}

function compactFacts(value: OwnerOfferingEditorValue): OfferingFacts {
  return {
    name: value.name, category: value.category, summary: value.summary,
    ...(value.serviceAreaSummary.trim() === '' ? {} : { serviceAreaSummary: value.serviceAreaSummary }),
    ...(value.availabilitySummary.trim() === '' ? {} : { availabilitySummary: value.availabilitySummary }),
    ...(value.pricingSummary.trim() === '' ? {} : { pricingSummary: value.pricingSummary }),
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
    status: value.status,
    accessPaths: value.accessPaths.map((path) => ({
      ...(path.accessPathRef === undefined ? {} : { accessPathRef: path.accessPathRef }),
      status: path.status,
      descriptor: path.descriptor as OwnerOfferingEditorValue['accessPaths'][number]['descriptor'],
    })),
  }
}

function toSaveError(result: Extract<OfferingCommandResult, { kind: 'error' }>): OwnerOfferingSaveResult {
  if (result.code === 'revision_conflict') return { kind: 'revision_conflict', message: 'Reload the latest Offering before saving your changes.' }
  if (result.code === 'invalid_offering' || result.code === 'invalid_access_path' || result.code === 'limit_exceeded') return { kind: 'invalid', message: result.reason }
  return { kind: 'refused', message: result.reason }
}

function partialRefusal(message: string, offeringRef: string, currentRevision: number, completedSteps: readonly string[]): OwnerOfferingSaveResult {
  return { kind: 'refused', message, retry: { offeringRef, currentRevision, completedSteps: [...completedSteps] } }
}
