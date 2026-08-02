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
    },
    allowPositionals: true,
  })
  const baseUrl = parsed.values['base-url'] === undefined
    ? process.env.AE_CLI_BASE_URL?.trim() || DEFAULT_BASE_URL
    : trimTrailingSlashes(parsed.values['base-url'])
  const options: CliOptions = {
    baseUrl,
    json: parsed.values.json ?? false,
    help: parsed.values.help ?? false,
    allowWrite: parsed.values['allow-write'] ?? false,
    ...(parsed.values.location === undefined ? {} : { location: parsed.values.location }),
    ...(parsed.values.mode === undefined ? {} : { mode: parsed.values.mode }),
    ...(parsed.values.suburb === undefined ? {} : { suburb: parsed.values.suburb }),
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

Flags:
  --base-url <url>   server to call (env: AE_CLI_BASE_URL)
  --json             machine-readable output
  --allow-write      permit a non read-only action
  --help
`)
}
