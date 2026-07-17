import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { PRODUCT_FOUNDRY_PORTFOLIO } from '../../eval/product-foundry/portfolio'
import {
  evaluateFoundryPortfolio,
  evaluatePrimitivePromotion,
  evaluateWedgeExecutionPack,
  type EvidenceAssertion,
  type EvidenceReference,
  type MeasuredComparison,
  type PrimitivePromotionCandidate,
  type WedgeExecutionPack,
  type WedgeRole,
} from '../../eval/product-foundry/public'

function evidence(
  evidenceId: string,
  kind: EvidenceReference['kind'],
): EvidenceReference {
  const collectedAt = kind === 'baseline_measurement'
    ? '2026-07-10T00:00:00Z'
    : kind === 'preregistration'
      ? '2026-07-12T00:00:00Z'
      : kind === 'assisted_measurement'
        ? '2026-07-15T00:00:00Z'
        : '2026-07-17T00:00:00Z'
  return {
    evidenceId,
    kind,
    uri: `controlled-evidence://${evidenceId}`,
    collectedAt,
    owner: 'Product',
    verifiedBy: 'Independent reviewer',
    permittedUseBasis: 'consented redacted evaluation',
  }
}

function assertion(
  evidenceId: string,
  passed = true,
  kind: EvidenceReference['kind'] = 'conformance_report',
): EvidenceAssertion {
  return {
    passed,
    evidenceRefs: [evidence(evidenceId, kind)],
  }
}

function comparison(
  evidenceId: string,
  baseline: number,
  assisted: number,
  requiredImprovementRatio = 0,
  direction: MeasuredComparison['direction'] = 'lower_is_better',
): MeasuredComparison {
  return {
    unit: 'count',
    direction,
    baseline,
    assisted,
    requiredImprovementRatio,
    baselineEvidenceRefs: [evidence(`${evidenceId}-baseline`, 'baseline_measurement')],
    assistedEvidenceRefs: [evidence(`${evidenceId}-assisted`, 'assisted_measurement')],
  }
}

function provenPack(
  wedgeId: string,
  workflowFamily: string,
  role: WedgeRole,
): WedgeExecutionPack {
  const conformance = {
    decisionPackage: assertion(`${wedgeId}-decision-package`),
    contractDeclaredCommitment: assertion(`${wedgeId}-commitment`),
    progressOwnership: assertion(`${wedgeId}-progress`),
    recoveryPath: assertion(`${wedgeId}-recovery`),
    completionEvidenceOrHonestUnknown: assertion(`${wedgeId}-completion`),
  }
  const agentConformance = {
    coldDiscovery: assertion(`${wedgeId}-cold-discovery`),
    createAndResume: assertion(`${wedgeId}-create-resume`),
    missingFacts: assertion(`${wedgeId}-missing-facts`),
    staleRevision: assertion(`${wedgeId}-stale-revision`),
    duplicateCall: assertion(`${wedgeId}-duplicate-call`),
    changedSupply: assertion(`${wedgeId}-changed-supply`),
    uncertainEffect: assertion(`${wedgeId}-uncertain-effect`),
    cancellation: assertion(`${wedgeId}-cancellation`),
    recovery: assertion(`${wedgeId}-agent-recovery`),
    evidenceInspection: assertion(`${wedgeId}-evidence-inspection`),
  }
  const providerConformance = {
    acceptsStructuredRequest: assertion(`${wedgeId}-structured-request`),
    returnsContractEvidence: assertion(`${wedgeId}-contract-evidence`),
    repeatedRekeyingMeasured: assertion(`${wedgeId}-rekeying`),
    cancellationOrUncertainOutcomeHandled: assertion(`${wedgeId}-provider-recovery`),
  }
  const trace = (kind: 'success' | 'failure' | 'cancelled' | 'uncertain') => ({
    traceId: `${wedgeId}-${kind}`,
    kind,
    events: ['request_created', `terminal_${kind}`],
    runnerVersion: 'product-foundry-test:v1',
    inputRef: evidence(`${wedgeId}-${kind}-input`, 'replay_input'),
    expectedOutputRef: evidence(`${wedgeId}-${kind}-expected`, 'replay_expected'),
    actualOutputRef: evidence(`${wedgeId}-${kind}-actual`, 'replay_actual'),
    assertionsRef: evidence(`${wedgeId}-${kind}-assertions`, 'replay_assertions'),
    result: 'passed' as const,
  })

  return {
    format: 'ae.wedge-execution-pack:v1',
    wedgeId,
    workflowFamily,
    role,
    evidenceMaturity: 'field',
    observations: Array.from({ length: 5 }, (_, index) => ({
      caseId: `${wedgeId}-${index + 1}`,
      evidenceKind: 'field_observed' as const,
      objective: `Complete ${workflowFamily}`,
      completionBoundary: 'Contract evidence or honest unknown recorded',
      actors: ['customer', 'provider', 'authority'],
      activeCoordinatorMinutes: 90,
      providerManualTouches: 4,
      operatorManualTouches: 1,
      repeatedFactEntries: 2,
      parallelTrackerUsed: false,
      unresolvedUncertaintyCount: 0,
      evidenceRef: evidence(`${wedgeId}-observation-${index + 1}`, 'field_observation'),
    })),
    canonicalRequests: [{
      requestId: `${wedgeId}-request`,
      facts: { workflowFamily },
      expectedUnknowns: ['provider_acceptance'],
    }],
    capabilityContractRefs: [`${wedgeId}:contract:v1`],
    offeringRefs: [`${wedgeId}:offering:v1`],
    bindingRefs: [`${wedgeId}:binding:v1`],
    selectionPolicyRefs: [`${wedgeId}:selection:v1`],
    authorityPolicyRefs: [`${wedgeId}:authority:v1`],
    dataUsePolicyRefs: [`${wedgeId}:data-use:v1`],
    externalEffectPolicyRefs: [`${wedgeId}:external-effect:v1`],
    recoveryExpectationRefs: [`${wedgeId}:recovery-expectations:v1`],
    providerProfiles: [{
      providerId: `${wedgeId}-provider`,
      capabilityContractRefs: [`${wedgeId}:contract:v1`],
      bindingRefs: [`${wedgeId}:binding:v1`],
      integrationKind: 'external',
    }],
    expectedDecisionProjectionRefs: [`${wedgeId}:decision:v1`],
    transitions: [{
      transitionId: `${wedgeId}.request-to-outcome`,
      description: 'Exercise the declared bounded workflow',
      classification: 'wedge_contract',
      mechanismRef: `${wedgeId}:contract:v1`,
    }],
    traces: [trace('success'), trace('failure'), trace('cancelled'), trace('uncertain')],
    scorecard: {
      preregistrationRef: evidence(`${wedgeId}-preregistration`, 'preregistration'),
      customerBurden: comparison(`${wedgeId}-customer-burden`, 100, 60, 0.3),
      correctness: comparison(`${wedgeId}-correctness`, 0.9, 0.9, 0, 'higher_is_better'),
      elapsedTime: comparison(`${wedgeId}-elapsed`, 10, 10),
      totalCost: comparison(`${wedgeId}-cost`, 100, 100),
      privacyAndControl: comparison(`${wedgeId}-privacy`, 0, 0),
      providerBurden: comparison(`${wedgeId}-provider-burden`, 10, 7, 0.2),
      operatorBurden: comparison(`${wedgeId}-operator-burden`, 10, 5),
    },
    customerConformance: conformance,
    agentConformance,
    providerConformance,
    kernelEditsRequired: [],
    kernelPromotionCandidates: [],
    bespokeOrchestrationBranches: 0,
    parallelLifecycleCount: 0,
  }
}

function promotionCandidate(
  families: readonly string[],
  passed: boolean,
): PrimitivePromotionCandidate {
  return {
    candidateId: 'accountable-deadline',
    neutralName: 'accountable_deadline',
    observedWorkflows: families.map((workflowFamily) => ({
      workflowFamily,
      evidenceRefs: [evidence(`workflow-${workflowFamily}`, 'field_observation')],
    })),
    stableInterfaceAcrossFamilies: assertion('stable-interface', passed),
    compositionFailureDemonstrated: assertion('composition-failure', passed),
    platformInvariantProtected: assertion('platform-invariant', passed),
    negativeControlUnaffected: assertion('negative-control', passed),
    humanAgentParity: assertion('human-agent-parity', passed),
    replayRegressionPassed: assertion('replay-regression', passed),
    backwardsCompatibilityPassed: assertion('backwards-compatibility', passed, 'compatibility_report'),
    threatReviewPassed: assertion('threat-review', passed, 'threat_review'),
    adrAccepted: assertion('accepted-adr', passed, 'adr'),
  }
}

describe('AE Product Foundry and Primitive Refinery', () => {
  it('keeps the simulated starting portfolio out of evidence and replay gates', () => {
    const event = PRODUCT_FOUNDRY_PORTFOLIO[0]
    expect(event).toBeDefined()
    const result = evaluateWedgeExecutionPack(event!)

    expect(result.structurallyReplayable).toBe(false)
    expect(result.fieldEvidenceReady).toBe(false)
    expect(result.productProofReady).toBe(false)
    expect(result.gaps).toContain('field_observations_required')
    expect(result.gaps).toContain('replay_assertions_required')
  })

  it('promotes from wedge to module only after two evidenced workflow families', () => {
    expect(evaluatePrimitivePromotion(
      promotionCandidate(['public-event-coordination'], false),
    ).disposition).toBe('wedge_local')

    expect(evaluatePrimitivePromotion(
      promotionCandidate(['public-event-coordination', 'strata-repair'], true),
    ).disposition).toBe('reusable_module')
  })

  it('admits a kernel primitive only after three families and every evidenced gate', () => {
    expect(evaluatePrimitivePromotion(promotionCandidate([
      'public-event-coordination',
      'strata-repair',
      'commercial-fitout',
    ], true))).toEqual({
      disposition: 'kernel_primitive',
      eligibleForKernel: true,
      unmetGates: [],
    })
  })

  it('requires commercial, transfer, falsification, negative-control, and cost evidence to invest', () => {
    const commercial = provenPack('event', 'public-event-coordination', 'commercial_candidate')
    const transfer = provenPack('strata', 'strata-repair', 'transfer_test')
    const falsification = provenPack('fitout', 'commercial-fitout', 'falsification_test')
    const negative = {
      ...provenPack('booking', 'direct-booking', 'negative_control'),
      negativeControlDecision: {
        decision: 'direct_provider_path' as const,
        evidenceRefs: [evidence('booking-control-decision', 'conformance_report')],
      },
    }

    expect(evaluateFoundryPortfolio({
      packs: [commercial, transfer, falsification, negative],
      marginalWedgeCost: comparison('marginal-wedge-cost', 100, 60, 0.2),
      repeatedKernelGapObserved: assertion('no-repeated-kernel-gap', false),
      humanOperationsEconomicallyViable: assertion('human-operations', false),
    })).toMatchObject({
      decision: 'invest',
      productProof: true,
      platformProof: true,
    })
  })

  it('keeps the decision pending when the third-wedge falsification is absent', () => {
    const commercial = provenPack('event', 'public-event-coordination', 'commercial_candidate')
    const transfer = provenPack('strata', 'strata-repair', 'transfer_test')

    expect(evaluateFoundryPortfolio({
      packs: [commercial, transfer],
      marginalWedgeCost: comparison('marginal-wedge-cost', 100, 60, 0.2),
      repeatedKernelGapObserved: assertion('no-repeated-kernel-gap', false),
      humanOperationsEconomicallyViable: assertion('human-operations', false),
    })).toMatchObject({
      decision: 'evidence_pending',
      productProof: true,
      platformProof: false,
    })
  })

  it('reports evidence pending before fieldwork instead of issuing a false stop', () => {
    expect(evaluateFoundryPortfolio({
      packs: PRODUCT_FOUNDRY_PORTFOLIO,
      marginalWedgeCost: comparison('unproven-cost', 0, 0),
      repeatedKernelGapObserved: assertion('no-repeated-kernel-gap', false),
      humanOperationsEconomicallyViable: assertion('human-operations', false),
    })).toMatchObject({
      decision: 'evidence_pending',
      productProof: false,
      platformProof: false,
    })
  })

  it('rejects duplicated case evidence and post-hoc preregistration', () => {
    const pack = provenPack('event', 'public-event-coordination', 'commercial_candidate')
    const duplicated = {
      ...pack,
      observations: pack.observations.map((observation) => ({
        ...observation,
        caseId: 'same-case',
        evidenceRef: pack.observations[0]!.evidenceRef,
      })),
    }
    expect(evaluateWedgeExecutionPack(duplicated)).toMatchObject({
      fieldEvidenceReady: false,
      productProofReady: false,
    })

    const postHoc = {
      ...pack,
      scorecard: {
        ...pack.scorecard,
        preregistrationRef: {
          ...pack.scorecard.preregistrationRef,
          collectedAt: '2026-07-16T00:00:00Z',
        },
      },
    }
    expect(evaluateWedgeExecutionPack(postHoc)).toMatchObject({
      productProofReady: false,
      gaps: expect.arrayContaining(['preregistered_customer_threshold_required']),
    })

    const incompleteStructure = { ...pack, offeringRefs: [] }
    expect(evaluateWedgeExecutionPack(incompleteStructure)).toMatchObject({
      evaluationComplete: false,
      productProofReady: false,
    })
    expect(evaluateFoundryPortfolio({
      packs: [incompleteStructure],
      marginalWedgeCost: comparison('incomplete-structure-cost', 100, 100),
      repeatedKernelGapObserved: assertion('incomplete-repeated-gap', false),
      humanOperationsEconomicallyViable: assertion('incomplete-human-ops', false),
    }).decision).toBe('evidence_pending')
  })

  it('requires typed replay artifacts rather than generic evidence references', () => {
    const pack = provenPack('event', 'public-event-coordination', 'commercial_candidate')
    const invalidReplay = {
      ...pack,
      traces: pack.traces.map((trace) => ({
        ...trace,
        actualOutputRef: evidence(`${trace.traceId}-wrong-kind`, 'field_observation'),
      })),
    }

    expect(evaluateWedgeExecutionPack(invalidReplay)).toMatchObject({
      structurallyReplayable: false,
      productProofReady: false,
      gaps: expect.arrayContaining(['replay_assertions_required']),
    })
  })

  it('keeps the durable program evidence-bounded and issues dormant', () => {
    const program = readFileSync(
      new URL('../../.planning/research/2026-07-17-product-foundry-primitive-refinery-program.md', import.meta.url),
      'utf8',
    )
    expect(program).toContain('**Maturity:** Target research')
    expect(program).toContain('packs are labelled simulated. They are not replay, customer, provider,')
    expect(program).toContain('Issues #181–#187 remain dormant.')
  })
})
