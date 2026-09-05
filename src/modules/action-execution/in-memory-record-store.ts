import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import type {
  ActionExecutionOrigin,
  ActionExecutionView,
  AuthorityBindingSnapshot,
  DecisionRefusalCode,
  InMemoryControlSnapshot,
  ExecutionActor,
  PreparedExecution,
} from './contracts'
import type { DevelopmentReleaseSignal, DevelopmentTimeoutSignal } from './attempts'
import type { ReconciliationEvidenceVerifier } from './reconciliation-evidence'
import { readPath } from './preparation'
import { stableStringify } from '@/modules/common/stable-hash'

export type InMemoryTracerOptions<Input, Result extends ActionResult> = Readonly<{
  action: Action<Input, Result>
  now: () => string
  nextExecutionRef: () => string
  nextAuthorityRef?: () => string
  nextAttemptRef?: () => string
  developmentReleaseSignal?: DevelopmentReleaseSignal
  onExecutionResolved?: (view: ActionExecutionView<Result>) => void
  sourceRefForExecution?: (
    view: ActionExecutionView<Result>,
    input: Input,
  ) => string
  developmentTimeoutSignal?: DevelopmentTimeoutSignal
  verifyReconciliationEvidence?: ReconciliationEvidenceVerifier
  contextForExecution?: (context: ActionContext) => ActionContext
  beforeEffectRelease?: (
    view: ActionExecutionView<Result>,
    effectGeneration: number,
  ) => DecisionRefusalCode | undefined | Promise<DecisionRefusalCode | undefined>
  initialSnapshot?: InMemoryControlSnapshot<Result>
  resolveSourceState?: (sourceRef: string) => Readonly<{
    input: Input
    context: ActionContext
    prepared: PreparedExecution
    observedResolution: ActionExecutionView<Result>['observedResolution']
  }>
}>

type InMemoryView<Result extends ActionResult> = ActionExecutionView<Result> & Readonly<{
  persistence: 'in_memory_only'
}>

function inMemoryView<Result extends ActionResult>(
  view: ActionExecutionView<Result>,
): InMemoryView<Result> {
  return { ...view, persistence: 'in_memory_only' }
}

export type StoredExecution<Input, Result extends ActionResult> = {
  sourceRef: string
  view: ActionExecutionView<Result>
  input: Input
  context: ActionContext
  authorityBinding?: AuthorityBindingSnapshot
  reconciliationEvidence?: Map<string, string>
}

export function createRecordStore<Input, Result extends ActionResult>(
  options: InMemoryTracerOptions<Input, Result>,
): Map<string, StoredExecution<Input, Result>> {
  return new Map(options.initialSnapshot?.records.map((record) => {
    const source = options.resolveSourceState?.(record.sourceRef)
    if (source === undefined) throw new Error(`Missing source state for ${record.sourceRef}.`)
    return [record.control.executionRef, {
      sourceRef: record.sourceRef,
      view: inMemoryView({
        ...record.control,
        prepared: source.prepared,
        observedResolution: source.observedResolution,
      }),
      input: source.input,
      context: source.context,
      ...(record.authorityBinding === undefined ? {} : { authorityBinding: record.authorityBinding }),
      reconciliationEvidence: new Map(),
    }]
  }) ?? [])
}

export function exportControlSnapshot<Input, Result extends ActionResult>(
  records: Map<string, StoredExecution<Input, Result>>,
): InMemoryControlSnapshot<Result> {
  return {
    format: 'action-execution-control:development:v1',
    records: [...records.values()].map(({ view, sourceRef, authorityBinding }) => {
      const {
        prepared: _prepared,
        observedResolution: _observedResolution,
        persistence: _persistence,
        ...control
      } = view as InMemoryView<Result>
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
  origin: ActionExecutionOrigin,
  actor: ExecutionActor,
  input: Input,
  context: ActionContext,
  continuation?: Readonly<{ executionRef: string; expectedExecutionVersion: number }>,
): StoredExecution<Input, Result> {
  const executionRef = continuation?.executionRef ?? options.nextExecutionRef()
  const provisionalView = inMemoryView<Result>({
    executionRef,
    executionVersion: (continuation?.expectedExecutionVersion ?? 0) + 1,
    origin,
    owner: actor,
    action: { id: options.action.id, contractVersion },
    desired: { state: 'invoke' },
    attempts: [],
    observedResolution: { state: 'pending' },
    freshness: { state: 'not_observed' },
    control: { state: 'in_progress' },
  })
  const sourceRef = options.sourceRefForExecution?.(provisionalView, input)
    ?? readPath(input, 'operationKey')
  return {
    sourceRef: typeof sourceRef === 'string' ? sourceRef : executionRef,
    input,
    context,
    view: provisionalView,
    reconciliationEvidence: new Map(),
  }
}

export function nextView<Result extends ActionResult>(
  view: ActionExecutionView<Result>,
  change: Partial<ActionExecutionView<Result>>,
): ActionExecutionView<Result> {
  return { ...view, ...change, executionVersion: view.executionVersion + 1 }
}

export function checkBinding<Input, Result extends ActionResult>(
  record: StoredExecution<Input, Result> | undefined,
  input: {
    expectedExecutionVersion: number
    authorityRef: string
    actor: ExecutionActor
    origin: ActionExecutionOrigin
  },
  now: string,
): { kind: 'ok'; record: StoredExecution<Input, Result> } | Readonly<{
  kind: 'refused'
  code: DecisionRefusalCode
  view?: ActionExecutionView<Result>
}> {
  if (!record?.authorityBinding) return { kind: 'refused', code: 'execution_not_found' }
  if (record.view.executionVersion !== input.expectedExecutionVersion) {
    return { kind: 'refused', code: 'stale_execution_version', view: record.view }
  }
  const binding = record.authorityBinding
  if (
    binding.reference !== input.authorityRef ||
    binding.actor.callerRef !== input.actor.callerRef ||
    binding.actor.principalRef !== input.actor.principalRef
  ) return { kind: 'refused', code: 'cross_principal_refused', view: record.view }
  if (stableStringify(binding.origin) !== stableStringify(input.origin)) {
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
