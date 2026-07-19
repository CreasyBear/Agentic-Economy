import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Agent-native action contract for AE.
 *
 * One declaration fans out to every surface: the React UI, the HTTP API, the
 * agent JSON payload, and the internal answer-thread read-tool runner.
 *
 * Each action carries a boundary-honest `summary` and an explicit `boundaries`
 * list so an external assistant knows both *when* to call it and *what it must
 * refuse to assume*. `readOnly` is the AE trust axis: read actions are safe to
 * call without approval and are cacheable; writes are admission-gated through
 * `SourceWriteAdmission` (the AE analogue of agent-native's approval gate).
 *
 * The `run` body references the same `*ThroughSource` function the existing
 * TanStack server fns use, so UI, HTTP, and agent surfaces execute one
 * implementation. Define once, call from anywhere.
 *
 * Registration is explicit: `src/modules/actions/index.ts` imports every action
 * const into a single array and exports `listActions` / `findAction` over it.
 * Do not rely on module-eval side-effects for registration — the production
 * bundler tree-shakes bare side-effect imports.
 */

export type ActionSurface = 'ui' | 'http' | 'agentJson' | 'answerThread'

export type ActionSourceWriteRequest = {
  method: string
  origin: string
  pathname: string
  bodyDigest: string
}

export type ActionTimingSink = {
  record: (
    name: string,
    durationMs: number,
    metadata?: Record<string, string | number | boolean | null>,
  ) => void
}

export type ActionHarnessApprovalContext = {
  authority?: 'owner' | 'admin'
}

export type ActionAgentIdentity = {
  kind: 'identity'
  signatureAgent: string
  keyid: string
  verifiedAt: string
}

export type ActionContext = {
  /** Admission context for writes; built from the calling surface's request. */
  sourceWriteRequest?: ActionSourceWriteRequest
  /** The raw incoming request, when available at an HTTP boundary. */
  request?: Request
  /** Internal timing sink used by answer turns; never exposed on human surfaces. */
  timing?: ActionTimingSink
  /** Signed request identity for attribution/quota/audit only; never write authority. */
  agentIdentity?: ActionAgentIdentity
  /** Harness-only approval authority for owner/admin-gated tools. */
  harnessApproval?: ActionHarnessApprovalContext
  /** Explicitly labelled in-process adapter for Action Invocation development evals only. */
  developmentOnlyInquirySubmitAdapter?: (
    data: unknown,
  ) => Promise<ActionResult>
  developmentOnlySuppliedQuoteAdapter?: (
    data: unknown,
  ) => Promise<ActionResult>
  /** Deterministic public-detail source used only by the local development evidence CLI. */
  developmentOnlyRegistryDetailAdapter?: (
    data: Readonly<{ slug: string }>,
  ) => Promise<ActionResult>
  /** Opaque source ports consumed only by the supplied-quote action's trusted development hook. */
  developmentOnlySuppliedQuoteQualificationPorts?: unknown
  /** Fixed development clock paired with the supplied-quote source ports. */
  developmentOnlySuppliedQuoteNow?: () => number
  /** Booking-owned deterministic provider port for labelled development evidence only. */
  developmentOnlyBookingAdapter?: (data: unknown) => Promise<ActionResult>
  developmentOnlyBookingNow?: () => number
  developmentOnlyBookingAuthorityPrincipalRef?: string
  developmentOnlyBookingAvailabilityCheck?: (
    data: unknown,
    now: number,
  ) => Promise<Readonly<{ kind: 'current' } | { kind: 'stale'; reason: string }>>
  developmentOnlyBookingAvailabilityAdapter?: () => Promise<unknown>
  developmentOnlyBookingCancellationAdapter?: (data: unknown) => Promise<ActionResult>
  developmentOnlyBookingCancellationCheck?: (
    data: unknown,
  ) => Promise<Readonly<{ kind: 'current' } | { kind: 'refused'; reason: string }>>
}

export type ActionEffectReleaseController = Readonly<{
  beginEffectRelease(): void
}>

export type ActionRunArgs<Input> = {
  data: Input
  context: ActionContext
  /** Executor-owned capability; absent for legacy conservative execution. */
  effectRelease?: ActionEffectReleaseController
}

export type ActionParameterType = 'string' | 'number' | 'boolean' | 'enum' | 'object'

export type ActionParameter = {
  name: string
  type: ActionParameterType
  description: string
  required: boolean
  enum?: readonly string[]
}

type ActionRunner<Input, Result extends ActionResult> = {
  run(args: ActionRunArgs<Input>): Promise<Result>
}['run']

export type ActionResult = Readonly<{ kind: string } & Record<string, unknown>>

export type ActionConsequenceClass =
  | 'read_only'
  | 'communication'
  | 'external_effect'
  | 'legacy_unclassified_write'

export type ActionAuthorityRequirement =
  | 'none'
  | 'caller'
  | 'principal'
  | 'owner'
  | 'admin'
  | 'legacy_unspecified'

export type ActionRetryClass =
  | 'replayable'
  | 'attributable_retry'
  | 'reconcile_before_retry'
  | 'legacy_unspecified'

export type ActionInvocationContract = Readonly<{
  /** Immutable version of the action's invocation semantics, not the application version. */
  version: string
  consequenceClass: ActionConsequenceClass
  /** Dot-addressed input paths whose change invalidates a prepared invocation. */
  materialInputPaths: readonly string[]
  authorityRequirement: ActionAuthorityRequirement
  retryClass: ActionRetryClass
  expectedEvidence: readonly string[]
  safeContinuations: readonly string[]
  invalidationConditions: readonly string[]
  /** Duration parameter for the deterministic development timeout transition. */
  developmentAttemptTimeoutMs?: number
  /** Exact producer identity accepted for reconciliation evidence. */
  reconciliationEvidenceSource?: string
}>

export type ActionInvocationPreparation = Readonly<{
  dataUse: Readonly<{
    fields: readonly string[]
    limits: Readonly<Record<string, number>>
  }>
}>

export type ActionInvocationResultClassification = Readonly<{
  outcome: string
  referenceable: boolean
}>


type ActionPreparationProjector<Input> = {
  project(input: Input): ActionInvocationPreparation
}['project']

type ActionResultClassifier<Result extends ActionResult> = {
  classify(result: Result): ActionInvocationResultClassification
}['classify']

type ActionPreReleaseCheck<Input, Result extends ActionResult> = {
  check(input: ActionRunArgs<Input>): Promise<Result | undefined>
}['check']

export type ResolvedActionInvocationContract = ActionInvocationContract & Readonly<{
  compatibility: 'explicit' | 'derived_from_legacy_read_only_flag'
}>

export type ActionDefinition<
  Input,
  Result extends ActionResult,
> = {
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly boundaries: readonly string[]
  readonly schema: z.ZodType<Input>
  readonly parameters: readonly ActionParameter[]
  readonly readOnly: boolean
  readonly surfaces: readonly ActionSurface[]
  readonly outputSchema: z.ZodType<Result>
  /**
   * Optional only for compatibility with actions registered before invocation
   * contracts existed. New classified actions declare this explicitly.
   */
  readonly invocationContract?: ActionInvocationContract
  readonly projectInvocationPreparation?: ActionPreparationProjector<Input>
  /** Action-owned interpretation of its returned business result. */
  readonly classifyInvocationResult?: ActionResultClassifier<Result>
  /** Action-owned refusal check that runs before an attempt can enter release. */
  readonly preReleaseCheck?: ActionPreReleaseCheck<Input, Result>
  readonly run: ActionRunner<Input, Result>
}

export type AnyAction = ActionDefinition<unknown, ActionResult>

export type Action<Input = unknown, Result extends ActionResult = ActionResult> =
  ActionDefinition<Input, Result>

export function defineAction<Input, Result extends ActionResult>(
  def: ActionDefinition<Input, Result>,
): Action<Input, Result> {
  return def
}

/**
 * Resolve old registrations without inventing authority, retry, evidence, or
 * continuation semantics. A legacy write remains deliberately unclassified.
 */
export function resolveActionContract(
  action: AnyAction,
): ResolvedActionInvocationContract {
  if (action.invocationContract !== undefined) {
    return {
      ...action.invocationContract,
      compatibility: 'explicit',
    }
  }

  return {
    version: 'legacy:v1',
    consequenceClass: action.readOnly ? 'read_only' : 'legacy_unclassified_write',
    materialInputPaths: [],
    authorityRequirement: action.readOnly ? 'none' : 'legacy_unspecified',
    retryClass: action.readOnly ? 'replayable' : 'legacy_unspecified',
    expectedEvidence: [],
    safeContinuations: [],
    invalidationConditions: [],
    compatibility: 'derived_from_legacy_read_only_flag',
  }
}

/** Machine-readable description of an action. */
export type AgentToolDescriptor = {
  id: string
  name: string
  summary: string
  boundaries: readonly string[]
  readOnly: boolean
  parameters: readonly ActionParameter[]
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
  hasOutputSchema: true
}

export function describeActionForAgent(action: AnyAction): AgentToolDescriptor {
  const inputJsonSchema = convertSchemaToJsonSchema(action.schema)
  const outputJsonSchema = convertSchemaToJsonSchema(action.outputSchema)

  return {
    id: action.id,
    name: action.name,
    summary: action.summary,
    boundaries: action.boundaries,
    readOnly: action.readOnly,
    parameters: action.parameters,
    ...(inputJsonSchema === undefined ? {} : { inputJsonSchema }),
    ...(outputJsonSchema === undefined ? {} : { outputJsonSchema }),
    hasOutputSchema: true,
  }
}
