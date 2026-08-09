import type { CliOptions } from '../lib/args'
import { printJson } from '../lib/output'
import { listFeeds } from '../lib/feeds'
import { listActions, describeActionForAgent } from '@/modules/actions'

const COMMANDS: Record<string, { summary: string; args: string; json: boolean }> = {
  manifest: { summary: 'This machine-readable self-description (agent handshake).', args: '', json: true },
  feeds: { summary: 'List the keyless data feeds the agentic economy can serve live.', args: '', json: true },
  run: { summary: 'Execute a keyless feed live and return a verifiable value.', args: '<feed-id> [key=value ...]', json: true },
  compare: { summary: 'Pull the same inputs across several feeds and compare live results.', args: '[--feeds=a,b] [key=value ...]', json: true },
  study: { summary: 'Run a research study: discover relevant feeds, execute, and attribute claims.', args: '<question>', json: true },
  policy: { summary: 'Show the capability-admission policy.', args: '', json: true },
  'policy test': { summary: 'Run the policy test suite and report pass/fail per case.', args: '', json: true },
  'policy refine': { summary: 'Diagnose failing policy tests, propose rule changes, and open a human review gate.', args: '[--apply]', json: true },
  'policy fidelity': { summary: 'Fidelity report: coverage/accuracy/per-rule grounding of the policy.', args: '', json: true },
}

/**
 * `ae manifest [--json]` — the external-agent handshake. Emits a machine-readable
 * protocol: every command (with its JSON surface), the live feed catalog, the
 * registered-action toolset, and the evidence/authority ceilings. An external
 * agent (Hermes/Claude/Codex/DeepSeek) reads this first to learn how to drive
 * the agentic economy and what a response may honestly assert.
 */
export async function runManifestCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const [feeds, actions] = await Promise.all([listFeeds(), listActions()])
  const toolset = actions.map((action) => describeActionForAgent(action))
  const manifest = {
    $schema: 'https://agentic-economy/market-terminal/manifest:v1',
    protocol: 'agentic-economy.market-terminal.v1',
    about: 'Agentic-economy market terminal: discover + pull live keyless data feeds, compare them, and study market/reference data with attributed evidence.',
    commands: COMMANDS,
    feeds,
    toolset,
    executionNote: 'Feeds execute via `ae run <operation-ref>` using canonical operation references matching `operation:v1:<64-hex>`. Capability IDs are display/search metadata only; readable and bare IDs never execute.',
    evidenceCeilings: {
      feedResult: 'a live keyless result is verified provider data for that call only; not a durable receipt, not a customer-value claim.',
      policy: 'policy is enforced by the fail-closed executor; a passed policy test is a unit contract, not deployment proof.',
      study: 'study claims are attributed to the feeds executed and mark unknowns explicitly; no claim generalizes beyond recorded evidence.',
    },
    policyHint: 'run ae policy for the admission rules; ae policy test / refine for governance.',
  }
  if (options.json) {
    printJson(manifest)
    return
  }
  printJson(manifest)
}
