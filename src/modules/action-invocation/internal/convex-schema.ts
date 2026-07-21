import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const actionInvocationOriginValue = v.union(
  v.object({ kind: v.literal('request_owned'), requestRef: v.string(), revision: v.number() }),
  v.object({ kind: v.literal('standalone'), callerRef: v.string(), principalRef: v.string() }),
)

export const invocationActorValue = v.object({ callerRef: v.string(), principalRef: v.string() })
export const invocationFreshnessValue = v.union(
  v.object({ state: v.literal('not_observed') }),
  v.object({ state: v.literal('current'), observedAt: v.string() }),
)
export const invocationControlValue = v.union(
  v.object({ state: v.literal('gathering_information'), missingFields: v.array(v.string()) }),
  v.object({ state: v.literal('awaiting_authority') }),
  v.object({ state: v.literal('authorized'), decidedAt: v.string() }),
  v.object({
    state: v.literal('leased'), attemptRef: v.string(), leaseOwner: v.string(),
    effectGeneration: v.number(), leaseExpiresAt: v.string(),
    release: v.union(v.literal('not_started'), v.literal('not_released'), v.literal('possibly_released')),
  }),
  v.object({ state: v.literal('in_progress') }),
  v.object({ state: v.literal('retryable'), reason: v.literal('pre_release_failure') }),
  v.object({ state: v.literal('reconciliation_required'), attemptRef: v.string() }),
  v.object({ state: v.literal('terminal') }),
  v.object({ state: v.literal('cancelled'), effect: v.literal('not_released') }),
  v.object({ state: v.literal('invalidated'), reason: v.string() }),
)
export const attemptReleaseValue = v.union(
  v.object({ state: v.literal('not_released') }),
  v.object({ state: v.literal('released'), observedAt: v.string() }),
  v.object({ state: v.literal('possibly_released') }),
)
export const durableAttemptOutcomeValue = v.union(
  v.object({ state: v.literal('running') }),
  v.object({
    state: v.literal('returned'),
    businessOutcome: v.string(),
  }),
  v.object({
    state: v.literal('failed'), retry: v.literal('safe_before_release'),
    errorDigest: v.optional(v.string()), message: v.optional(v.string()),
  }),
  v.object({
    state: v.literal('uncertain'), retry: v.literal('reconcile_before_retry'),
    errorDigest: v.optional(v.string()), message: v.optional(v.string()),
    reconciliationRequiredAt: v.string(),
  }),
  v.object({
    state: v.literal('timed_out'), timeoutMs: v.number(),
    retry: v.literal('reconcile_before_retry'), reconciliationRequiredAt: v.string(),
  }),
  v.object({ state: v.literal('reconciled_not_released'), retry: v.literal('safe_after_reconciliation'), observedAt: v.string() }),
  v.object({ state: v.literal('reconciled_released'), externalOutcome: v.literal('unknown'), observedAt: v.string() }),
)
export const attemptTransitionValue = v.object({
  attemptRef: v.string(),
  effectGeneration: v.number(),
  priorDigest: v.string(),
  nextDigest: v.string(),
  priorReleaseState: v.union(
    v.literal('not_released'), v.literal('released'), v.literal('possibly_released'),
  ),
  nextReleaseState: v.union(
    v.literal('not_released'), v.literal('released'), v.literal('possibly_released'),
  ),
  priorOutcomeState: v.union(
    v.literal('running'), v.literal('returned'), v.literal('failed'), v.literal('uncertain'),
    v.literal('timed_out'), v.literal('reconciled_not_released'), v.literal('reconciled_released'),
  ),
  nextOutcomeState: v.union(
    v.literal('running'), v.literal('returned'), v.literal('failed'), v.literal('uncertain'),
    v.literal('timed_out'), v.literal('reconciled_not_released'), v.literal('reconciled_released'),
  ),
})
export const authorityBindingValue = v.object({
  reference: v.string(), invocationRef: v.string(), actor: invocationActorValue, origin: actionInvocationOriginValue,
  invocationVersion: v.number(), actionId: v.string(), contractVersion: v.string(),
  digest: v.string(), targetDigest: v.string(), consequence: v.string(),
  limits: v.record(v.string(), v.number()), expiresAt: v.string(),
})
export const acceptedAuthorityValue = v.union(
  v.object({ kind: v.literal('approve_each'), authorityRef: v.string() }),
  v.object({
    kind: v.literal('standing_mandate_use'),
    mandateRef: v.string(),
    mandateVersion: v.number(),
    mandateGeneration: v.number(),
    authorityUseRef: v.string(),
    grantEvidenceRef: v.string(),
  }),
)
export const durableControlProjectionValue = v.object({
  invocationRef: v.string(), invocationVersion: v.number(),
  environment: v.literal('MOCK/DEVELOPMENT ONLY'), persistence: v.literal('durable_control'),
  origin: actionInvocationOriginValue, owner: invocationActorValue,
  action: v.object({ id: v.string(), contractVersion: v.string() }),
  desired: v.object({ state: v.literal('invoke') }),
  authority: v.optional(v.object({ reference: v.string(), expiresAt: v.string() })),
  freshness: invocationFreshnessValue, control: invocationControlValue,
})

// Marker used by contract tests: neutral control is continuity-only.
export const hostedBusinessTruthForbidden = true as const
export const opaqueHostedCustodyReferenceValue = v.object({
  algorithm: v.literal('sha256'),
  digest: v.string(),
})

export const actionInvocationTables = {
  actionInvocationControls: defineTable({
    invocationRef: v.string(),
    invocationVersion: v.number(),
    control: durableControlProjectionValue,
    sourceRef: v.string(),
    sourceResultRef: v.optional(v.string()),
    sourceResultDigest: v.optional(v.string()),
    terminalBusinessOutcome: v.optional(v.string()),
    terminalResultReferenceable: v.optional(v.boolean()),
    preparedMaterialDigest: v.optional(v.string()),
    preparedTargetDigest: v.optional(v.string()),
    consequence: v.optional(v.string()),
    dataLimitSummary: v.optional(v.record(v.string(), v.number())),
    authorityReference: v.optional(v.string()),
    authorityBinding: v.optional(authorityBindingValue),
    authorityDecisionAt: v.optional(v.string()),
    acceptedAuthority: v.optional(acceptedAuthorityValue),
    currentAttemptRef: v.optional(v.string()),
    currentEffectGeneration: v.optional(v.number()),
    currentLeaseOwner: v.optional(v.string()),
    currentLeaseExpiresAt: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index('by_invocationRef', ['invocationRef'])
    .index('by_control_owner_principalRef_and_invocationRef', ['control.owner.principalRef', 'invocationRef'])
    .index('by_sourceRef_and_invocationRef', ['sourceRef', 'invocationRef']),

  actionInvocationAttempts: defineTable({
    invocationRef: v.string(),
    attemptRef: v.string(),
    attemptNumber: v.number(),
    effectGeneration: v.number(),
    actor: invocationActorValue,
    idempotency: v.object({
      operationKey: v.string(), materialInputDigest: v.string(), effectIdentity: v.string(),
    }),
    lease: v.object({ owner: v.string(), expiresAt: v.string() }),
    release: attemptReleaseValue,
    outcome: durableAttemptOutcomeValue,
    recordedAt: v.string(),
  })
    .index('by_invocationRef_and_attemptNumber', ['invocationRef', 'attemptNumber'])
    .index('by_invocationRef_and_attemptRef', ['invocationRef', 'attemptRef'])
    .index('by_idempotency_effectIdentity_and_attemptRef', ['idempotency.effectIdentity', 'attemptRef']),

  actionInvocationHistory: defineTable({
    invocationRef: v.string(),
    commandId: v.string(),
    commandDigest: v.string(),
    commandResult: v.union(v.literal('applied'), v.literal('duplicate')),
    invocationVersion: v.number(),
    effectGeneration: v.optional(v.number()),
    kind: v.string(),
    current: v.boolean(),
    actorRef: v.optional(v.string()),
    sourceEvidenceRef: v.optional(v.string()),
    observation: v.optional(v.object({
      kind: v.literal('release_observation'),
      release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
      evidenceDigest: v.string(),
    })),
    attemptTransition: v.optional(attemptTransitionValue),
    recordedAt: v.string(),
  })
    .index('by_invocationRef_and_commandId', ['invocationRef', 'commandId'])
    .index('by_invocationRef_and_invocationVersion', ['invocationRef', 'invocationVersion'])
    .index('by_invocationRef_and_effectGeneration', ['invocationRef', 'effectGeneration']),

  hostedPaidOperationHeaders: defineTable({
    ownerPrincipalRef: v.string(),
    ownerCallerRef: v.string(),
    invocationRef: v.string(),
    invocationVersion: v.number(),
    selectedSourceRef: v.string(),
    admissionReservationRef: v.string(),
    paymentAttemptRequired: v.boolean(),
    currentPaymentIdentifier: v.optional(v.string()),
    currentEffectGeneration: v.optional(v.number()),
    updatedAt: v.string(),
  })
    .index('by_ownerPrincipalRef_and_invocationRef', ['ownerPrincipalRef', 'invocationRef'])
    .index('by_invocationRef', ['invocationRef']),

  hostedPaidOperationSources: defineTable({
    invocationRef: v.string(),
    sourceRef: v.string(),
    providerId: v.string(),
    providerName: v.string(),
    operationKey: v.string(),
    operationRevision: v.string(),
    materialInputDigest: v.string(),
    materialInputs: v.object({
      symbol: v.literal('BTC'),
      convert: v.literal('USD'),
    }),
    prepared: v.object({
      materialInputDigest: v.string(),
      target: v.object({
        providerId: v.string(),
        sourceRef: v.string(),
        operationRevision: v.string(),
      }),
      consequence: v.string(),
      dataUse: v.object({
        fields: v.array(v.string()),
        limits: v.record(v.string(), v.number()),
      }),
      preparedAt: v.string(),
      freshUntil: v.string(),
    }),
    presentation: v.object({
      title: v.string(),
      summary: v.string(),
      blocks: v.array(v.union(
        v.object({ kind: v.literal('text'), label: v.string(), value: v.string() }),
        v.object({
          kind: v.literal('measurement'), label: v.string(), value: v.number(), unit: v.string(),
        }),
        v.object({
          kind: v.literal('money'), label: v.string(), amountMinor: v.number(), currency: v.string(),
        }),
        v.object({ kind: v.literal('timestamp'), label: v.string(), value: v.string() }),
        v.object({
          kind: v.literal('source'), label: v.string(), providerId: v.string(),
          providerName: v.string(), operationRevision: v.string(),
        }),
        v.object({ kind: v.literal('reference'), label: v.string(), value: v.string() }),
        v.object({
          kind: v.literal('status'), label: v.string(), value: v.string(),
          tone: v.union(
            v.literal('neutral'), v.literal('positive'), v.literal('caution'), v.literal('critical'),
          ),
        }),
      )),
    }),
    maximumAuthorizedCharge: v.object({ currency: v.string(), amountMinor: v.number() }),
    queryRecipient: v.string(),
    resultDelivery: v.union(
      v.object({ state: v.literal('not_delivered') }),
      v.object({
        state: v.literal('invalid'), code: v.string(), evidenceRefs: v.array(v.string()),
      }),
      v.object({
        state: v.literal('valid'),
        blocks: v.array(v.union(
          v.object({ kind: v.literal('text'), label: v.string(), value: v.string() }),
          v.object({
            kind: v.literal('measurement'), label: v.string(), value: v.number(), unit: v.string(),
          }),
          v.object({
            kind: v.literal('money'), label: v.string(), amountMinor: v.number(), currency: v.string(),
          }),
          v.object({ kind: v.literal('timestamp'), label: v.string(), value: v.string() }),
          v.object({
            kind: v.literal('source'), label: v.string(), providerId: v.string(),
            providerName: v.string(), operationRevision: v.string(),
          }),
          v.object({ kind: v.literal('reference'), label: v.string(), value: v.string() }),
          v.object({
            kind: v.literal('status'), label: v.string(), value: v.string(),
            tone: v.union(
              v.literal('neutral'), v.literal('positive'), v.literal('caution'), v.literal('critical'),
            ),
          }),
        )),
        evidenceRefs: v.array(v.string()),
      }),
    ),
    environment: v.object({
      name: v.string(),
      evidenceClass: v.string(),
      claimCeiling: v.string(),
    }),
    observedResolution: v.union(
      v.object({ state: v.literal('pending') }),
      v.object({
        state: v.literal('returned'),
        execution: v.union(v.literal('runner_returned'), v.literal('pre_release_refused')),
        businessOutcome: v.string(),
        resultReferenceable: v.boolean(),
        result: v.object({ kind: v.string(), ok: v.optional(v.boolean()) }),
      }),
      v.object({ state: v.literal('threw'), execution: v.literal('runner_threw'), message: v.string() }),
      v.object({ state: v.literal('timed_out'), timeoutMs: v.number(), observedAt: v.string() }),
    ),
    normalizedResultRef: v.optional(v.string()),
    normalizedResultDigest: v.optional(v.string()),
  }).index('by_invocationRef_and_sourceRef', ['invocationRef', 'sourceRef']),

  hostedPaidOperationPayments: defineTable({
    invocationRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    paymentIdentifier: v.string(),
    custodyReference: opaqueHostedCustodyReferenceValue,
    state: v.union(
      v.literal('prepared'),
      v.literal('possibly_submitted'),
      v.literal('observed'),
      v.literal('reconciliation_required'),
      v.literal('not_settled'),
      v.literal('settled'),
    ),
    settledCurrency: v.optional(v.string()),
    settledAmountMinor: v.optional(v.number()),
    updatedAt: v.string(),
  })
    .index('by_invocationRef_and_paymentIdentifier', [
      'invocationRef', 'paymentIdentifier',
    ])
    .index('by_invocationRef_and_attemptRef_and_effectGeneration', [
      'invocationRef', 'attemptRef', 'effectGeneration',
    ]),

  hostedPaidOperationEvidenceReferences: defineTable({
    invocationRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    evidenceKind: v.string(),
    evidenceReference: opaqueHostedCustodyReferenceValue,
    recordedAt: v.string(),
  })
    .index('by_invocationRef_and_attemptRef_and_effectGeneration', [
      'invocationRef', 'attemptRef', 'effectGeneration',
    ]),

  hostedPaidOperationCommands: defineTable({
    invocationRef: v.string(),
    commandId: v.string(),
    commandDigest: v.string(),
    invocationVersion: v.number(),
    effectGeneration: v.optional(v.number()),
    principalRef: v.optional(v.string()),
    callerRef: v.optional(v.string()),
    recordedAt: v.string(),
  })
    .index('by_invocationRef_and_commandId', ['invocationRef', 'commandId'])
    .index('by_commandId', ['commandId']),

  hostedPaidOperationMockEffects: defineTable({
    invocationRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    providerId: v.string(),
    operationKey: v.string(),
    operationRevision: v.string(),
    paymentIdentifier: v.string(),
    effect: v.literal('released'),
    payment: v.literal('settled'),
    delivery: v.union(v.literal('returned'), v.literal('response_lost')),
    resultKind: v.string(),
    recordedAt: v.string(),
  }).index('by_invocationRef_and_attemptRef_and_effectGeneration', [
    'invocationRef', 'attemptRef', 'effectGeneration',
  ]),

  hostedPaidOperationAdmissionPolicies: defineTable({
    policyRef: v.string(),
    enabled: v.boolean(),
    principalRef: v.string(),
    totalLimit: v.number(),
    concurrencyLimit: v.number(),
    rateLimit: v.number(),
    policyDigest: v.optional(v.string()),
    sourceRevision: v.optional(v.string()),
    admissionEndsAt: v.optional(v.string()),
    retainThrough: v.optional(v.string()),
    killSwitchOwner: v.optional(v.string()),
    recordedAt: v.optional(v.string()),
  })
    .index('by_policyRef', ['policyRef'])
    .index('by_policyRef_and_principalRef', ['policyRef', 'principalRef']),

  hostedPaidOperationAdmissionCounters: defineTable({
    policyRef: v.string(),
    principalRef: v.string(),
    policyDigest: v.optional(v.string()),
    currentWindowKey: v.string(),
    admittedTotal: v.number(),
    active: v.number(),
    admittedInWindow: v.number(),
    updatedAt: v.string(),
  }).index('by_policyRef_and_principalRef', ['policyRef', 'principalRef']),

  hostedPaidOperationAdmissionReservations: defineTable({
    reservationRef: v.string(),
    policyRef: v.string(),
    principalRef: v.string(),
    policyDigest: v.optional(v.string()),
    state: v.union(v.literal('active'), v.literal('released')),
    updatedAt: v.string(),
  })
    .index('by_reservationRef', ['reservationRef'])
    .index('by_policyRef_and_principalRef_and_reservationRef', [
      'policyRef', 'principalRef', 'reservationRef',
    ]),

  hostedPaidOperationDeploymentReceipts: defineTable({
    receiptRef: v.union(
      v.literal('phase3c-paid-operation-exact-revision-deployment'),
      v.literal('phase3c-paid-operation-exact-revision-deployment:g2'),
      v.literal('phase3c-paid-operation-exact-revision-deployment:g3'),
    ),
    sourceRevision: v.string(),
    sourceTree: v.string(),
    githubRunId: v.string(),
    githubRunAttempt: v.number(),
    githubRepository: v.literal('CreasyBear/Agentic-Economy'),
    githubRef: v.literal('main'),
    githubWorkflow: v.literal('.github/workflows/kernel-release-gate.yml'),
    githubJob: v.literal('Phase 3C exact-revision Convex deployment'),
    githubStep: v.literal('Record Phase 3C Convex deployment receipt'),
    sourceClockTimestamp: v.string(),
    deploymentName: v.string(),
  }).index('by_receiptRef', ['receiptRef']),
} as const
