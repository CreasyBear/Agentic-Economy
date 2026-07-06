import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Agent-native action contract for AE.
 *
 * One declaration fans out to every surface: the React UI, the HTTP API, the
 * agent JSON payload, and the quiet assistant tools door that stays out of
 * public human copy.
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

export type ActionSurface = 'ui' | 'http' | 'agentJson' | 'agentTools'

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
  /** The raw incoming request, when available (HTTP / agent-tools surfaces). */
  request?: Request
  /** Internal timing sink used by answer turns; never exposed on human surfaces. */
  timing?: ActionTimingSink
  /** Signed request identity for attribution/quota/audit only; never write authority. */
  agentIdentity?: ActionAgentIdentity
  /** Per-tool admission for signed agent writes; identity alone never grants this. */
  agentToolAdmission?: {
    toolId: string
    scope: 'public_inquiry' | 'business_action_request'
    principalId: string
  }
  /** Harness-only approval authority for owner/admin-gated tools. */
  harnessApproval?: ActionHarnessApprovalContext
}

export type ActionRunArgs<Input> = {
  data: Input
  context: ActionContext
}

export type ActionParameterType = 'string' | 'number' | 'boolean' | 'enum'

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

/** Agent-facing description of an action, used by the agent-tools list surface. */
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
