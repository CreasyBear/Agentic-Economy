import type { EligibilityInput } from '../eligibility'
import type { CapabilityBindingRow } from '../binding'
import type { CapabilityOfferingRow } from '../offering'
import type { RegistrationContext, SupplyAuditEventRow, SupplyAuditInput, SupplyCommandActor } from '../shared'

export type OperationKeyRecord = Readonly<{
  operationId: string
  requestHash: string
  status: 'in_progress' | 'succeeded' | 'failed_terminal'
  resultHash?: string
  effectRefs: readonly string[]
}>

export type OperationBeginResult =
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; operationId: string; resultHash: string | undefined; effectRefs: readonly string[] }>
  | Readonly<{ kind: 'ready'; operationId: string }>

export type RegisterOfferingWriterResult =
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'registered'; offeringId: string; registrationHash: string; created: boolean }>

export type RegisterBindingWriterResult =
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'registered'; bindingId: string; registrationHash: string; created: boolean }>

export type SetEligibilityWriterResult =
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{
      kind: 'eligible' | 'ineligible'
      offeringId: string
      bindingId: string
      eligibilityHash: string
      offeringEligibilityHash: string
      bindingEligibilityHash: string
      transition: Readonly<{
        offeringBefore: string
        offeringAfter: 'active' | 'inactive'
        bindingBefore: string
        bindingAfter: string
      }>
    }>

export type AuditInsertRow = Readonly<{
  eventId: string
  eventType: string
  actorKind: string
  actorRef: string
  targetType: string
  targetRef: string
  beforeState: string
  afterState: string
  idempotencyKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: readonly string[]
  redactedPayloadJson: string
  payloadHash: string
  createdAt: number
}>

export type OfferingQuarantineParentPatch = Readonly<{
  status: 'active' | 'inactive'
  admissionEvidenceRefs: readonly string[]
  eligibilityHash: string
  updatedAt: number
}>

export type BindingQuarantinePatch = Readonly<{
  admission: 'not_admitted'
  conformance: 'not_conformant'
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
  eligibilityHash: string
  updatedAt: number
}>

export type OperationLedgerPorts = Readonly<{
  findOperationKey: (input: {
    actorRef: string
    operationName: string
    key: string
  }) => Promise<OperationKeyRecord | null>
  insertOperationKey: (input: {
    scope: 'capability_supply'
    actorKind: string
    actorRef: string
    operationName: string
    key: string
    requestHash: string
    now: number
  }) => Promise<string>
  markOperationInProgress: (operationId: string, now: number) => Promise<void>
  markOperationFailed: (operationId: string, resultHash: string, now: number) => Promise<void>
  markOperationSucceeded: (
    operationId: string,
    resultHash: string,
    effectRefs: readonly string[],
    now: number,
  ) => Promise<void>

  findAuditByEventId: (eventId: string) => Promise<SupplyAuditEventRow | null>
  insertAudit: (row: AuditInsertRow) => Promise<void>

  registerOffering: (registration: unknown, now: number) => Promise<RegisterOfferingWriterResult>
  registerBinding: (
    registration: unknown,
    now: number,
    expectedOperationRef?: string,
  ) => Promise<RegisterBindingWriterResult>
  setEligibility: (eligibility: EligibilityInput, now: number) => Promise<SetEligibilityWriterResult>

  loadOfferingByOfferingId: (offeringId: string) => Promise<CapabilityOfferingRow | null>
  loadBindingByBindingId: (bindingId: string) => Promise<CapabilityBindingRow | null>
  listAdmittedConformantBindings: (
    offeringId: string,
    limit: number,
  ) => Promise<readonly CapabilityBindingRow[]>
  patchOfferingQuarantineParent: (
    offeringId: string,
    patch: OfferingQuarantineParentPatch,
  ) => Promise<void>
  patchBindingQuarantine: (bindingId: string, patch: BindingQuarantinePatch) => Promise<void>
}>

export type RegistrationCommand = Readonly<{
  actor: SupplyCommandActor
  registration: unknown
  context: RegistrationContext
}>

export type EligibilityCommand = Readonly<{
  actor: SupplyCommandActor
  eligibility: EligibilityInput
  context: RegistrationContext
}>

export type QuarantineCommand = Readonly<{
  actor: SupplyCommandActor
  bindingId: string
  expectedObservedRowDigest: string
  context: RegistrationContext
}>

export type ReplayExpectation = Readonly<{
  audit: SupplyAuditInput
  allowedBeforeStates: readonly string[]
}>
