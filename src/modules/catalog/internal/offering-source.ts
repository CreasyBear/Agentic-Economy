import { stableHash } from '@/modules/common/stable-hash'
import type { AccessPathRef, BusinessId, OfferingRef, SourceHash } from '@/modules/common/ids'

import {
  validateOfferingAccessPath,
  validateOfferingComparisonEnvelope,
  type BusinessOfferingRecord,
  type BusinessOfferingRevisionRecord,
  type BusinessOfferingStatus,
  type OfferingAccessPathDescriptor,
  type OfferingAccessPathRecord,
  type OfferingAccessPathStatus,
  type OfferingComparisonEnvelope,
} from './offering-supply'

export const MAX_OFFERINGS_PER_BUSINESS = 100
export const MAX_ACCESS_PATHS_PER_OFFERING = 20

export type OfferingSourceState = Readonly<{
  offerings: readonly BusinessOfferingRecord[]
  revisions: readonly BusinessOfferingRevisionRecord[]
  accessPaths: readonly OfferingAccessPathRecord[]
  operations: readonly OfferingSourceOperation[]
}>

export type OfferingSourceOperation = Readonly<{
  actorRef: string
  operationName: string
  operationKey: string
  requestHash: SourceHash
  resultRef: string
}>

export type OfferingFactsInput = Readonly<{
  name: string
  category: string
  summary: string
  serviceAreaSummary?: string
  availabilitySummary?: string
  pricingSummary?: string
  comparison?: unknown
}>

type ValidatedOfferingFactsInput = Omit<OfferingFactsInput, 'comparison'> & Readonly<{
  comparison?: OfferingComparisonEnvelope
}>

export type OfferingSourceErrorCode =
  | 'unauthenticated'
  | 'wrong_owner'
  | 'revision_conflict'
  | 'invalid_offering'
  | 'invalid_access_path'
  | 'operation_conflict'
  | 'limit_exceeded'
  | 'retired_immutable'
  | 'not_found'

export type OfferingSourceResult<T> =
  | Readonly<{ kind: 'ok'; code: 'created' | 'revised' | 'status_changed' | 'access_path_upserted' | 'access_path_withdrawn' | 'replayed'; value: T; state: OfferingSourceState }>
  | Readonly<{ kind: 'error'; code: OfferingSourceErrorCode; reason: string; state: OfferingSourceState }>

type Authority = Readonly<{
  actorRef?: string
  ownerRef: string
  businessOwnerRef: string
}>

export function createOfferingInState(state: OfferingSourceState, command: Readonly<{
  authority: Authority
  operationKey: string
  businessId: BusinessId
  offeringRef: OfferingRef
  facts: OfferingFactsInput
  now: number
}>): OfferingSourceResult<BusinessOfferingRecord> {
  const auth = authorize(state, command.authority)
  if (auth) return auth
  const requestHash = hash(command)
  const replay = replayOperation(state, command.authority.ownerRef, 'createOffering', command.operationKey, requestHash)
  if (replay) return replay as OfferingSourceResult<BusinessOfferingRecord>
  if (state.offerings.some((item) => item.offeringRef === command.offeringRef)) return fail(state, 'operation_conflict', 'Offering reference already exists.')
  if (state.offerings.filter((item) => item.businessId === command.businessId && item.status !== 'retired').length >= MAX_OFFERINGS_PER_BUSINESS) {
    return fail(state, 'limit_exceeded', 'A business may have at most 100 current Offerings.')
  }
  const facts = validateFacts(command.facts)
  if (!facts) return fail(state, 'invalid_offering', 'Offering facts are invalid.')
  const sourceHash = stableHash({ businessId: command.businessId, offeringRef: command.offeringRef, revision: 1, ...facts }) as SourceHash
  const offering: BusinessOfferingRecord = {
    offeringRef: command.offeringRef, businessId: command.businessId, currentRevision: 1,
    status: 'draft', createdAt: command.now, updatedAt: command.now,
  }
  const revision: BusinessOfferingRevisionRecord = {
    offeringRef: command.offeringRef, businessId: command.businessId, revision: 1, ...facts,
    sourceHash, createdAt: command.now,
  }
  return succeed(state, 'created', offering, [...state.offerings, offering], [...state.revisions, revision], state.accessPaths,
    operation(command.authority.ownerRef, 'createOffering', command.operationKey, requestHash, command.offeringRef))
}

export function reviseOfferingInState(state: OfferingSourceState, command: Readonly<{
  authority: Authority
  operationKey: string
  offeringRef: OfferingRef
  expectedRevision: number
  facts: OfferingFactsInput
  now: number
}>): OfferingSourceResult<BusinessOfferingRecord> {
  const auth = authorize(state, command.authority)
  if (auth) return auth
  const requestHash = hash(command)
  const replay = replayOperation(state, command.authority.ownerRef, 'reviseOffering', command.operationKey, requestHash)
  if (replay) return replay as OfferingSourceResult<BusinessOfferingRecord>
  const current = state.offerings.find((item) => item.offeringRef === command.offeringRef)
  if (!current) return fail(state, 'not_found', 'Offering was not found.')
  if (current.status === 'retired') return fail(state, 'retired_immutable', 'Retired Offerings cannot be changed.')
  if (current.currentRevision !== command.expectedRevision) return fail(state, 'revision_conflict', 'Offering changed since it was loaded.')
  const facts = validateFacts(command.facts)
  if (!facts) return fail(state, 'invalid_offering', 'Offering facts are invalid.')
  const revisionNumber = current.currentRevision + 1
  const sourceHash = stableHash({ businessId: current.businessId, offeringRef: current.offeringRef, revision: revisionNumber, ...facts }) as SourceHash
  const offering = { ...current, currentRevision: revisionNumber, updatedAt: command.now }
  const revision: BusinessOfferingRevisionRecord = {
    offeringRef: current.offeringRef, businessId: current.businessId, revision: revisionNumber, ...facts, sourceHash, createdAt: command.now,
  }
  return succeed(state, 'revised', offering, replaceOffering(state.offerings, offering), [...state.revisions, revision], state.accessPaths,
    operation(command.authority.ownerRef, 'reviseOffering', command.operationKey, requestHash, command.offeringRef))
}

export function changeOfferingStatusInState(state: OfferingSourceState, command: Readonly<{
  authority: Authority
  operationKey: string
  offeringRef: OfferingRef
  expectedRevision: number
  status: BusinessOfferingStatus
  now: number
}>): OfferingSourceResult<BusinessOfferingRecord> {
  const auth = authorize(state, command.authority)
  if (auth) return auth
  const requestHash = hash(command)
  const replay = replayOperation(state, command.authority.ownerRef, 'changeOfferingStatus', command.operationKey, requestHash)
  if (replay) return replay as OfferingSourceResult<BusinessOfferingRecord>
  const current = state.offerings.find((item) => item.offeringRef === command.offeringRef)
  if (!current) return fail(state, 'not_found', 'Offering was not found.')
  if (current.status === 'retired') return fail(state, 'retired_immutable', 'Retired Offerings cannot be changed.')
  if (current.currentRevision !== command.expectedRevision) return fail(state, 'revision_conflict', 'Offering changed since it was loaded.')
  const offering = { ...current, status: command.status, updatedAt: command.now }
  return succeed(state, 'status_changed', offering, replaceOffering(state.offerings, offering), state.revisions, state.accessPaths,
    operation(command.authority.ownerRef, 'changeOfferingStatus', command.operationKey, requestHash, command.offeringRef))
}

export function upsertAccessPathInState(state: OfferingSourceState, command: Readonly<{
  authority: Authority
  operationKey: string
  accessPathRef: AccessPathRef
  offeringRef: OfferingRef
  expectedRevision: number
  status: Exclude<OfferingAccessPathStatus, 'withdrawn'>
  descriptor: OfferingAccessPathDescriptor
  now: number
}>): OfferingSourceResult<OfferingAccessPathRecord> {
  const auth = authorize(state, command.authority)
  if (auth) return auth
  const requestHash = hash(command)
  const replay = replayOperation(state, command.authority.ownerRef, 'upsertAccessPath', command.operationKey, requestHash)
  if (replay) return replay as OfferingSourceResult<OfferingAccessPathRecord>
  const offering = state.offerings.find((item) => item.offeringRef === command.offeringRef)
  if (!offering) return fail(state, 'not_found', 'Offering was not found.')
  if (offering.status === 'retired') return fail(state, 'retired_immutable', 'Retired Offerings cannot be changed.')
  if (offering.currentRevision !== command.expectedRevision) return fail(state, 'revision_conflict', 'Offering changed since it was loaded.')
  const validation = validateOfferingAccessPath(command.descriptor)
  if (validation.kind === 'invalid') return fail(state, 'invalid_access_path', validation.reason)
  const existing = state.accessPaths.find((item) => item.accessPathRef === command.accessPathRef)
  if (existing && existing.offeringRef !== offering.offeringRef) return fail(state, 'operation_conflict', 'Access path belongs to another Offering.')
  if (!existing && state.accessPaths.filter((item) => item.offeringRef === offering.offeringRef && item.status !== 'withdrawn').length >= MAX_ACCESS_PATHS_PER_OFFERING) {
    return fail(state, 'limit_exceeded', 'An Offering may have at most 20 current access paths.')
  }
  const revision = state.revisions.find((item) => item.offeringRef === offering.offeringRef && item.revision === offering.currentRevision)
  if (!revision) return fail(state, 'revision_conflict', 'Current Offering revision is unavailable.')
  const path: OfferingAccessPathRecord = {
    accessPathRef: command.accessPathRef, businessId: offering.businessId, offeringRef: offering.offeringRef,
    offeringRevision: revision.revision, offeringSourceHash: revision.sourceHash, status: command.status,
    descriptor: validation.descriptor,
    sourceHash: stableHash({ accessPathRef: command.accessPathRef, offeringSourceHash: revision.sourceHash, descriptor: validation.descriptor }) as SourceHash,
    createdAt: existing?.createdAt ?? command.now, updatedAt: command.now,
  }
  const paths = existing ? state.accessPaths.map((item) => item.accessPathRef === path.accessPathRef ? path : item) : [...state.accessPaths, path]
  return succeed(state, 'access_path_upserted', path, state.offerings, state.revisions, paths,
    operation(command.authority.ownerRef, 'upsertAccessPath', command.operationKey, requestHash, command.accessPathRef))
}

export function withdrawAccessPathInState(state: OfferingSourceState, command: Readonly<{
  authority: Authority
  operationKey: string
  accessPathRef: AccessPathRef
  expectedRevision: number
  now: number
}>): OfferingSourceResult<OfferingAccessPathRecord> {
  const auth = authorize(state, command.authority)
  if (auth) return auth
  const requestHash = hash(command)
  const replay = replayOperation(state, command.authority.ownerRef, 'withdrawAccessPath', command.operationKey, requestHash)
  if (replay) return replay as OfferingSourceResult<OfferingAccessPathRecord>
  const path = state.accessPaths.find((item) => item.accessPathRef === command.accessPathRef)
  if (!path) return fail(state, 'not_found', 'Access path was not found.')
  const offering = state.offerings.find((item) => item.offeringRef === path.offeringRef)
  if (!offering) return fail(state, 'not_found', 'Offering was not found.')
  if (offering.status === 'retired') return fail(state, 'retired_immutable', 'Retired Offerings cannot be changed.')
  if (offering.currentRevision !== command.expectedRevision) return fail(state, 'revision_conflict', 'Offering changed since it was loaded.')
  const withdrawn = { ...path, status: 'withdrawn' as const, updatedAt: command.now }
  return succeed(state, 'access_path_withdrawn', withdrawn, state.offerings, state.revisions,
    state.accessPaths.map((item) => item.accessPathRef === path.accessPathRef ? withdrawn : item),
    operation(command.authority.ownerRef, 'withdrawAccessPath', command.operationKey, requestHash, command.accessPathRef))
}

function authorize(state: OfferingSourceState, authority: Authority): OfferingSourceResult<never> | undefined {
  if (!authority.actorRef) return fail(state, 'unauthenticated', 'Authentication is required.')
  if (authority.actorRef !== authority.ownerRef || authority.ownerRef !== authority.businessOwnerRef) {
    return fail(state, 'wrong_owner', 'Only the source-bound owner may change this business.')
  }
}

function validateFacts(input: OfferingFactsInput): ValidatedOfferingFactsInput | undefined {
  const clean = (value: string | undefined, maximum: number) => value?.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum)
  const serviceAreaSummary = clean(input.serviceAreaSummary, 500)
  const availabilitySummary = clean(input.availabilitySummary, 500)
  const pricingSummary = clean(input.pricingSummary, 500)
  const comparison = input.comparison === undefined
    ? undefined
    : validateOfferingComparisonEnvelope(input.comparison)
  if (comparison?.kind === 'invalid') return undefined
  const facts = {
    name: clean(input.name, 160) ?? '', category: clean(input.category, 120) ?? '', summary: clean(input.summary, 1_000) ?? '',
    ...(serviceAreaSummary ? { serviceAreaSummary } : {}),
    ...(availabilitySummary ? { availabilitySummary } : {}),
    ...(pricingSummary ? { pricingSummary } : {}),
    ...(comparison?.kind === 'valid' ? { comparison: comparison.envelope } : {}),
  }
  return facts.name && facts.category && facts.summary ? facts : undefined
}

function hash(command: unknown): SourceHash {
  if (typeof command !== 'object' || command === null) return stableHash(command as never) as SourceHash
  const { now: _now, ...stableCommand } = command as Record<string, unknown>
  return stableHash(stableCommand as never) as SourceHash
}
function operation(actorRef: string, operationName: string, operationKey: string, requestHash: SourceHash, resultRef: string): OfferingSourceOperation {
  return { actorRef, operationName, operationKey, requestHash, resultRef }
}
function replayOperation(state: OfferingSourceState, actorRef: string, operationName: string, operationKey: string, requestHash: SourceHash): OfferingSourceResult<unknown> | undefined {
  const existing = state.operations.find((item) => item.actorRef === actorRef && item.operationName === operationName && item.operationKey === operationKey)
  if (!existing) return undefined
  if (existing.requestHash !== requestHash) return fail(state, 'operation_conflict', 'Operation key was already used for another request.')
  const value = state.offerings.find((item) => item.offeringRef === existing.resultRef)
    ?? state.accessPaths.find((item) => item.accessPathRef === existing.resultRef)
  return value ? { kind: 'ok', code: 'replayed', value, state } : fail(state, 'operation_conflict', 'Operation replay target is unavailable.')
}
function replaceOffering(items: readonly BusinessOfferingRecord[], value: BusinessOfferingRecord) { return items.map((item) => item.offeringRef === value.offeringRef ? value : item) }
function fail(state: OfferingSourceState, code: OfferingSourceErrorCode, reason: string): OfferingSourceResult<never> { return { kind: 'error', code, reason, state } }
function succeed<T>(state: OfferingSourceState, code: Extract<OfferingSourceResult<T>, { kind: 'ok' }>['code'], value: T, offerings: readonly BusinessOfferingRecord[], revisions: readonly BusinessOfferingRevisionRecord[], accessPaths: readonly OfferingAccessPathRecord[], op: OfferingSourceOperation): OfferingSourceResult<T> {
  return { kind: 'ok', code, value, state: { offerings, revisions, accessPaths, operations: [...state.operations, op] } }
}
