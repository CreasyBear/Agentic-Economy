import {
  createPaidOperationSemantics,
  projectRichPaidOperation,
  projectStructuredPaidOperation,
  type PaidOperationApplicationService,
  type PaidOperationContinuation,
  type PaidOperationProjection,
  type PaidOperationSemantics,
} from '../../../src/modules/action-invocation'
import type { PaidOperationSurfaceRef } from '../paid-operation-surface-host'

export const PAID_OPERATION_BROWSER_STATES = [
  'golden',
  'ready_for_permission',
  'prepared',
  'refused_before_release',
  'invalid_selector',
  'duplicate_stale_disallowed',
  'update_not_confirmed',
  'possibly_submitted',
  'settlement_unknown',
  'reconciliation_in_progress',
  'reconciled_not_settled',
  'invalid_result',
  'settled_invalid_result',
  'completed',
  'read_unavailable',
] as const

export type PaidOperationBrowserState = typeof PAID_OPERATION_BROWSER_STATES[number]

type RenderableBrowserState = Exclude<
  PaidOperationBrowserState,
  'golden' | 'read_unavailable'
>

type BrowserCounters = Readonly<{
  invocationCreations: number
  effectGenerations: number
  releaseAttempts: number
  commandAttempts: number
  readOnlyInspections: number
}>

type BrowserRecord = Readonly<{
  state: RenderableBrowserState
  version: number
  counters: BrowserCounters
}>

type BrowserStorage = Readonly<{
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}>

const INVOCATION_REF = 'invocation:local-document-translation'

export function paidOperationBrowserFixture(
  requestedState: string,
  options: Readonly<{
    persistenceKey?: string
    storage?: BrowserStorage
    commandDelayMs?: number
  }> = {},
): Readonly<{
  service: PaidOperationApplicationService
  ref: PaidOperationSurfaceRef
  currentRef: () => PaidOperationSurfaceRef
  resolveReconciliationEvidence: NonNullable<
    Parameters<typeof import('../paid-operation-surface-host').AePaidOperationDevelopmentSurface>[0][
      'resolveReconciliationEvidence'
    ]
  >
  transportRescue: Readonly<{
    inspectRelation: string
    expectedInvocationVersion: number
  }> | null
  inspectOnly: (relation: string) => void
  proof: () => Readonly<{
    fixtureState: string
    expectedInvocationVersion: number
    counters: BrowserCounters
  }>
}> {
  const state = isBrowserState(requestedState) ? requestedState : 'prepared'
  const storageKey = options.persistenceKey === undefined
    ? null
    : `paid-operation-browser:${options.persistenceKey}`
  let record = loadRecord(state, storageKey, options.storage)

  function currentRecord(): BrowserRecord {
    return record
  }

  function store(next: BrowserRecord) {
    record = next
    if (storageKey !== null) options.storage?.setItem(storageKey, JSON.stringify(next))
  }

  function acceptedProjection() {
    return {
      kind: 'accepted',
      value: project(currentRecord().state, currentRecord().version),
    } as const
  }

  const service: PaidOperationApplicationService = {
    inspect: () => state === 'read_unavailable'
      ? { kind: 'refused', code: 'invocation_not_found' }
      : acceptedProjection(),
    command: async (input) => {
      if (options.commandDelayMs !== undefined && options.commandDelayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, options.commandDelayMs))
      }
      const current = currentRecord()
      if (
        input.invocationRef !== INVOCATION_REF
        || input.expectedInvocationVersion !== current.version
      ) {
        return { kind: 'refused', code: 'stale_invocation_version' }
      }
      const projection = project(current.state, current.version)
      if (!projection.semantics.continuations.some(({ kind }) => kind === input.command.kind)) {
        return { kind: 'refused', code: 'continuation_not_allowed' }
      }
      store(transition(current, input.command))
      return acceptedProjection()
    },
  }
  const currentRef = () => ({
    invocationRef: INVOCATION_REF,
    expectedInvocationVersion: currentRecord().version,
  })
  return {
    service,
    ref: currentRef(),
    currentRef,
    resolveReconciliationEvidence: () => ({
      reconciliationEvidence: {
        kind: 'action_invocation_reconciliation',
        version: 1,
        evidenceRef: 'evidence:local-provider-reconciliation',
        invocationRef: INVOCATION_REF,
        attemptRef: 'attempt:local-document-translation',
        effectGeneration: 1,
        observedAt: '2026-07-20T00:00:00.000Z',
        source: 'provider_api',
        resolution: 'not_released',
        digest: `sha256:${'2'.repeat(64)}`,
      },
      paymentReconciliationEvidence: {
        kind: 'x402_payment_reconciliation',
        version: 1,
        evidenceRef: 'evidence:local-payment-reconciliation',
        evidenceRefs: ['evidence:local-payment-reconciliation'],
        invocationRef: INVOCATION_REF,
        attemptRef: 'attempt:local-document-translation',
        effectGeneration: 1,
        observedAt: '2026-07-20T00:00:00.000Z',
        source: 'payment_facilitator',
        paymentIdentifier: 'payment:local-document-translation',
        challengeDigest: `sha256:${'1'.repeat(64)}`,
        providerEndpoint: 'https://fixture.invalid/pay',
        scheme: 'exact',
        network: 'local',
        asset: 'fixture-credit',
        payTo: 'fixture-recipient',
        amount: '2.50',
        resolution: 'not_settled',
        digest: `sha256:${'3'.repeat(64)}`,
      },
    }),
    transportRescue: state === 'update_not_confirmed'
      ? {
          inspectRelation: `/local-fixture/paid-operation/${INVOCATION_REF}`,
          expectedInvocationVersion: currentRecord().version,
        }
      : null,
    inspectOnly: () => {
      const current = currentRecord()
      store({
        ...current,
        counters: {
          ...current.counters,
          readOnlyInspections: current.counters.readOnlyInspections + 1,
        },
      })
    },
    proof: () => ({
      fixtureState: currentRecord().state,
      expectedInvocationVersion: currentRecord().version,
      counters: currentRecord().counters,
    }),
  }
}

function project(
  state: RenderableBrowserState,
  version: number,
): PaidOperationProjection {
  const semantics = createPaidOperationSemantics(stateSemantics(state, version))
  return {
    semantics,
    human: projectRichPaidOperation(semantics),
    agent: projectStructuredPaidOperation(semantics),
  }
}

function stateSemantics(
  state: RenderableBrowserState,
  version: number,
): Omit<PaidOperationSemantics, 'schema'> {
  const base = baseSemantics(version)
  switch (state) {
    case 'ready_for_permission':
      return {
        ...base,
        queryRelease: { state: 'not_released' },
        paymentAuthorization: { state: 'not_created' },
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: null,
        continuations: authorize(version),
      }
    case 'prepared':
    case 'update_not_confirmed':
      return {
        ...base,
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: null,
        continuations: execute(version),
      }
    case 'refused_before_release':
      return {
        ...base,
        queryRelease: { state: 'not_released' },
        paymentAuthorization: { state: 'not_created' },
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: {
          code: 'authority_refused',
          phase: 'authority',
          queryReleaseStatus: 'not_released',
          paymentSubmissionStatus: 'not_submitted',
          settlementStatus: 'no_evidence',
          resultStatus: 'not_delivered',
          retryability: 'not_retryable',
          safeNextAction: 'inspect',
          evidenceRefs: ['evidence:local-refusal'],
        },
        continuations: inspect(version),
      }
    case 'invalid_selector':
      return {
        ...base,
        queryRelease: { state: 'not_released' },
        paymentAuthorization: { state: 'not_created' },
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: {
          code: 'invalid_operation_selector',
          phase: 'inspection',
          queryReleaseStatus: 'not_released',
          paymentSubmissionStatus: 'not_submitted',
          settlementStatus: 'no_evidence',
          resultStatus: 'not_delivered',
          retryability: 'not_retryable',
          safeNextAction: null,
          evidenceRefs: ['evidence:local-invalid-selector'],
        },
        continuations: [],
      }
    case 'duplicate_stale_disallowed':
      return {
        ...base,
        queryRelease: { state: 'not_released' },
        paymentAuthorization: { state: 'not_created' },
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: {
          code: 'stale_or_disallowed_command',
          phase: 'inspection',
          queryReleaseStatus: 'not_released',
          paymentSubmissionStatus: 'not_submitted',
          settlementStatus: 'no_evidence',
          resultStatus: 'not_delivered',
          retryability: 'not_retryable',
          safeNextAction: 'inspect',
          evidenceRefs: ['evidence:local-stale-command'],
        },
        continuations: inspect(version),
      }
    case 'possibly_submitted':
    case 'settlement_unknown':
      return base
    case 'reconciliation_in_progress':
      return {
        ...base,
        error: {
          ...base.error!,
          code: 'reconciliation_in_progress',
          safeNextAction: 'inspect',
        },
        continuations: inspect(version),
      }
    case 'reconciled_not_settled':
      return {
        ...base,
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:local-dispatch'] },
        settlement: { state: 'not_settled', evidenceRefs: ['evidence:local-reconciliation'] },
        error: null,
        continuations: inspect(version),
      }
    case 'invalid_result':
      return {
        ...base,
        resultDelivery: {
          state: 'invalid',
          code: 'result_invalid',
          evidenceRefs: ['evidence:local-invalid-result'],
        },
        error: {
          ...base.error!,
          code: 'result_invalid',
          phase: 'result_validation',
          resultStatus: 'invalid',
        },
      }
    case 'settled_invalid_result':
      return {
        ...base,
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:local-dispatch'] },
        settlement: {
          state: 'settled',
          amount: { currency: 'AUD', amountMinor: 250 },
          evidenceRefs: ['evidence:local-settlement'],
        },
        resultDelivery: {
          state: 'invalid',
          code: 'result_invalid',
          evidenceRefs: ['evidence:local-invalid-result'],
        },
        error: null,
        continuations: inspect(version),
      }
    case 'completed':
      return {
        ...base,
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:local-dispatch'] },
        settlement: {
          state: 'settled',
          amount: { currency: 'AUD', amountMinor: 250 },
          evidenceRefs: ['evidence:local-settlement'],
        },
        resultDelivery: {
          state: 'valid',
          blocks: [{
            kind: 'status',
            label: 'Translation',
            value: 'Validated local mock result',
            tone: 'positive',
          }],
          evidenceRefs: ['evidence:local-result'],
        },
        error: null,
        continuations: inspect(version),
      }
  }
}

function baseSemantics(version: number): Omit<PaidOperationSemantics, 'schema'> {
  return {
    identity: {
      invocationRef: INVOCATION_REF,
      expectedInvocationVersion: version,
    },
    operation: {
      operationKey: 'documents.translate',
      providerId: 'provider:local-translation',
      providerName: 'Local Translation Provider',
      operationRevision: 'local-development:v1',
      materialInputs: {
        documentRef: 'document:labelled-local-fixture',
        targetLanguage: 'French',
      },
    },
    presentation: {
      title: 'Translate the supplied document',
      summary: 'A labelled local mock operation for browser evaluation only.',
      blocks: [{ kind: 'text', label: 'Target language', value: 'French' }],
    },
    maximumAuthorizedCharge: { currency: 'AUD', amountMinor: 250 },
    queryRelease: {
      state: 'unknown',
      evidenceRefs: ['evidence:local-release-unknown'],
    },
    paymentAuthorization: {
      state: 'created',
      paymentIdentifier: 'payment:local-document-translation',
      custodyReference: {
        kind: 'opaque_digest_reference',
        algorithm: 'sha256',
        digest: `sha256:${'0'.repeat(64)}`,
      },
      evidenceRefs: ['evidence:local-payment-prepared'],
    },
    paymentSubmission: {
      state: 'possibly_submitted',
      evidenceRefs: ['evidence:local-submission-unknown'],
    },
    settlement: {
      state: 'unknown',
      evidenceRefs: ['evidence:local-settlement-unknown'],
    },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Local labelled sandbox',
      evidenceClass: 'local_labelled_sandbox_fixture',
      claimCeiling: 'Local browser mechanics and projection parity only.',
    },
    error: {
      code: 'reconciliation_required',
      phase: 'reconciliation',
      queryReleaseStatus: 'unknown',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      resultStatus: 'not_delivered',
      retryability: 'reconcile_before_retry',
      safeNextAction: 'reconcile',
      evidenceRefs: [
        'evidence:local-release-unknown',
        'evidence:local-submission-unknown',
        'evidence:local-settlement-unknown',
      ],
    },
    continuations: reconcile(version),
  }
}

function transition(
  current: BrowserRecord,
  command: Parameters<PaidOperationApplicationService['command']>[0]['command'],
): BrowserRecord {
  const commandAttempts = current.counters.commandAttempts + 1
  if (current.state === 'ready_for_permission' && command.kind === 'authorize') {
    return {
      state: command.accept ? 'prepared' : 'refused_before_release',
      version: current.version + 1,
      counters: {
        ...current.counters,
        commandAttempts,
      },
    }
  }
  if (current.state === 'prepared' && command.kind === 'execute') {
    return {
      state: 'completed',
      version: current.version + 1,
      counters: {
        ...current.counters,
        commandAttempts,
        effectGenerations: current.counters.effectGenerations + 1,
        releaseAttempts: current.counters.releaseAttempts + 1,
      },
    }
  }
  return {
    ...current,
    counters: {
      ...current.counters,
      commandAttempts,
    },
  }
}

function loadRecord(
  state: PaidOperationBrowserState,
  storageKey: string | null,
  storage: BrowserStorage | undefined,
): BrowserRecord {
  if (storageKey !== null) {
    const stored = storage?.getItem(storageKey)
    if (stored !== null && stored !== undefined) {
      const candidate = JSON.parse(stored) as Partial<BrowserRecord>
      if (
        typeof candidate.state === 'string'
        && isRenderableBrowserState(candidate.state)
        && Number.isSafeInteger(candidate.version)
        && countersValid(candidate.counters)
      ) {
        return candidate as BrowserRecord
      }
    }
  }
  return {
    state: state === 'golden' ? 'ready_for_permission' : renderableState(state),
    version: 3,
    counters: {
      invocationCreations: 1,
      effectGenerations: 0,
      releaseAttempts: 0,
      commandAttempts: 0,
      readOnlyInspections: 0,
    },
  }
}

function renderableState(state: PaidOperationBrowserState): RenderableBrowserState {
  if (state === 'golden' || state === 'read_unavailable') return 'ready_for_permission'
  return state
}

function inspect(version: number): readonly PaidOperationContinuation[] {
  return [{
    kind: 'inspect',
    command: 'inspect_paid_operation',
    requiredInput: [],
    expectedInvocationVersion: version,
    authorityRequired: false,
  }]
}

function reconcile(version: number): readonly PaidOperationContinuation[] {
  return [{
    kind: 'reconcile',
    command: 'reconcile_paid_operation',
    requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
    expectedInvocationVersion: version,
    authorityRequired: false,
  }]
}

function authorize(version: number): readonly PaidOperationContinuation[] {
  return [{
    kind: 'authorize',
    command: 'authorize_paid_operation',
    requiredInput: ['authorityDecision'],
    expectedInvocationVersion: version,
    authorityRequired: true,
  }]
}

function execute(version: number): readonly PaidOperationContinuation[] {
  return [{
    kind: 'execute',
    command: 'execute_paid_operation',
    requiredInput: [],
    expectedInvocationVersion: version,
    authorityRequired: true,
  }]
}

function countersValid(value: unknown): value is BrowserCounters {
  if (value === null || typeof value !== 'object') return false
  return [
    'invocationCreations',
    'effectGenerations',
    'releaseAttempts',
    'commandAttempts',
    'readOnlyInspections',
  ].every((key) => Number.isSafeInteger((value as Record<string, unknown>)[key]))
}

function isRenderableBrowserState(value: string): value is RenderableBrowserState {
  return isBrowserState(value) && value !== 'golden' && value !== 'read_unavailable'
}

function isBrowserState(value: string): value is PaidOperationBrowserState {
  return (PAID_OPERATION_BROWSER_STATES as readonly string[]).includes(value)
}
