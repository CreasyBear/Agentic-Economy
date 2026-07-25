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

const valueFlags: Record<string, keyof CliOptions> = {
  '--base-url': 'baseUrl',
  '--location': 'location',
  '--mode': 'mode',
  '--suburb': 'suburb',
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = []
  const options: CliOptions = {
    baseUrl: process.env.AE_CLI_BASE_URL?.trim() || DEFAULT_BASE_URL,
    json: false,
    help: false,
    allowWrite: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? ''
    if (token === '--json') {
      options.json = true
      continue
    }
    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }
    if (token === '--allow-write') {
      options.allowWrite = true
      continue
    }

    const [flag, inlineValue] = token.startsWith('--') && token.includes('=')
      ? [token.slice(0, token.indexOf('=')), token.slice(token.indexOf('=') + 1)]
      : [token, undefined]

    const key = valueFlags[flag]
    if (key !== undefined) {
      const value = inlineValue ?? argv[index + 1]
      if (inlineValue === undefined) index += 1
      if (value !== undefined) {
        if (key === 'baseUrl') options.baseUrl = value.replace(/\/+$/u, '')
        else if (key === 'location') options.location = value
        else if (key === 'mode') options.mode = value
        else if (key === 'suburb') options.suburb = value
      }
      continue
    }

    positionals.push(token)
  }

  const [command, ...rest] = positionals
  return { ...(command === undefined ? {} : { command }), positionals: rest, options }
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
