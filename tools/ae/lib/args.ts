import { parseArgs as parseNodeArgs } from 'node:util'
import { trimTrailingSlashes } from '../../../src/modules/common/trim-trailing-slashes'

export type CliOptions = {

  baseUrl: string
  json: boolean
  help: boolean
  allowWrite: boolean
  location?: string
  mode?: string
  suburb?: string
  feeds?: string
  apply?: boolean
  turnIds?: readonly string[]
  manifest?: string
  project?: string
  dataset?: string
  snapshotName?: string
  updateSnapshot?: boolean
}

export type ParsedArgs = {
  command?: string
  positionals: readonly string[]
  options: CliOptions
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed = parseNodeArgs({
    args: argv,
    options: {
      'base-url': { type: 'string' },
      json: { type: 'boolean' },
      'allow-write': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      location: { type: 'string' },
      mode: { type: 'string' },
      suburb: { type: 'string' },
      feeds: { type: 'string' },
      apply: { type: 'boolean' },
      'turn-id': { type: 'string', multiple: true },
      manifest: { type: 'string' },
      project: { type: 'string' },
      dataset: { type: 'string' },
      'snapshot-name': { type: 'string' },
      'update-snapshot': { type: 'boolean' },
    },
    allowPositionals: true,
  })
  const baseUrl = parsed.values['base-url'] === undefined
    ? process.env.AE_CLI_BASE_URL?.trim() || DEFAULT_BASE_URL
    : trimTrailingSlashes(parsed.values['base-url'])
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TypeError()
    }
  } catch {
    throw new TypeError('Invalid --base-url: ' + baseUrl)
  }
  const options: CliOptions = {
    baseUrl,
    json: parsed.values.json ?? false,
    help: parsed.values.help ?? false,
    allowWrite: parsed.values['allow-write'] ?? false,
    apply: parsed.values.apply ?? false,
    ...(parsed.values.location === undefined ? {} : { location: parsed.values.location }),
    ...(parsed.values.mode === undefined ? {} : { mode: parsed.values.mode }),
    ...(parsed.values.suburb === undefined ? {} : { suburb: parsed.values.suburb }),
    ...(parsed.values.feeds === undefined ? {} : { feeds: parsed.values.feeds }),
    ...(parsed.values['turn-id'] === undefined ? {} : { turnIds: parsed.values['turn-id'] }),
    ...(parsed.values.manifest === undefined ? {} : { manifest: parsed.values.manifest }),
    ...(parsed.values.project === undefined ? {} : { project: parsed.values.project }),
    ...(parsed.values.dataset === undefined ? {} : { dataset: parsed.values.dataset }),
    ...(parsed.values['snapshot-name'] === undefined ? {} : { snapshotName: parsed.values['snapshot-name'] }),
    ...(parsed.values['update-snapshot'] === undefined ? {} : { updateSnapshot: parsed.values['update-snapshot'] }),
  }
  const [command, ...positionals] = parsed.positionals
  return { ...(command === undefined ? {} : { command }), positionals, options }
}

export function printUsage(): void {
  process.stdout.write(`AE CLI - exercise AE the way an external agent would.

Usage: npm run ae -- <command> [args] [flags]

HTTP commands (need a running server; default ${DEFAULT_BASE_URL}):
  search <query> [--location X] [--mode near_me|whole_catalogue]
  business <slug>
  discover
  import <websiteUrl>
  enrich "<business name>" [--suburb X]
  ask "<question>"
  request create "<text>" | request get <ref> | request options <ref> | request confirm <ref> <optionRef>
  journey "<query>"                 chained search -> business -> discover friction report

In-process commands (no server needed; run over the real action registry):
  actions                           list every registered action
  action <id> ['<json>']            run one action; writes need --allow-write
  doctor                            names-only local runtime/provider readiness

Market-terminal commands (in-process; live keyless execution, no server needed):
  manifest                          machine-readable self-description (external-agent handshake)
  feeds [--json]                    list the keyless data feeds the agentic economy can serve live
  run <feed-id> [key=value...]      execute a keyless feed live -> verifiable value
  compare [--feeds=a,b] [k=v...]    pull the same inputs across feeds and compare live results
  study "<question>" [k=v...]       research: discover feeds, execute, attribute findings + unknowns
  eval export --turn-id <id> [--turn-id <id> ...] [--manifest path] [--allow-write]
  eval snapshot --dataset <name> --snapshot-name <name> --allow-write
  policy [test|refine|fidelity]     admission-policy governance (test / propose / review gate / fidelity)

Flags:
  --base-url <url>   server to call (env: AE_CLI_BASE_URL)
  --json             machine-readable output
  --allow-write      permit a non read-only action or explicit Braintrust export
  --turn-id <id>     explicit finalized answer turn id (repeatable; max 25)
  --manifest <path>  explicit JSON manifest with bounded turnIds
  --project <name>   Braintrust project (env: AE_BRAINTRUST_PROJECT)
  --dataset <name>   Braintrust dataset (env: AE_BRAINTRUST_DATASET)
  --snapshot-name <name>
  --update-snapshot  allow replacing an existing snapshot name
  --help
`)
}
