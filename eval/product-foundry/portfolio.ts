import type {
  AgentConformance,
  CustomerConformance,
  EvidenceAssertion,
  EvidenceReference,
  MeasuredComparison,
  PrimitiveCoverageTransition,
  ProviderConformance,
  WedgeExecutionPack,
  WedgeReplayTrace,
  WedgeRole,
} from './public'

function simulatedEvidence(evidenceId: string): EvidenceReference {
  return Object.freeze({
    evidenceId,
    kind: 'simulation',
    uri: `simulation://${evidenceId}`,
    collectedAt: '2026-07-17',
    owner: 'Product Foundry simulator',
    verifiedBy: '',
    permittedUseBasis: 'synthetic scenario only',
  })
}

function unprovenAssertion(evidenceId: string): EvidenceAssertion {
  return Object.freeze({
    passed: false,
    evidenceRefs: Object.freeze([simulatedEvidence(evidenceId)]),
  })
}

const NOT_YET_PROVEN: AgentConformance = Object.freeze({
  coldDiscovery: unprovenAssertion('agent-cold-discovery'),
  createAndResume: unprovenAssertion('agent-create-resume'),
  missingFacts: unprovenAssertion('agent-missing-facts'),
  staleRevision: unprovenAssertion('agent-stale-revision'),
  duplicateCall: unprovenAssertion('agent-duplicate-call'),
  changedSupply: unprovenAssertion('agent-changed-supply'),
  uncertainEffect: unprovenAssertion('agent-uncertain-effect'),
  cancellation: unprovenAssertion('agent-cancellation'),
  recovery: unprovenAssertion('agent-recovery'),
  evidenceInspection: unprovenAssertion('agent-evidence-inspection'),
})

const CUSTOMER_NOT_YET_PROVEN: CustomerConformance = Object.freeze({
  decisionPackage: unprovenAssertion('customer-decision-package'),
  contractDeclaredCommitment: unprovenAssertion('customer-commitment'),
  progressOwnership: unprovenAssertion('customer-progress'),
  recoveryPath: unprovenAssertion('customer-recovery'),
  completionEvidenceOrHonestUnknown: unprovenAssertion('customer-completion'),
})

const PROVIDER_NOT_YET_PROVEN: ProviderConformance = Object.freeze({
  acceptsStructuredRequest: unprovenAssertion('provider-structured-request'),
  returnsContractEvidence: unprovenAssertion('provider-contract-evidence'),
  repeatedRekeyingMeasured: unprovenAssertion('provider-rekeying'),
  cancellationOrUncertainOutcomeHandled: unprovenAssertion('provider-recovery'),
})

const SIMULATED_TRACES: readonly WedgeReplayTrace[] = Object.freeze([
  simulatedTrace('expected-success', 'success'),
  simulatedTrace('expected-failure', 'failure'),
  simulatedTrace('expected-cancelled', 'cancelled'),
  simulatedTrace('expected-uncertain', 'uncertain'),
])

function simulatedTrace(traceId: string, kind: WedgeReplayTrace['kind']): WedgeReplayTrace {
  return Object.freeze({
    traceId,
    kind,
    events: Object.freeze(['scenario_declared']),
    runnerVersion: 'not-run',
    inputRef: simulatedEvidence(`${traceId}-input`),
    expectedOutputRef: simulatedEvidence(`${traceId}-expected`),
    actualOutputRef: simulatedEvidence(`${traceId}-actual`),
    assertionsRef: simulatedEvidence(`${traceId}-assertions`),
    result: 'failed',
  })
}

function unmeasuredComparison(evidenceId: string): MeasuredComparison {
  return Object.freeze({
    unit: 'not_measured',
    direction: 'lower_is_better',
    baseline: 0,
    assisted: 0,
    requiredImprovementRatio: 0,
    baselineEvidenceRefs: Object.freeze([simulatedEvidence(`${evidenceId}-baseline`)]),
    assistedEvidenceRefs: Object.freeze([simulatedEvidence(`${evidenceId}-assisted`)]),
  })
}

const UNPROVEN_SCORECARD = Object.freeze({
  preregistrationRef: simulatedEvidence('scorecard-preregistration'),
  customerBurden: unmeasuredComparison('customer-burden'),
  correctness: unmeasuredComparison('correctness'),
  elapsedTime: unmeasuredComparison('elapsed-time'),
  totalCost: unmeasuredComparison('total-cost'),
  privacyAndControl: unmeasuredComparison('privacy-control'),
  providerBurden: unmeasuredComparison('provider-burden'),
  operatorBurden: unmeasuredComparison('operator-burden'),
})

function simulatedPack(input: Readonly<{
  wedgeId: string
  workflowFamily: string
  role: WedgeRole
  objective: string
  completionBoundary: string
  actors: readonly string[]
  transitions: readonly PrimitiveCoverageTransition[]
  negativeControlDecision?: 'direct_provider_path' | 'orchestrate'
}>): WedgeExecutionPack {
  return Object.freeze({
    format: 'ae.wedge-execution-pack:v1',
    wedgeId: input.wedgeId,
    workflowFamily: input.workflowFamily,
    role: input.role,
    evidenceMaturity: 'simulated',
    observations: Object.freeze(Array.from({ length: 5 }, (_, index) => Object.freeze({
      caseId: `${input.wedgeId}-simulated-${index + 1}`,
      evidenceKind: 'simulated' as const,
      objective: input.objective,
      completionBoundary: input.completionBoundary,
      actors: Object.freeze([...input.actors]),
      activeCoordinatorMinutes: 0,
      providerManualTouches: 0,
      operatorManualTouches: 0,
      repeatedFactEntries: 0,
      parallelTrackerUsed: false,
      unresolvedUncertaintyCount: 0,
      evidenceRef: simulatedEvidence(`${input.wedgeId}-observation-${index + 1}`),
    }))),
    canonicalRequests: Object.freeze([Object.freeze({
      requestId: `${input.wedgeId}-request-1`,
      facts: Object.freeze({ scenario: input.objective }),
      expectedUnknowns: Object.freeze(['field_evidence']),
    })]),
    capabilityContractRefs: Object.freeze([`${input.wedgeId}:capability-contract:v1`]),
    offeringRefs: Object.freeze([`${input.wedgeId}:offering:v1`]),
    bindingRefs: Object.freeze([`${input.wedgeId}:binding:v1`]),
    selectionPolicyRefs: Object.freeze([`${input.wedgeId}:selection-policy:v1`]),
    authorityPolicyRefs: Object.freeze([`${input.wedgeId}:authority-policy:v1`]),
    dataUsePolicyRefs: Object.freeze([`${input.wedgeId}:data-use-policy:v1`]),
    externalEffectPolicyRefs: Object.freeze([`${input.wedgeId}:external-effect-policy:v1`]),
    recoveryExpectationRefs: Object.freeze([`${input.wedgeId}:recovery-expectations:v1`]),
    providerProfiles: Object.freeze([Object.freeze({
      providerId: `${input.wedgeId}-simulator`,
      capabilityContractRefs: Object.freeze([`${input.wedgeId}:capability-contract:v1`]),
      bindingRefs: Object.freeze([`${input.wedgeId}:binding:v1`]),
      integrationKind: 'simulator' as const,
    })]),
    expectedDecisionProjectionRefs: Object.freeze([`${input.wedgeId}:decision-projection:v1`]),
    transitions: Object.freeze([...input.transitions]),
    traces: SIMULATED_TRACES,
    scorecard: UNPROVEN_SCORECARD,
    customerConformance: CUSTOMER_NOT_YET_PROVEN,
    agentConformance: NOT_YET_PROVEN,
    providerConformance: PROVIDER_NOT_YET_PROVEN,
    kernelEditsRequired: Object.freeze([]),
    kernelPromotionCandidates: Object.freeze([]),
    bespokeOrchestrationBranches: 0,
    parallelLifecycleCount: 0,
    ...(input.negativeControlDecision === undefined
      ? {}
      : {
          negativeControlDecision: {
            decision: input.negativeControlDecision,
            evidenceRefs: Object.freeze([simulatedEvidence(`${input.wedgeId}-negative-control`)]),
          },
        }),
  })
}

export const PRODUCT_FOUNDRY_PORTFOLIO: readonly WedgeExecutionPack[] = Object.freeze([
  simulatedPack({
    wedgeId: 'low-risk-public-event',
    workflowFamily: 'public-event-coordination',
    role: 'commercial_candidate',
    objective: 'Coordinate a bounded low-risk public event',
    completionBoundary: 'Provider and authority evidence recorded, with organiser acknowledgement or an honest unknown',
    actors: ['organiser', 'venue', 'supplier', 'authority'],
    transitions: [
      {
        transitionId: 'event.discover-and-compare',
        description: 'Find eligible businesses and compare declared conditions',
        classification: 'existing_primitive',
        mechanismRef: 'capability-contract+customer-request-evaluation',
      },
      {
        transitionId: 'event.local-requirements',
        description: 'Apply effective locality and event-class requirements',
        classification: 'wedge_contract',
        mechanismRef: 'event-perth-low-risk:v1',
      },
      {
        transitionId: 'event.authority-submission',
        description: 'Keep submissions and consequential commitments under organiser authority',
        classification: 'existing_primitive',
        mechanismRef: 'route-mandate+governed-action',
      },
    ],
  }),
  simulatedPack({
    wedgeId: 'ordinary-strata-repair',
    workflowFamily: 'strata-repair',
    role: 'transfer_test',
    objective: 'Coordinate an ordinary common-property repair',
    completionBoundary: 'Contractor evidence and resident acknowledgement recorded, or responsibility remains explicit',
    actors: ['resident', 'strata-manager', 'council', 'contractor'],
    transitions: [
      {
        transitionId: 'strata.issue-intake',
        description: 'Preserve issue facts, evidence and revisions',
        classification: 'existing_primitive',
        mechanismRef: 'customer-request',
      },
      {
        transitionId: 'strata.responsibility-policy',
        description: 'Apply scheme-specific responsibility and approval policy',
        classification: 'wedge_contract',
        mechanismRef: 'strata-scheme-policy:v1',
      },
      {
        transitionId: 'strata.access-handoff',
        description: 'Coordinate approved access between resident and contractor',
        classification: 'kernel_candidate',
        mechanismRef: 'hypothesis:accountable-handoff',
      },
    ],
  }),
  simulatedPack({
    wedgeId: 'small-commercial-fitout',
    workflowFamily: 'commercial-fitout',
    role: 'falsification_test',
    objective: 'Coordinate a bounded commercial fit-out before lodgement',
    completionBoundary: 'A professionally reviewed packet is ready for human-authorised lodgement',
    actors: ['tenant', 'owner', 'designer', 'surveyor', 'builder', 'authority'],
    transitions: [
      {
        transitionId: 'fitout.professional-dependencies',
        description: 'Gate downstream work on accountable predecessor evidence',
        classification: 'kernel_candidate',
        mechanismRef: 'hypothesis:dependency-gate',
      },
      {
        transitionId: 'fitout.certification',
        description: 'Preserve professional certification as external human authority',
        classification: 'human_operation',
        mechanismRef: 'registered-building-surveyor',
      },
    ],
  }),
  simulatedPack({
    wedgeId: 'ordinary-direct-booking',
    workflowFamily: 'direct-booking',
    role: 'negative_control',
    objective: 'Book one suitable provider through its supported direct path',
    completionBoundary: 'The provider returns its declared commitment evidence',
    actors: ['customer', 'provider'],
    transitions: [
      {
        transitionId: 'booking.direct-path',
        description: 'Avoid orchestration when one provider can complete the request directly',
        classification: 'provider_adapter',
        mechanismRef: 'provider-supported-next-step',
      },
    ],
    negativeControlDecision: 'direct_provider_path',
  }),
])
