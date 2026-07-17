export type ActionSupport = 'current' | 'target' | 'missing' | 'human_or_external'
export type ActionActor = 'customer' | 'agent' | 'operator' | 'business' | 'authority'
export type EndpointFamily =
  | 'catalog'
  | 'query'
  | 'quote'
  | 'commit'
  | 'coordinate'
  | 'inspect'
  | 'recover'

export type EconomicAction =
  | 'define_need'
  | 'discover_businesses'
  | 'browse_catalog'
  | 'query_capability'
  | 'check_eligibility'
  | 'check_availability'
  | 'request_quote'
  | 'compare_options'
  | 'select_option'
  | 'authorize_commitment'
  | 'obtain_commitment'
  | 'coordinate_dependencies'
  | 'provide_access'
  | 'inspect_progress'
  | 'collect_completion_evidence'
  | 'reconcile_outcome'
  | 'recover_or_substitute'
  | 'perform_professional_judgment'
  | 'direct_handoff'

export type ActionTask = Readonly<{
  id: string
  action: EconomicAction
  actor: ActionActor
  input: string
  output: string
  boundary: string
  support: ActionSupport
  endpointFamily?: EndpointFamily
}>

export type ActionBundle = Readonly<{
  id: string
  name: string
  simulatedPersona: string
  objective: string
  completionBoundary: string
  orchestrationDecision: 'ae_assisted' | 'direct_provider_path'
  tasks: readonly ActionTask[]
}>

const task = (
  id: string,
  action: EconomicAction,
  actor: ActionActor,
  input: string,
  output: string,
  boundary: string,
  support: ActionSupport,
  endpointFamily?: EndpointFamily,
): ActionTask => ({
  id,
  action,
  actor,
  input,
  output,
  boundary,
  support,
  ...(endpointFamily ? { endpointFamily } : {}),
})

export const ACTION_BUNDLE_CASES: readonly ActionBundle[] = [
  {
    id: 'community-event',
    name: 'Low-risk community event',
    simulatedPersona: 'Volunteer organiser coordinating a 120-person public event',
    objective: 'Secure a suitable venue, catering, equipment, and required local approvals',
    completionBoundary: 'Suppliers are committed, dependencies have owners, and completion evidence or an unknown is recorded',
    orchestrationDecision: 'ae_assisted',
    tasks: [
      task('event.01', 'define_need', 'customer', 'date, location, attendance, budget, constraints', 'revisable event brief', 'Customer owns goals and constraints', 'target', 'query'),
      task('event.02', 'discover_businesses', 'agent', 'event brief', 'candidate venues and suppliers', 'Only published business-supplied facts may be asserted', 'current', 'catalog'),
      task('event.03', 'browse_catalog', 'agent', 'candidate businesses', 'relevant offerings and terms', 'An offering is not availability or acceptance', 'current', 'catalog'),
      task('event.04', 'query_capability', 'business', 'requirements and unknowns', 'fit answers and exceptions', 'Provider owns its capability claims', 'target', 'query'),
      task('event.05', 'check_availability', 'business', 'date, duration, quantities', 'time-bounded availability response', 'Availability can expire and requires provenance', 'missing', 'query'),
      task('event.06', 'request_quote', 'business', 'structured comparable requirements', 'priced proposal with inclusions and expiry', 'A quote is not a commitment', 'missing', 'quote'),
      task('event.07', 'compare_options', 'agent', 'quotes and customer priorities', 'inspectable comparison', 'Customer controls the comparison objective', 'target', 'quote'),
      task('event.08', 'select_option', 'customer', 'comparison and risks', 'selected plan', 'Selection does not authorize external effects', 'target', 'commit'),
      task('event.09', 'authorize_commitment', 'customer', 'selected plan and effect summary', 'bounded mandate', 'Spend and effect authority must be explicit', 'target', 'commit'),
      task('event.10', 'obtain_commitment', 'business', 'mandate and accepted terms', 'provider commitment or refusal', 'AE records the provider response; it does not invent fulfilment', 'missing', 'commit'),
      task('event.11', 'coordinate_dependencies', 'operator', 'supplier commitments and council requirements', 'owners, deadlines, blockers, and handoffs', 'Human ownership remains visible', 'missing', 'coordinate'),
      task('event.12', 'collect_completion_evidence', 'business', 'declared evidence contract', 'provider evidence or explicit unknown', 'Evidence is a claim with provenance, not physical truth', 'target', 'inspect'),
      task('event.13', 'recover_or_substitute', 'operator', 'failure, cancellation, or stale commitment', 'replan, substitute, or return control', 'No retry after uncertain effect without reconciliation', 'target', 'recover'),
    ],
  },
  {
    id: 'strata-repair',
    name: 'Ordinary strata repair',
    simulatedPersona: 'Strata manager handling a common-property water leak',
    objective: 'Diagnose responsibility, appoint an eligible trade, arrange access, and close the repair record',
    completionBoundary: 'Repair evidence, invoices, acknowledgement, and unresolved conditions are reconciled',
    orchestrationDecision: 'ae_assisted',
    tasks: [
      task('strata.01', 'define_need', 'operator', 'resident report, photos, location, urgency', 'repair brief and unknowns', 'Do not present an unverified diagnosis as fact', 'target', 'query'),
      task('strata.02', 'perform_professional_judgment', 'operator', 'bylaws, property plan, and incident facts', 'responsibility decision', 'Legal and property responsibility stays with the accountable person', 'human_or_external'),
      task('strata.03', 'discover_businesses', 'agent', 'trade, geography, urgency, credentials', 'eligible candidate trades', 'Discovery is not admission or readiness', 'current', 'catalog'),
      task('strata.04', 'check_eligibility', 'agent', 'work scope and credential requirements', 'eligibility decision with reasons', 'Policy version and evidence must be inspectable', 'target', 'query'),
      task('strata.05', 'check_availability', 'business', 'access windows and urgency', 'attendance options', 'Provider supplies current availability', 'missing', 'query'),
      task('strata.06', 'request_quote', 'business', 'scope, evidence, and access constraints', 'quote or inspection proposal', 'Unknown scope must remain explicit', 'missing', 'quote'),
      task('strata.07', 'authorize_commitment', 'customer', 'quote and delegated spending limit', 'bounded repair approval', 'Authority may belong to manager, council, or owner', 'target', 'commit'),
      task('strata.08', 'obtain_commitment', 'business', 'approval and access conditions', 'accepted appointment', 'Commitment needs a provider receipt', 'missing', 'commit'),
      task('strata.09', 'provide_access', 'operator', 'resident and contractor availability', 'confirmed access handoff', 'Keys, privacy, and safety remain operational responsibilities', 'human_or_external', 'coordinate'),
      task('strata.10', 'inspect_progress', 'operator', 'appointment and provider updates', 'current state, owner, and next action', 'Silence is not completion', 'missing', 'inspect'),
      task('strata.11', 'collect_completion_evidence', 'business', 'repair evidence requirements', 'photos, report, invoice, or unknown', 'Provider evidence is attributable', 'target', 'inspect'),
      task('strata.12', 'reconcile_outcome', 'operator', 'evidence, resident acknowledgement, invoice', 'closed, disputed, or unresolved record', 'Contradictions stay visible', 'target', 'inspect'),
    ],
  },
  {
    id: 'commercial-fitout',
    name: 'Small commercial fit-out',
    simulatedPersona: 'Tenant representative preparing a small retail tenancy',
    objective: 'Coordinate design, approvals, trades, dependencies, and evidence for opening',
    completionBoundary: 'Required approvals and work evidence support opening, or blockers remain explicitly owned',
    orchestrationDecision: 'ae_assisted',
    tasks: [
      task('fitout.01', 'define_need', 'customer', 'lease, concept, budget, opening date', 'fit-out brief and dependency assumptions', 'Customer goals do not replace professional requirements', 'target', 'query'),
      task('fitout.02', 'perform_professional_judgment', 'authority', 'site, regulations, plans', 'professional and statutory requirements', 'Qualified professionals and authorities retain judgment', 'human_or_external'),
      task('fitout.03', 'discover_businesses', 'agent', 'disciplines, location, credentials, timing', 'candidate professionals and trades', 'Only evidenced attributes support selection', 'current', 'catalog'),
      task('fitout.04', 'query_capability', 'business', 'scope and dependency requirements', 'declared fit, exclusions, and prerequisites', 'Businesses own declarations', 'target', 'query'),
      task('fitout.05', 'request_quote', 'business', 'comparable work packages', 'priced proposals and assumptions', 'Assumptions remain part of the quote', 'missing', 'quote'),
      task('fitout.06', 'compare_options', 'agent', 'quotes, sequencing, risk, budget', 'decision package', 'Comparison does not make professional judgment', 'target', 'quote'),
      task('fitout.07', 'authorize_commitment', 'customer', 'selected work packages', 'bounded mandates by package', 'Authority is scoped per effect and spend', 'target', 'commit'),
      task('fitout.08', 'obtain_commitment', 'business', 'mandate and prerequisites', 'accepted work package and dates', 'Acceptance is provider-sourced', 'missing', 'commit'),
      task('fitout.09', 'coordinate_dependencies', 'operator', 'plans, approvals, lead times, access', 'dependency graph with owners and blockers', 'AE may coordinate records; accountable parties still act', 'missing', 'coordinate'),
      task('fitout.10', 'inspect_progress', 'operator', 'milestones and evidence requests', 'current status and exceptions', 'Progress claims require attributable evidence', 'missing', 'inspect'),
      task('fitout.11', 'recover_or_substitute', 'operator', 'delay, refusal, failed inspection', 'replanned dependency path', 'Consequential changes require renewed authority', 'target', 'recover'),
      task('fitout.12', 'reconcile_outcome', 'authority', 'certificates, defects, acknowledgements', 'open, complete, or unresolved status', 'AE records evidence; authorities determine compliance', 'human_or_external', 'inspect'),
    ],
  },
  {
    id: 'sme-export',
    name: 'Routine SME export consignment',
    simulatedPersona: 'Operations manager exporting a standard commercial shipment',
    objective: 'Select transport and supporting services, prepare requirements, and monitor the consignment',
    completionBoundary: 'Shipment handoffs and documentary evidence are reconciled or an exception is owned',
    orchestrationDecision: 'ae_assisted',
    tasks: [
      task('export.01', 'define_need', 'operator', 'goods, destination, dates, value, handling', 'shipment brief and unknowns', 'Classification and regulated facts require accountable input', 'target', 'query'),
      task('export.02', 'perform_professional_judgment', 'authority', 'goods and destination rules', 'classification and regulatory requirements', 'AE does not replace customs or legal judgment', 'human_or_external'),
      task('export.03', 'discover_businesses', 'agent', 'route and required service capabilities', 'candidate freight and support providers', 'Discovery facts need provenance and freshness', 'current', 'catalog'),
      task('export.04', 'query_capability', 'business', 'goods, route, service requirements', 'fit, exclusions, and prerequisites', 'Provider declarations remain attributable', 'target', 'query'),
      task('export.05', 'request_quote', 'business', 'comparable shipment brief', 'rates, surcharges, validity, and terms', 'Price uncertainty stays explicit', 'missing', 'quote'),
      task('export.06', 'compare_options', 'agent', 'quotes, transit, reliability, risk', 'decision package', 'Customer controls trade-offs', 'target', 'quote'),
      task('export.07', 'authorize_commitment', 'customer', 'selected route and spend', 'bounded shipping authority', 'Data sharing and external effects are separately bounded', 'target', 'commit'),
      task('export.08', 'obtain_commitment', 'business', 'mandate and shipping data', 'booking acceptance or refusal', 'Current AE does not claim to book', 'missing', 'commit'),
      task('export.09', 'coordinate_dependencies', 'operator', 'documents, pickup, broker, carrier', 'handoffs, owners, and deadlines', 'Regulated submissions remain with responsible actors', 'missing', 'coordinate'),
      task('export.10', 'inspect_progress', 'business', 'tracking and milestone requests', 'provider-sourced milestone evidence', 'Tracking gaps remain unknown', 'missing', 'inspect'),
      task('export.11', 'recover_or_substitute', 'operator', 'rollover, rejection, loss, delay', 'recovery plan and renewed approvals', 'Uncertain external effects reconcile before retry', 'target', 'recover'),
    ],
  },
  {
    id: 'direct-booking',
    name: 'Ordinary direct booking',
    simulatedPersona: 'Customer booking a routine haircut with a known salon',
    objective: 'Choose one published appointment and complete directly with the provider',
    completionBoundary: 'Provider confirms the appointment through its own path',
    orchestrationDecision: 'direct_provider_path',
    tasks: [
      task('booking.01', 'define_need', 'customer', 'service, preferred time, location', 'simple booking criteria', 'Customer owns preferences', 'target', 'query'),
      task('booking.02', 'discover_businesses', 'agent', 'criteria', 'small candidate set', 'Published facts only', 'current', 'catalog'),
      task('booking.03', 'browse_catalog', 'agent', 'business listings', 'service and direct-next-step options', 'Catalog does not imply live availability', 'current', 'catalog'),
      task('booking.04', 'check_availability', 'business', 'service and time', 'available slots', 'Provider owns availability', 'missing', 'query'),
      task('booking.05', 'select_option', 'customer', 'available slots and terms', 'chosen slot', 'Customer makes the choice', 'target', 'commit'),
      task('booking.06', 'direct_handoff', 'agent', 'chosen provider and published next step', 'customer enters provider booking path', 'AE should not add orchestration when the provider path suffices', 'current', 'commit'),
    ],
  },
] as const

export type EvaluatedAction = Readonly<{
  action: EconomicAction
  workflowCount: number
  taskCount: number
  supports: readonly ActionSupport[]
  endpointFamilies: readonly EndpointFamily[]
  disposition: 'case_local' | 'candidate_reusable_action'
}>

export type ActionBundleEvaluation = Readonly<{
  cases: number
  tasks: number
  actions: readonly EvaluatedAction[]
  coverage: Readonly<Record<ActionSupport, number>>
  endpointHypotheses: readonly Readonly<{
    family: EndpointFamily
    workflowCount: number
    actions: readonly EconomicAction[]
  }>[]
  kernelPromotions: readonly never[]
}>

export function evaluateActionBundles(
  bundles: readonly ActionBundle[],
): ActionBundleEvaluation {
  const actionIndex = new Map<EconomicAction, {
    workflows: Set<string>
    tasks: number
    supports: Set<ActionSupport>
    endpoints: Set<EndpointFamily>
  }>()
  const endpointIndex = new Map<EndpointFamily, {
    workflows: Set<string>
    actions: Set<EconomicAction>
  }>()
  const coverage: Record<ActionSupport, number> = {
    current: 0,
    target: 0,
    missing: 0,
    human_or_external: 0,
  }

  for (const bundle of bundles) {
    for (const item of bundle.tasks) {
      coverage[item.support] += 1
      const action = actionIndex.get(item.action) ?? {
        workflows: new Set<string>(),
        tasks: 0,
        supports: new Set<ActionSupport>(),
        endpoints: new Set<EndpointFamily>(),
      }
      action.workflows.add(bundle.id)
      action.tasks += 1
      action.supports.add(item.support)
      if (item.endpointFamily) action.endpoints.add(item.endpointFamily)
      actionIndex.set(item.action, action)

      if (item.endpointFamily) {
        const endpoint = endpointIndex.get(item.endpointFamily) ?? {
          workflows: new Set<string>(),
          actions: new Set<EconomicAction>(),
        }
        endpoint.workflows.add(bundle.id)
        endpoint.actions.add(item.action)
        endpointIndex.set(item.endpointFamily, endpoint)
      }
    }
  }

  const actions = [...actionIndex.entries()]
    .map(([action, value]): EvaluatedAction => ({
      action,
      workflowCount: value.workflows.size,
      taskCount: value.tasks,
      supports: [...value.supports].sort(),
      endpointFamilies: [...value.endpoints].sort(),
      disposition: value.workflows.size >= 2
        ? 'candidate_reusable_action'
        : 'case_local',
    }))
    .sort((left, right) =>
      right.workflowCount - left.workflowCount || left.action.localeCompare(right.action),
    )

  const endpointHypotheses = [...endpointIndex.entries()]
    .filter(([, value]) => value.workflows.size >= 2)
    .map(([family, value]) => ({
      family,
      workflowCount: value.workflows.size,
      actions: [...value.actions].sort(),
    }))
    .sort((left, right) => left.family.localeCompare(right.family))

  return {
    cases: bundles.length,
    tasks: bundles.reduce((total, bundle) => total + bundle.tasks.length, 0),
    actions,
    coverage,
    endpointHypotheses,
    kernelPromotions: [],
  }
}
