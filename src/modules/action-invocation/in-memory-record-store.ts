import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  AuthorityBindingSnapshot,
  DecisionRefusalCode,
  InMemoryControlSnapshot,
  InvocationActor,
  PreparedInvocation,
} from './contracts'
import type { DevelopmentReleaseSignal, DevelopmentTimeoutSignal } from './attempts'
import type { ReconciliationEvidenceVerifier } from './reconciliation-evidence'
import { readPath } from './preparation'

export type InMemoryTracerOptions<Input, Result extends ActionResult> = Readonly<{
  action: Action<Input, Result>
  now: () => string
  nextInvocationRef: () => string
  nextAuthorityRef?: () => string
  nextAttemptRef?: () => string
  releaseTracking?: 'conservative' | 'monotonic_controller'
  /** Legacy development observer; ignored by monotonic-controller execution. */
  developmentReleaseSignal?: DevelopmentReleaseSignal
  developmentTimeoutSignal?: DevelopmentTimeoutSignal
  verifyReconciliationEvidence?: ReconciliationEvidenceVerifier
  contextForExecution?: (context: ActionContext) => ActionContext
  beforeEffectRelease?: (
    view: ActionInvocationView<Result>,
    effectGeneration: number,
  ) => DecisionRefusalCode | undefined | Promise<DecisionRefusalCode | undefined>
  initialSnapshot?: InMemoryControlSnapshot<Input, Result>
  resolveSourceState?: (sourceRef: string) => Readonly<{
    input: Input
    context: ActionContext
    prepared: PreparedInvocation
    observedResolution: ActionInvocationView<Result>['observedResolution']
  }>
}>

export type StoredInvocation<Input, Result extends ActionResult> = {
  view: ActionInvocationView<Result>
  input: Input
  context: ActionContext
  authorityBinding?: AuthorityBindingSnapshot
  reconciliationEvidence?: Map<string, string>
}

export function createRecordStore<Input, Result extends ActionResult>(
  options: InMemoryTracerOptions<Input, Result>,
): Map<string, StoredInvocation<Input, Result>> {
  return new Map(options.initialSnapshot?.records.map((record) => {
    const source = options.resolveSourceState?.(record.sourceRef)
    if (source === undefined) throw new Error(`Missing source state for ${record.sourceRef}.`)
    return [record.control.invocationRef, {
      view: {
        ...record.control,
        prepared: source.prepared,
        observedResolution: source.observedResolution,
      },
      input: source.input,
      context: source.context,
      ...(record.authorityBinding === undefined ? {} : { authorityBinding: record.authorityBinding }),
      reconciliationEvidence: new Map(),
    }]
  }) ?? [])
}

export function exportControlSnapshot<Input, Result extends ActionResult>(
  records: Map<string, StoredInvocation<Input, Result>>,
): InMemoryControlSnapshot<Input, Result> {
  return {
    format: 'action-invocation-control:development:v1',
    records: [...records.values()].map(({ view, input, authorityBinding }) => {
      const sourceRef = readPath(input, 'operationKey')
      if (typeof sourceRef !== 'string') {
        throw new Error(`Invocation ${view.invocationRef} has no source-owned operation reference.`)
      }
      const { prepared: _prepared, observedResolution: _observedResolution, ...control } = view
      return {
        sourceRef,
        control,
        ...(authorityBinding === undefined ? {} : { authorityBinding }),
      }
    }),
  }
}

export function createRecord<Input, Result extends ActionResult>(
  options: InMemoryTracerOptions<Input, Result>,
  contractVersion: string,
  origin: ActionInvocationOrigin,
  actor: InvocationActor,
  input: Input,
  context: ActionContext,
): StoredInvocation<Input, Result> {
  return {
    input,
    context,
    view: {
      invocationRef: options.nextInvocationRef(),
      invocationVersion: 1,
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'in_memory_only',
      origin,
      owner: actor,
      action: { id: options.action.id, contractVersion },
      desired: { state: 'invoke' },
      attempts: [],
      observedResolution: { state: 'pending' },
      freshness: { state: 'not_observed' },
      control: { state: 'in_progress' },
    },
    reconciliationEvidence: new Map(),
  }
}

export function nextView<Result extends ActionResult>(
  view: ActionInvocationView<Result>,
  change: Partial<ActionInvocationView<Result>>,
): ActionInvocationView<Result> {
  return { ...view, ...change, invocationVersion: view.invocationVersion + 1 }
}

export function checkBinding<Input, Result extends ActionResult>(
  record: StoredInvocation<Input, Result> | undefined,
  input: {
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
  },
  now: string,
): { kind: 'ok'; record: StoredInvocation<Input, Result> } | Readonly<{
  kind: 'refused'
  code: DecisionRefusalCode
  view?: ActionInvocationView<Result>
}> {
  if (!record?.authorityBinding) return { kind: 'refused', code: 'invocation_not_found' }
  if (record.view.invocationVersion !== input.expectedInvocationVersion) {
    return { kind: 'refused', code: 'stale_invocation_version', view: record.view }
  }
  const binding = record.authorityBinding
  if (
    binding.reference !== input.authorityRef ||
    binding.actor.callerRef !== input.actor.callerRef ||
    binding.actor.principalRef !== input.actor.principalRef
  ) return { kind: 'refused', code: 'cross_principal_refused', view: record.view }
  if (JSON.stringify(binding.origin) !== JSON.stringify(input.origin)) {
    return { kind: 'refused', code: 'cross_origin_refused', view: record.view }
  }
  if (Date.parse(now) >= Date.parse(binding.expiresAt)) {
    record.view = nextView(record.view, {
      control: { state: 'invalidated', reason: 'authority_expired' },
    })
    return { kind: 'refused', code: 'authority_expired', view: record.view }
  }
  return { kind: 'ok', record }
}
