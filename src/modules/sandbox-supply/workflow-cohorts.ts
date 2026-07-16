export type SandboxWorkflowStep = Readonly<{
  providerKey: string
  businessName: string
  capabilityName: string
  inputField: string
  outputField: string
  inputSemanticIdentity?: string
  outputSemanticIdentity?: string
  completionEvidence: boolean
  amountMinor: number
  recovery: 'retry_safe' | 'reconcile_required'
}>

export type SandboxWorkflowCohort = Readonly<{
  cohortId: string
  label: string
  customerRequest: string
  completionBoundary: string
  prohibitedClaim: string
  steps: readonly SandboxWorkflowStep[]
  curveballs: readonly string[]
}>

export const SANDBOX_WORKFLOW_COHORTS: readonly SandboxWorkflowCohort[] = Object.freeze([
  Object.freeze({
    cohortId: 'procurement',
    label: 'Procurement',
    customerRequest: 'Source comparable workplace catering options for 80 people next Thursday, keep the total under AUD 4,000, and recommend the best supported choice.',
    completionBoundary: 'A comparable recommendation with supplier evidence; no order or payment.',
    prohibitedClaim: 'Do not claim that a supplier was selected, contracted, ordered, or paid.',
    steps: Object.freeze([
      step('procurement-brief', 'Procurement Brief Studio', 'Structure procurement requirements', 'request', 'requirementsBrief', undefined, 'ae.requirements-brief:v1', false, 250, 'retry_safe'),
      step('supplier-options', 'Supplier Options Network', 'Find eligible supplier options', 'requirementsBrief', 'supplierOptionSet', 'ae.requirements-brief:v1', 'ae.supplier-option-set:v1', false, 600, 'retry_safe'),
      step('procurement-recommendation', 'Procurement Comparison Desk', 'Compare supplier options', 'supplierOptionSet', 'recommendation', 'ae.supplier-option-set:v1', undefined, true, 450, 'reconcile_required'),
    ]),
    curveballs: Object.freeze(['one supplier withdraws', 'budget is reduced after comparison', 'required evidence is missing']),
  }),
  Object.freeze({
    cohortId: 'itinerary',
    label: 'Itinerary planning',
    customerRequest: 'Build a four-day Perth itinerary for two adults with one accessible activity each day, keep estimated activity costs under AUD 1,200, and give me a readiness checklist for anything that still needs confirmation.',
    completionBoundary: 'A coherent itinerary and readiness checklist; no reservation or ticketing.',
    prohibitedClaim: 'Do not claim availability, booking, ticketing, or payment.',
    steps: Object.freeze([
      step('trip-constraints', 'Trip Constraint Interpreter', 'Structure trip constraints', 'request', 'tripBrief', undefined, 'ae.trip-brief:v1', false, 200, 'retry_safe'),
      step('itinerary-builder', 'Itinerary Assembly Service', 'Build an itinerary', 'tripBrief', 'itineraryDraft', 'ae.trip-brief:v1', 'ae.itinerary-draft:v1', false, 500, 'retry_safe'),
      step('itinerary-readiness', 'Travel Readiness Review', 'Review itinerary readiness', 'itineraryDraft', 'readinessChecklist', 'ae.itinerary-draft:v1', undefined, true, 300, 'reconcile_required'),
    ]),
    curveballs: Object.freeze(['weather invalidates one day', 'mobility requirement changes', 'an activity has unknown availability']),
  }),
  Object.freeze({
    cohortId: 'journey-management',
    label: 'Service journey management',
    customerRequest: 'Coordinate the steps for moving a small office, show what is blocked, and keep a resumable record of who owes the next update.',
    completionBoundary: 'A current milestone plan and status synthesis; no hidden operator coordination.',
    prohibitedClaim: 'Do not claim that a physical move, dispatch, or third-party task occurred.',
    steps: Object.freeze([
      step('journey-case', 'Journey Case Intake', 'Structure a service case', 'request', 'serviceCase', undefined, 'ae.service-case:v1', false, 150, 'retry_safe'),
      step('milestone-plan', 'Milestone Planning Service', 'Build a milestone plan', 'serviceCase', 'milestonePlan', 'ae.service-case:v1', 'ae.milestone-plan:v1', false, 350, 'retry_safe'),
      step('progress-synthesis', 'Progress Synthesis Service', 'Synthesize journey progress', 'milestonePlan', 'progressSummary', 'ae.milestone-plan:v1', undefined, true, 250, 'reconcile_required'),
    ]),
    curveballs: Object.freeze(['a milestone is overdue', 'ownership changes mid-journey', 'the customer resumes after interruption']),
  }),
  Object.freeze({
    cohortId: 'recurring-operations',
    label: 'Recurring operations',
    customerRequest: 'Prepare next week’s multi-site maintenance run, group the work efficiently, and give me a reconciliation checklist for completed and unresolved tasks.',
    completionBoundary: 'A bounded task batch and reconciliation result; no fabricated field completion.',
    prohibitedClaim: 'Do not claim a task was performed without provider evidence.',
    steps: Object.freeze([
      step('operations-schedule', 'Operations Schedule Service', 'Structure an operating schedule', 'request', 'operatingSchedule', undefined, 'ae.operating-schedule:v1', false, 180, 'retry_safe'),
      step('task-batch', 'Task Batch Coordinator', 'Prepare a task batch', 'operatingSchedule', 'taskBatch', 'ae.operating-schedule:v1', 'ae.task-batch:v1', false, 420, 'retry_safe'),
      step('task-reconciliation', 'Task Reconciliation Service', 'Reconcile task outcomes', 'taskBatch', 'reconciliation', 'ae.task-batch:v1', undefined, true, 280, 'reconcile_required'),
    ]),
    curveballs: Object.freeze(['one site is inaccessible', 'a duplicate run is requested', 'some task outcomes remain unknown']),
  }),
  Object.freeze({
    cohortId: 'exception-coordination',
    label: 'Exception coordination',
    customerRequest: 'Assess a delayed event setup, compare safe recovery options, and produce a coordinated recovery plan with explicit unknowns.',
    completionBoundary: 'A recovery plan with evidence and unresolved unknowns; no claim that recovery actions occurred.',
    prohibitedClaim: 'Do not claim dispatch, replacement, refund, or fulfilment.',
    steps: Object.freeze([
      step('incident-assessment', 'Incident Assessment Service', 'Assess an exception', 'request', 'incidentAssessment', undefined, 'ae.incident-assessment:v1', false, 220, 'retry_safe'),
      step('recovery-options', 'Recovery Options Exchange', 'Prepare recovery options', 'incidentAssessment', 'recoveryOptionSet', 'ae.incident-assessment:v1', 'ae.recovery-option-set:v1', false, 480, 'retry_safe'),
      step('recovery-plan', 'Recovery Coordination Service', 'Build a recovery plan', 'recoveryOptionSet', 'recoveryPlan', 'ae.recovery-option-set:v1', undefined, true, 320, 'reconcile_required'),
    ]),
    curveballs: Object.freeze(['a provider denies the request', 'one result is partial', 'the final outcome remains unknown']),
  }),
])

export const SANDBOX_WORKFLOW_PROVIDER_PROFILES = Object.freeze(Object.fromEntries(
  SANDBOX_WORKFLOW_COHORTS.flatMap((cohort) => cohort.steps.map((workflowStep, position) => [
    workflowStep.providerKey,
    Object.freeze({
      ...workflowStep,
      cohortId: cohort.cohortId,
      cohortLabel: cohort.label,
      position: position + 1,
      slug: `sandbox-${workflowStep.providerKey}`,
      priorOfferingId: `offering:sandbox-${workflowStep.providerKey}:v1`,
      priorBindingId: `binding:sandbox-${workflowStep.providerKey}:http-json:v1`,
      offeringId: `offering:sandbox-${workflowStep.providerKey}:v2`,
      bindingId: `binding:sandbox-${workflowStep.providerKey}:http-json:v2`,
      endpointPath: `/api/sandbox/providers/workflow?provider=${workflowStep.providerKey}`,
    }),
  ])),
))

export type SandboxWorkflowProviderKey = keyof typeof SANDBOX_WORKFLOW_PROVIDER_PROFILES

export function sandboxWorkflowCapabilityContractDocument(providerKey: SandboxWorkflowProviderKey) {
  const profile = SANDBOX_WORKFLOW_PROVIDER_PROFILES[providerKey]
  if (profile === undefined) throw new Error(`sandbox_workflow_provider_unknown:${providerKey}`)
  const inputPointer = `/${profile.inputField}`
  const outputPointer = `/${profile.outputField}`
  return Object.freeze({
    contractFormat: 'ae.capability-contract:v2' as const,
    capabilityId: `sandbox.workflow.${providerKey}`,
    version: 1,
    name: profile.capabilityName,
    description: `Return labelled sandbox evidence for the ${profile.cohortLabel.toLowerCase()} workflow.`,
    inputSchema: workflowSchema(profile.inputField),
    outputSchema: workflowSchema(profile.outputField),
    customerAnnotations: Object.freeze([
      Object.freeze({
        annotationId: `${profile.inputField}_input`,
        document: 'input' as const,
        pointer: inputPointer,
        label: profile.position === 1 ? 'What outcome do you need?' : profile.inputField,
        role: profile.position === 1 ? 'request' as const : 'constraint' as const,
        inference: profile.position === 1 ? 'allowed' as const : 'customer_required' as const,
        ...(profile.inputSemanticIdentity === undefined
          ? {}
          : { semanticIdentity: profile.inputSemanticIdentity }),
      }),
      Object.freeze({
        annotationId: `${profile.outputField}_output`,
        document: 'output' as const,
        pointer: outputPointer,
        label: profile.outputField,
        role: 'completion_evidence' as const,
        ...(profile.outputSemanticIdentity === undefined
          ? {}
          : { semanticIdentity: profile.outputSemanticIdentity }),
      }),
    ]),
    dataUse: Object.freeze([Object.freeze({
      effectId: `${profile.inputField}_release`,
      inputPointer,
      classification: 'public' as const,
      phase: 'preparation' as const,
      recipient: Object.freeze({ kind: 'candidate_binding' as const }),
      purposes: Object.freeze([`prepare_${profile.cohortId}_${profile.outputField}`]),
    })]),
    effects: Object.freeze([Object.freeze({
      effectId: `${profile.inputField}_release`,
      class: 'data_release' as const,
      authority: 'explicit' as const,
      reversibility: 'irreversible' as const,
    })]),
    evidence: Object.freeze([Object.freeze({
      evidenceId: profile.outputField,
      outputPointer,
      purpose: 'completion' as const,
    })]),
    lifecycle: Object.freeze({
      idempotency: 'required' as const,
      recovery: profile.recovery,
    }),
  })
}

function workflowSchema(field: string) {
  return Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: Object.freeze({
      [field]: Object.freeze({ type: 'string', minLength: 1 }),
    }),
    required: Object.freeze([field]),
    additionalProperties: false,
  })
}

function step(
  providerKey: string,
  businessName: string,
  capabilityName: string,
  inputField: string,
  outputField: string,
  inputSemanticIdentity: string | undefined,
  outputSemanticIdentity: string | undefined,
  completionEvidence: boolean,
  amountMinor: number,
  recovery: SandboxWorkflowStep['recovery'],
): SandboxWorkflowStep {
  return Object.freeze({
    providerKey, businessName, capabilityName, inputField, outputField,
    ...(inputSemanticIdentity === undefined ? {} : { inputSemanticIdentity }),
    ...(outputSemanticIdentity === undefined ? {} : { outputSemanticIdentity }),
    completionEvidence, amountMinor, recovery,
  })
}
