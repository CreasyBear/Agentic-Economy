import type { JSONSchema } from '@tanstack/ai'

import {
  type ActionSurface,
  type AnyAction,
} from '@/modules/common/action'
import {
  actionToToolContract,
  type ActionToolContract,
  type ActionToolExecuteArgs,
} from '@/modules/actions/tool-contract'
import { ANSWER_READ_TOOL_IDS } from '@/modules/answer-thread/answer-thread.schema'
import type {
  HarnessApprovalMode,
} from './approval-policy'
import type {
  HarnessApprovalPolicy,
  HarnessToolConcurrency,
  HarnessToolDefinition,
  HarnessToolLoadMode,
  HarnessToolTier,
} from './harness.schema'
import { isRecord } from '@/modules/common/is-record'

export type HarnessApprovalDeclaration = {
  mode: HarnessApprovalMode
  policy: HarnessApprovalPolicy
  reason: string
}

export type HarnessToolExposure = {
  surfaces: readonly ActionSurface[]
  answerModel: boolean
  publicProjection: 'none' | 'sanitized-counts' | 'receipt-status'
}

export type HarnessToolPolicy = {
  tier: HarnessToolTier
  approval: HarnessApprovalDeclaration
  concurrency?: HarnessToolConcurrency
  interruptible?: boolean
  loadMode?: HarnessToolLoadMode
  hidden?: boolean
  timeoutMs?: number
}

export type HarnessToolProjection<Output> = {
  publicProjection: HarnessToolExposure['publicProjection']
  summarizeOutput(output: Output): unknown
}

export type HarnessExecuteArgs<Input> = ActionToolExecuteArgs<Input> & {
  signal?: AbortSignal
}

export type HarnessToolContract<Input = unknown, Output = unknown> =
  Omit<ActionToolContract<Input, Output>, 'readOnly' | 'surfaces' | 'execute'> & {
    execute(args: HarnessExecuteArgs<Input>): Promise<Output>
    exposure: HarnessToolExposure
    policy: HarnessToolPolicy
    projection: HarnessToolProjection<Output>
  }

export type HarnessToolBoundaryEvent =
  | Readonly<{ kind: 'approval_policy'; policy: HarnessApprovalPolicy; reason: string }>
  | Readonly<{ kind: 'direct_runner_started'; actionId: string }>
  | Readonly<{ kind: 'direct_runner_returned'; actionId: string; outcome: string }>
  | Readonly<{ kind: 'action_invocation'; invocationRef: string }>
  | Readonly<{ kind: 'control'; invocationRef: string }>
  | Readonly<{ kind: 'attempt'; invocationRef: string; attemptRef: string }>
  | Readonly<{ kind: 'history'; invocationRef: string; commandId: string }>
  | Readonly<{
      kind: 'direct_control_snapshot'
      actionInvocationEmissions: number
      controlEmissions: number
      attemptEmissions: number
      historyEmissions: number
      approvalPolicyEmissions: number
    }>

export type HarnessToolBoundaryInstrumentation = Readonly<{
  record(event: HarnessToolBoundaryEvent): void
  snapshot(): HarnessDirectControlSnapshot
}>

export type HarnessDirectControlSnapshot = Readonly<{
  actionInvocationEmissions: number
  controlEmissions: number
  attemptEmissions: number
  historyEmissions: number
  approvalPolicyEmissions: number
}>

export function createHarnessToolBoundaryInstrumentation(
  onEvent?: (event: HarnessToolBoundaryEvent) => void,
): HarnessToolBoundaryInstrumentation {
  const counts = {
    actionInvocationEmissions: 0,
    controlEmissions: 0,
    attemptEmissions: 0,
    historyEmissions: 0,
    approvalPolicyEmissions: 0,
  }
  return {
    record(event) {
      if (event.kind === 'action_invocation') counts.actionInvocationEmissions += 1
      if (event.kind === 'control') counts.controlEmissions += 1
      if (event.kind === 'attempt') counts.attemptEmissions += 1
      if (event.kind === 'history') counts.historyEmissions += 1
      if (event.kind === 'approval_policy') counts.approvalPolicyEmissions += 1
      onEvent?.(event)
    },
    snapshot: () => Object.freeze({ ...counts }),
  }
}

export type HarnessToolEvalFixture = {
  schemaVersion: 1
  toolId: string
  descriptorHash: string
  exposure: Pick<HarnessToolExposure, 'answerModel' | 'publicProjection'>
  policy: Pick<HarnessToolPolicy, 'tier' | 'approval'>
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
  providerViolations: readonly string[]
}

export function actionToHarnessToolContract(
  action: AnyAction,
  instrumentation?: HarnessToolBoundaryInstrumentation,
): HarnessToolContract<unknown, unknown> {
  const actionContract = actionToToolContract(action)
  const exposure = exposureForAction(actionContract)
  const policy = policyForAction(actionContract, exposure)

  const execute: HarnessToolContract<unknown, unknown>['execute'] = async ({ input, context }) => {
    instrumentation?.record({
      kind: 'approval_policy',
      policy: policy.approval.policy,
      reason: policy.approval.reason,
    })
    instrumentation?.record({ kind: 'direct_runner_started', actionId: action.id })
    const result = await actionContract.execute({ input, context }) as { kind: string }
    instrumentation?.record({
      kind: 'direct_runner_returned',
      actionId: action.id,
      outcome: result.kind,
    })
    if (instrumentation !== undefined) {
      instrumentation.record({ kind: 'direct_control_snapshot', ...instrumentation.snapshot() })
    }
    return result
  }

  return {
    id: actionContract.id,
    name: actionContract.name,
    summary: actionContract.summary,
    boundaries: actionContract.boundaries,
    parameters: actionContract.parameters,
    exposure,
    policy,
    schemas: actionContract.schemas,
    execute,
    projection: {
      publicProjection: exposure.publicProjection,
      summarizeOutput: summarizeActionOutput,
    },
  }
}

export function harnessToolContractToDefinition<Input, Output>(
  contract: HarnessToolContract<Input, Output>,
): HarnessToolDefinition<Input, Output> {
  return {
    id: contract.id,
    name: contract.name,
    summary: contract.summary,
    boundaries: contract.boundaries,
    tier: contract.policy.tier,
    surfaces: contract.exposure.surfaces,
    inputSchema: contract.schemas.inputSchema,
    outputSchema: contract.schemas.outputSchema,
    ...(contract.schemas.inputJsonSchema === undefined ? {} : { inputJsonSchema: contract.schemas.inputJsonSchema }),
    ...(contract.schemas.outputJsonSchema === undefined ? {} : { outputJsonSchema: contract.schemas.outputJsonSchema }),
    approval: contract.policy.approval.policy,
    ...(contract.policy.hidden === undefined ? {} : { hidden: contract.policy.hidden }),
    ...(contract.policy.loadMode === undefined ? {} : { loadMode: contract.policy.loadMode }),
    ...(contract.policy.concurrency === undefined ? {} : { concurrency: contract.policy.concurrency }),
    ...(contract.policy.interruptible === undefined ? {} : { interruptible: contract.policy.interruptible }),
    run: contract.execute,
    summarizeOutput: contract.projection.summarizeOutput,
  }
}

export function buildHarnessToolEvalFixture(
  contract: HarnessToolContract,
): HarnessToolEvalFixture {
  return {
    schemaVersion: 1,
    toolId: contract.id,
    descriptorHash: contract.schemas.descriptorHash,
    exposure: {
      answerModel: contract.exposure.answerModel,
      publicProjection: contract.exposure.publicProjection,
    },
    policy: {
      tier: contract.policy.tier,
      approval: contract.policy.approval,
    },
    ...(contract.schemas.inputJsonSchema === undefined ? {} : { inputJsonSchema: contract.schemas.inputJsonSchema }),
    ...(contract.schemas.outputJsonSchema === undefined ? {} : { outputJsonSchema: contract.schemas.outputJsonSchema }),
    providerViolations: contract.schemas.providerViolations,
  }
}

export function buildHarnessToolContracts(
  actions: readonly AnyAction[],
): readonly HarnessToolContract[] {
  return actions.map((action) => actionToHarnessToolContract(action))
}

export function filterAnswerModelToolContracts(
  contracts: readonly HarnessToolContract[],
): readonly HarnessToolContract[] {
  return sortContractsById(
    contracts.filter((contract) => contract.exposure.answerModel && contract.policy.tier === 'read'),
    ANSWER_READ_TOOL_IDS,
  )
}

function exposureForAction(
  action: Pick<ActionToolContract, 'id' | 'readOnly' | 'surfaces'>,
): HarnessToolExposure {
  const answerModel = action.readOnly && isAnswerModelToolId(action.id)
  const publicProjection = action.readOnly
    ? 'sanitized-counts'
    : action.id === 'inquiry.submit'
      ? 'receipt-status'
      : 'none'

  return {
    surfaces: action.surfaces,
    answerModel,
    publicProjection,
  }
}

function policyForAction(
  action: Pick<ActionToolContract, 'id' | 'readOnly'>,
  _exposure: HarnessToolExposure,
): HarnessToolPolicy {
  const tier: HarnessToolTier = action.readOnly ? 'read' : 'write'

  if (action.id === 'inquiry.submit') {
    return {
      tier,
      approval: {
        mode: 'public-qualified-write',
        policy: 'prompt',
        reason: 'write_requires_source_admission',
      },
      concurrency: 'exclusive',
      interruptible: false,
      loadMode: 'essential',
    }
  }

  return {
    tier,
    approval: {
      mode: 'owner-ui',
      policy: tier === 'read' ? 'allow' : 'prompt',
      reason: tier === 'read' ? 'owner_read_requires_auth' : 'owner_write_requires_auth',
    },
    concurrency: tier === 'read' ? 'shared' : 'exclusive',
    interruptible: tier === 'read',
    loadMode: 'discoverable',
    hidden: true,
  }
}

function isAnswerModelToolId(id: string): boolean {
  return (ANSWER_READ_TOOL_IDS as readonly string[]).includes(id)
}

function sortContractsById(
  contracts: readonly HarnessToolContract[],
  ids: readonly string[],
): readonly HarnessToolContract[] {
  const order = new Map(ids.map((id, index) => [id, index]))
  return [...contracts].sort((left, right) => {
    const leftIndex = order.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = order.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex || left.id.localeCompare(right.id)
  })
}

function summarizeActionOutput(output: unknown): unknown {
  if (isRecord(output) && typeof output.kind === 'string') {
    return { kind: output.kind }
  }
  return { kind: 'ok' }
}
