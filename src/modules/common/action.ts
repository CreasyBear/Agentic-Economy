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

export type ActionSurface = 'ui' | 'http' | 'agentJson' | 'answerThread' | 'cli' | 'mcp'

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
  /** Kernel-owned execution attribution; action callers must not supply it. */
  actionInvocationExecution?: Readonly<{
    invocationRef: string
    attemptRef: string
    effectGeneration: number
  }>
  /**
   * Normalized dispatch seam that invoked this action. Attribution only; it is
   * never write authority. A caller-supplied value carries no more weight than
   * the transport it arrived on.
   */
  caller?: ActionSurface
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
}

export type ActionRunArgs<Input> = {
  data: Input
  context: ActionContext
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

export type ActionAuthorityRequirement =
  | 'none'
  | 'caller'
  | 'principal'
  | 'owner'
  | 'admin'

export type ActionRetryClass =
  | 'replayable'
  | 'attributable_retry'
  | 'reconcile_before_retry'

export type ActionEffectClass =
  | 'observation'
  | 'comparison_quote'
  | 'disclosure'
  | 'commitment'
  | 'payment'
  | 'external_state_change'

export type ActionEffectMetadata = Readonly<{
  class: ActionEffectClass
  reversible: boolean
  recipientKind: 'none' | 'business' | 'customer' | 'provider_system'
  dataClasses: readonly string[]
  spendExposure: 'none' | 'bounded' | 'unbounded'
  approval: 'none' | 'approve_each' | 'mandate_eligible'
}>

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
  readonly effect: ActionEffectMetadata
  readonly surfaces: readonly ActionSurface[]
  readonly outputSchema: z.ZodType<Result>
  readonly invocationContract: ActionInvocationContract
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

/** Return the action's declared invocation contract without deriving metadata. */
export function resolveActionContract(action: AnyAction): ActionInvocationContract {
  return action.invocationContract
}

/** Machine-readable description of an action. */
export type AgentToolDescriptor = {
  id: string
  name: string
  summary: string
  boundaries: readonly string[]
  readOnly: boolean
  effect: ActionEffectMetadata
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
    effect: action.effect,
    parameters: action.parameters,
    ...(inputJsonSchema === undefined ? {} : { inputJsonSchema }),
    ...(outputJsonSchema === undefined ? {} : { outputJsonSchema }),
    hasOutputSchema: true,
  }
}
