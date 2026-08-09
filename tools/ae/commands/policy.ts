import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, table } from '../lib/output'
import { defaultKeylessExecutableSource } from '@/modules/capability-execution'
import {
  DEFAULT_POLICY,
  enforcePolicy,
  fidelityReport,
  refinePolicy,
  runPolicySuite,
  applyChanges,
  type Policy,
  type PolicyScenario,
  type PolicyTest,
} from '../lib/policy'

const POLICY_FILE = join(process.cwd(), '.ae-cli', 'policy.json')

function loadPolicy(): Policy {
  if (!existsSync(POLICY_FILE)) return DEFAULT_POLICY
  try {
    return JSON.parse(readFileSync(POLICY_FILE, 'utf8')) as Policy
  } catch {
    return DEFAULT_POLICY
  }
}

function savePolicy(policy: Policy): void {
  mkdirSync(dirname(POLICY_FILE), { recursive: true })
  writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2), 'utf8')
}

/** The canonical executable source, expressed as admission scenarios against the policy. */
async function feedScenarios(): Promise<PolicyScenario[]> {
  const listings = await defaultKeylessExecutableSource.list()
  const scenarios: PolicyScenario[] = []
  for (const listing of listings) {
    const descriptor = await defaultKeylessExecutableSource.read(listing.operationRef)
    if (descriptor === null) continue
    scenarios.push({
      capabilityId: descriptor.capabilityId,
      credentialRef: descriptor.authority.kind === 'keyless' ? 'none' : descriptor.authority.connectionRef,
      adapterId: descriptor.adapterId,
      method: 'GET',
      sourceKind: descriptor.provenance.sourceKind,
      endpointUrl: descriptor.endpointUrl,
      expectedResultBytes: 2048,
    })
  }
  return scenarios
}

async function policySuite(): Promise<PolicyTest[]> {
  const feed = await feedScenarios()
  return [
    ...feed.map((scenario): PolicyTest => ({
      name: `feed.${scenario.capabilityId}.admitted`,
      scenario,
      expected: 'execute',
      failureClass: 'rule',
    })),
    // Adversarial governance cases.
    feed.length > 0
      ? {
          name: 'keyed.op.refuses',
          scenario: { ...feed[0]!, credentialRef: 'env:SOME_KEY', capabilityId: 'test.keyed' },
          expected: 'refuse',
          failureClass: 'rule',
        }
      : null,
    feed.length > 0
      ? {
          name: 'x402.listings.blocked',
          scenario: { ...feed[0]!, sourceKind: 'x402', capabilityId: 'test.x402' },
          expected: 'refuse',
          failureClass: 'rule',
        }
      : null,
    feed.length > 0
      ? {
          name: 'nonhttps.refused',
          scenario: { ...feed[0]!, endpointUrl: feed[0]!.endpointUrl.replace(/^https:/, 'http:'), capabilityId: 'test.http' },
          expected: 'refuse',
          failureClass: 'rule',
        }
      : null,
    feed.length > 0
      ? {
          name: 'oversized.bounded',
          scenario: { ...feed[0]!, expectedResultBytes: 2_000_000, capabilityId: 'test.big' },
          expected: 'refuse',
          failureClass: 'rule',
        }
      : null,
    // An ambiguous rule case: the keyless-only wording must admit a precise read.
    feed.length > 0
      ? {
          name: 'ambiguous.feeds.interpreted',
          scenario: { ...feed[0]!, capabilityId: 'test.ambiguous' },
          expected: 'execute',
          failureClass: 'ambiguous',
        }
      : null,
  ].filter((test): test is PolicyTest => test !== null)
}

/** `ae policy [test|refine|fidelity]` — capability-admission policy governance. */
export async function runPolicyCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const sub = args[0]?.trim()
  if (sub === 'test') return runPolicyTestCommand(args.slice(1), options)
  if (sub === 'refine') return runPolicyRefineCommand(args.slice(1), options)
  if (sub === 'fidelity') return runPolicyFidelityCommand(args.slice(1), options)
  if (sub !== undefined && sub.length > 0) {
    throw new CliFailure('Usage: ae policy [test|refine|fidelity]', { kind: 'INVALID_ARGUMENT', code: 'policy-usage' })
  }
  const policy = loadPolicy()
  if (options.json) {
    printJson(policy)
    return
  }
  heading(`Capability-admission policy v${policy.version} (${POLICY_FILE})`)
  table([
    ['keyless_only', String(policy.keylessOnly)],
    ['allow_keyed_refs', policy.allowKeyedRefs.join(', ') || '(none)'],
    ['allowed_adapters', policy.allowedAdapters.join(', ')],
    ['allowed_methods', policy.allowedMethods.join(', ')],
    ['block_provenance', policy.blockProvenance.join(', ')],
    ['https_only', String(policy.httpsOnly)],
    ['max_result_bytes', String(policy.maxResultBytes)],
  ])
  for (const [rule, note] of Object.entries(policy.ruleNotes)) {
    line(`\n${rule}: ${note}`)
  }
}

/** `ae policy test` — run the suite, report VALID/INVALID/TRANSLATION_AMBIGUOUS per case. */
export async function runPolicyTestCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const policy = loadPolicy()
  const suite = await policySuite()
  const findings = runPolicySuite(policy, suite)
  if (options.json) {
    printJson({ policy: policy.version, findings })
    return
  }
  const passed = findings.filter((f) => f.finding === 'VALID').length
  heading(`Policy tests (${passed}/${findings.length} VALID)`)
  for (const finding of findings) {
    line(`${finding.finding.padEnd(22)} ${finding.name}  (actual=${finding.actual})`)
  }
}

/** `ae policy refine [--apply]` — diagnose failures, propose rule changes, open the human review gate. */
export async function runPolicyRefineCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const policy = loadPolicy()
  const suite = await policySuite()
  const proposal = refinePolicy(policy, suite)
  const apply = options.apply === true

  if (options.json) {
    printJson({ policy: policy.version, proposal, applied: apply ? proposal.replaces.version : undefined })
  } else {
    heading(`Refinement proposal (policy v${policy.version} → v${proposal.replaces.version})`)
    if (proposal.changes.length === 0) {
      line('No changes proposed: the suite already holds.')
      return
    }
    for (const change of proposal.changes) {
      line('')
      table([
        ['kind', change.kind],
        ['rule', change.rule],
        ['before', change.before],
        ['after', change.after],
        ['impact', change.impact.join(', ') || '(none yet)'],
      ])
    }
    line('')
    if (apply) {
      savePolicy(applyChanges(policy, proposal))
      line('Accepted: policy written. You have commit authority; the engine only suggested.')
    } else {
      line('Dry run — nothing changed. Re-run with --apply to commit (review gate).')
    }
  }
}

/** `ae policy fidelity` — coverage/accuracy/per-rule grounding against the live feed catalog. */
export async function runPolicyFidelityCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const policy = loadPolicy()
  const facts = await feedScenarios()
  const report = fidelityReport(policy, facts)
  if (options.json) {
    printJson({ policy: policy.version, ...report })
    return
  }
  heading(`Fidelity report (policy v${policy.version}; ${facts.length} ground-truth facts)`)
  table([
    ['coverage', report.coverage.toFixed(2)],
    ['accuracy', report.accuracy.toFixed(2)],
  ])
  for (const grounding of report.perRuleGrounding) {
    line(`${grounding.rule}: ${grounding.grounding}`)
  }
}