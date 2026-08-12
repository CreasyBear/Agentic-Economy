/**
 * Capability-admission policy governance — the "automated reasoning" half of the
 * market terminal. Modeled on Amazon Bedrock's Automated Reasoning policy
 * refinement loop:
 *
 *   translate -> validate   (the executor's gates: keyless-only, http-json GET,
 *                           provenance blocklist, HTTPS floor, size bound)
 *
 * Two failure modes:
 *   - rule issue       : translation is right but the gate result is wrong → fix rules
 *   - translation ambiguous : the rule/variable wording lets two interpretations
 *                           pass → clarify the rule description
 *
 * The backend has SUGGESTION authority only: `refinePolicy` returns a proposal.
 * The human has COMMIT authority via `applyChanges` behind a review gate
 * (`--apply`). Nothing is ever mutated by analysis.
 */

export type PolicyFinding =
  | 'VALID'                 // scenario enforced/refused exactly as expected
  | 'INVALID'               // gate produced the wrong verdict for the expectation
  | 'TRANSLATION_AMBIGUOUS' // rule wording admits competing interpretations

export type PolicyRuleId =
  | 'keyless_only'
  | 'allowed_adapters'
  | 'allowed_methods'
  | 'block_provenance'
  | 'https_only'
  | 'max_result_bytes'

export type Policy = {
  version: number
  keylessOnly: boolean
  allowKeyedRefs: readonly string[]
  allowedAdapters: readonly string[]
  allowedMethods: readonly ('GET' | 'POST')[]
  blockProvenance: readonly string[]
  httpsOnly: boolean
  maxResultBytes: number
  /** Wording that drives translation; refined when a test is TRANSLATION_AMBIGUOUS. */
  ruleNotes: Record<PolicyRuleId, string>
}

export const DEFAULT_POLICY: Policy = {
  version: 1,
  keylessOnly: true,
  allowKeyedRefs: [],
  allowedAdapters: ['http-json:v1'],
  allowedMethods: ['GET'],
  blockProvenance: ['x402'],
  httpsOnly: true,
  maxResultBytes: 524_288,
  ruleNotes: {
    keyless_only: 'Only operations with credentialRef "none" are admitted.',
    allowed_adapters: 'Only http-json:v1 adapter operations are admitted.',
    allowed_methods: 'Only GET operations are admitted.',
    block_provenance: 'Observed x402 listings are never executed.',
    https_only: 'Endpoints must be HTTPS (SSRF floor).',
    max_result_bytes: 'Response bodies are bounded.',
  },
}

export type PolicyScenario = {
  capabilityId: string
  credentialRef: string
  adapterId: string
  method: 'GET' | 'POST'
  sourceKind: string
  endpointUrl: string
  expectedResultBytes: number
}

export type EnforceOutcome = {
  verdict: 'execute' | 'refuse'
  reason: PolicyRuleId | 'none'
}

/** The deterministic gate. This is the translate+validate backend. */
export function enforcePolicy(policy: Policy, scenario: PolicyScenario): EnforceOutcome {
  if (policy.keylessOnly && scenario.credentialRef !== 'none') {
    return { verdict: 'refuse', reason: 'keyless_only' }
  }
  if (!policy.keylessOnly && scenario.credentialRef !== 'none' && policy.allowKeyedRefs.length > 0 && !policy.allowKeyedRefs.includes(scenario.credentialRef)) {
    return { verdict: 'refuse', reason: 'keyless_only' }
  }
  if (!policy.allowedAdapters.includes(scenario.adapterId)) {
    return { verdict: 'refuse', reason: 'allowed_adapters' }
  }
  if (!policy.allowedMethods.includes(scenario.method)) {
    return { verdict: 'refuse', reason: 'allowed_methods' }
  }
  if (policy.blockProvenance.includes(scenario.sourceKind)) {
    return { verdict: 'refuse', reason: 'block_provenance' }
  }
  if (policy.httpsOnly && !scenario.endpointUrl.startsWith('https://')) {
    return { verdict: 'refuse', reason: 'https_only' }
  }
  if (scenario.expectedResultBytes > policy.maxResultBytes) {
    return { verdict: 'refuse', reason: 'max_result_bytes' }
  }
  return { verdict: 'execute', reason: 'none' }
}

export type PolicyTest = {
  name: string
  scenario: PolicyScenario
  /** The governing intent; mismatch between this and the policy is the signal. */
  expected: 'execute' | 'refuse'
  /** Declared failure class so a human (or the doc) states which mode applies. */
  failureClass: 'rule' | 'ambiguous'
}

export type TestFinding = {
  name: string
  finding: PolicyFinding
  actual: 'execute' | 'refuse'
  reason: PolicyRuleId | 'none'
}

export function runPolicyTest(policy: Policy, test: PolicyTest): TestFinding {
  const outcome = enforcePolicy(policy, test.scenario)
  const matches = outcome.verdict === test.expected
  const finding: PolicyFinding = matches
    ? 'VALID'
    : test.failureClass === 'ambiguous'
      ? 'TRANSLATION_AMBIGUOUS'
      : 'INVALID'
  return { name: test.name, finding, actual: outcome.verdict, reason: outcome.reason }
}

export function runPolicySuite(policy: Policy, tests: readonly PolicyTest[]): TestFinding[] {
  return tests.map((test) => runPolicyTest(policy, test))
}

export type PolicyChangeKind = 'edit_rule' | 'clarify_rule'
export type ProposeChange = {
  kind: PolicyChangeKind
  rule: PolicyRuleId
  before: string
  after: string
  impact: readonly string[] // tests whose finding flips from failing to VALID
}

export type RefineProposal = {
  replaces: Policy
  changes: readonly ProposeChange[]
  failing: readonly TestFinding[]
}

/**
 * Diagnose failing tests and propose rule fixes (rule issue) or wording
 * clarifications (ambiguous). The proposal is not applied; `applyChanges` is the
 * only mutator and must be called behind the human review gate.
 */
export function applyChanges(_policy: Policy, proposal: RefineProposal): Policy {
  // The review gate: only this function materializes a proposal into a policy.
  return proposal.replaces
}

/**
 * Diagnose failing tests and propose rule fixes (rule issue) or wording
 * clarifications (ambiguous). The proposal is not applied; `applyChanges` is the
 * only mutator and must be called behind the human review gate.
 */
export function refinePolicy(policy: Policy, tests: readonly PolicyTest[]): RefineProposal {
  const findings = runPolicySuite(policy, tests)
  const failing = findings.filter((finding) => finding.finding !== 'VALID')
  const changes: ProposeChange[] = []
  let next: Policy = { ...policy, ruleNotes: { ...policy.ruleNotes }, version: policy.version + 1 }

  for (const test of tests) {
    const finding = findings.find((f) => f.name === test.name)
    if (finding === undefined || finding.finding === 'VALID') continue
    const outcome = enforcePolicy(policy, test.scenario)
    const rule = outcome.reason === 'none' ? fallbackRule(test) : outcome.reason

    if (finding.finding === 'INVALID') {
      const before = (policy.ruleNotes[rule] ?? rule)
      const after = refineRuleText(rule, before, test.expected)
      next = candidateFix(next, rule, test)
      const recalc = findSuiteFor(next, tests)
      const impact = tests
        .filter((candidate) => findSuiteFor(policy, [candidate])[0]?.finding !== 'VALID' && recalc[candidate.name]?.finding === 'VALID')
        .map((candidate) => candidate.name)
      changes.push({ kind: 'edit_rule', rule, before, after, impact })
    } else if (finding.finding === 'TRANSLATION_AMBIGUOUS') {
      const rule = outcome.reason === 'none' ? 'keyless_only' : outcome.reason
      const before = policy.ruleNotes[rule] ?? rule
      const after = `${before} Interpret "expected=${test.expected} for ${test.scenario.capabilityId}" precisely; this rule's wording admits conflicting reads.`
      next = { ...next, ruleNotes: { ...next.ruleNotes, [rule]: after } }
      changes.push({ kind: 'clarify_rule', rule, before, after, impact: [test.name] })
    }
  }

  return { replaces: next, changes, failing }
}

function findSuiteFor(policy: Policy, tests: readonly PolicyTest[]): Record<string, TestFinding> {
  const out: Record<string, TestFinding> = {}
  for (const test of tests) out[test.name] = runPolicyTest(policy, test)
  return out
}

function fallbackRule(test: PolicyTest): PolicyRuleId {
  // Nothing tripped, but the intent expected a refusal; infer which rule the
  // scenario called into question from the scenario itself.
  const s = test.scenario
  if (s.credentialRef !== 'none') return 'keyless_only'
  if (s.sourceKind === 'x402') return 'block_provenance'
  if (!s.endpointUrl.startsWith('https://')) return 'https_only'
  if (s.method !== 'GET') return 'allowed_methods'
  return 'max_result_bytes'
}

/** One deterministic mutation that makes `next` enforce `test.expected`. */
function candidateFix(policy: Policy, rule: PolicyRuleId, test: PolicyTest): Policy {
  const base: Policy = { ...policy, ruleNotes: { ...policy.ruleNotes } }
  switch (rule) {
    case 'keyless_only':
      return test.expected === 'refuse'
        ? { ...base, keylessOnly: true, allowKeyedRefs: [] }
        : { ...base, keylessOnly: false, allowKeyedRefs: [test.scenario.credentialRef] }
    case 'https_only':
      return test.expected === 'refuse'
        ? { ...base, httpsOnly: true }
        : { ...base, httpsOnly: false }
    case 'allowed_methods': {
      const method = test.scenario.method
      return test.expected === 'refuse'
        ? { ...base, allowedMethods: base.allowedMethods.filter((m) => m !== method) as Policy['allowedMethods'] }
        : base.allowedMethods.includes(method)
          ? base
          : { ...base, allowedMethods: [...base.allowedMethods, method] }
    }
    case 'allowed_adapters':
      return test.expected === 'refuse'
        ? { ...base, allowedAdapters: base.allowedAdapters.filter((a) => a !== test.scenario.adapterId) }
        : base.allowedAdapters.includes(test.scenario.adapterId)
          ? base
          : { ...base, allowedAdapters: [...base.allowedAdapters, test.scenario.adapterId] }
    case 'block_provenance':
      return test.expected === 'refuse'
        ? (base.blockProvenance.includes(test.scenario.sourceKind) ? base : { ...base, blockProvenance: [...base.blockProvenance, test.scenario.sourceKind] })
        : { ...base, blockProvenance: base.blockProvenance.filter((p) => p !== test.scenario.sourceKind) }
    case 'max_result_bytes':
      return test.expected === 'refuse'
        ? { ...base, maxResultBytes: Math.max(0, test.scenario.expectedResultBytes - 1) }
        : { ...base, maxResultBytes: Math.max(base.maxResultBytes, test.scenario.expectedResultBytes) }
  }
}

function refineRuleText(rule: PolicyRuleId, before: string, expected: 'execute' | 'refuse'): string {
  return `${before} (refined: this rule must now ${expected === 'execute' ? 'admit' : 'refuse'} the case exactly as the test expects)`
}

export type FidelityReport = {
  coverage: number
  accuracy: number
  perRuleGrounding: readonly { rule: PolicyRuleId; grounding: string }[]
}

/** Compare the policy against ground-truth Operation facts and score fidelity. */
export function fidelityReport(policy: Policy, facts: readonly PolicyScenario[]): FidelityReport {
  const rules: PolicyRuleId[] = ['keyless_only', 'allowed_adapters', 'allowed_methods', 'block_provenance', 'https_only', 'max_result_bytes']
  const perRuleGrounding = rules.map((rule) => ({ rule, grounding: policy.ruleNotes[rule] }))
  // coverage: what fraction of ground-truth facts the policy actually admits (i.e. rule encodes it)
  const admitted = facts.filter((fact) => enforcePolicy(policy, fact).verdict === 'execute')
  const coverage = facts.length === 0 ? 0 : admitted.length / facts.length
  // accuracy: of the admitted facts, how many are genuinely keyless-http-GET (intent match)
  const intended = admitted.filter((fact) => fact.credentialRef === 'none' && fact.adapterId === 'http-json:v1' && fact.method === 'GET')
  const accuracy = admitted.length === 0 ? 0 : intended.length / admitted.length
  return { coverage, accuracy, perRuleGrounding }
}