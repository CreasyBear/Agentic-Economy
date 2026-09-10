import { describe, expect, it } from 'vitest'

import { parseArgs } from '../../../tools/ae/lib/args'
import { runCliInProcess, spawnCliSync } from './cli-errors-harness'

describe('market-terminal CLI error contracts', () => {
  it('exposes one Tool command family and rejects removed legacy namespaces', async () => {
    const help = await runCliInProcess(['help', '--json'])
    expect(help.status).toBe(0)
    expect(help.stderr).toBe('')
    const helpBody = JSON.parse(help.stdout) as {
      commands: Record<string, unknown>
      groups: Array<{ id: string; title: string; commands: string[] }>
      auth: {
        authenticatedCalls: Record<string, string>
        cancelRequirements: string
      }
    }
    const commands = helpBody.commands
    expect(Object.keys(commands)).toEqual([
      'manifest',
      'config',
      'search',
      'list',
      'request',
      'describe',
      'compare',
      'connect',
      'doctor',
      'account',
      'supply',
      'fund',
      'call',
      'history',
      'status',
      'wait',
      'cancel',
      'recover',
      'revoke',
    ])
    expect(Object.keys(helpBody.auth.authenticatedCalls)).toEqual([
      'call',
      'history',
      'request',
      'status',
      'wait',
      'cancel',
      'reconcile',
    ])
    expect(helpBody.auth.authenticatedCalls.cancel).toContain('ae cancel ')
    expect(helpBody.auth.authenticatedCalls.reconcile).toContain(' recover ')
    expect(helpBody.auth.cancelRequirements).toContain('AE_API_KEY')
    expect(helpBody.auth.cancelRequirements).toContain('--idempotency-key')
    expect(helpBody.auth.cancelRequirements).toContain('body.idempotencyKey')
    expect(helpBody.groups).toEqual([
      {
        id: 'discover_compare',
        title: 'Discover and compare',
        commands: ['search', 'list', 'describe', 'compare', 'request'],
      },
      {
        id: 'connect_account',
        title: 'Connect and account',
        commands: ['connect', 'account', 'fund', 'revoke'],
      },
      {
        id: 'call_recover',
        title: 'Call and recover',
        commands: ['call', 'history', 'status', 'wait', 'cancel', 'recover'],
      },
      { id: 'supply', title: 'Supply', commands: ['supply'] },
      { id: 'reference', title: 'Reference', commands: ['manifest', 'config', 'doctor'] },
    ])
    for (const legacy of ['feeds', 'run', 'study', 'reconcile', 'action', 'business', 'demand', 'advanced']) {
      expect(commands).not.toHaveProperty(legacy)
    }

    const textHelp = await runCliInProcess(['help'])
    expect(textHelp.status).toBe(0)
    expect(textHelp.stderr).toBe('')
    const groupHeadings = [
      'DISCOVER AND COMPARE',
      'CONNECT AND ACCOUNT',
      'CALL AND RECOVER',
      'SUPPLY',
      'REFERENCE',
    ]
    for (const heading of groupHeadings) expect(textHelp.stdout).toContain(heading)
    for (let index = 1; index < groupHeadings.length; index += 1) {
      expect(textHelp.stdout.indexOf(groupHeadings[index - 1]!)).toBeLessThan(textHelp.stdout.indexOf(groupHeadings[index]!))
    }
    expect(textHelp.stdout).toContain('START HERE')
    expect(textHelp.stdout).toContain('ae search "<job>"')
    expect(textHelp.stdout).toContain('ae help call')
    expect(textHelp.stdout).toContain('ae help <command>')
    expect(textHelp.stdout).toContain('ae help --json')
    expect(textHelp.stdout).toContain('UNIVERSAL FLAGS')
    expect(textHelp.stdout).toContain('--base-url')
    expect(textHelp.stdout).toContain('--json')
    expect(textHelp.stdout).toContain('--help')
    expect(textHelp.stdout).toContain('--version')
    expect(textHelp.stdout).not.toContain('Authenticated Operation actions:')
    expect(textHelp.stdout).not.toContain('AE_API_KEY')
    expect(textHelp.stdout).not.toContain('--idempotency-key')
    expect(textHelp.stdout).not.toContain('--cursor')
    expect(textHelp.stdout).not.toContain('--filters')
    expect(textHelp.stdout).not.toContain('ae search ["<job>"]')
    expect(textHelp.stdout).not.toContain('127.0.0.1:3024')

    const unknown = await runCliInProcess(['feeds', '--json'])
    expect(unknown.status).toBe(1)
    expect(unknown.stderr).toBe('')
    expect(JSON.parse(unknown.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'unknown-command',
      exitCode: 1,
    })
  }, 30_000)

  it('prints a canonical JSON envelope for parse failures without a stack', async () => {
    const result = await runCliInProcess(['manifest', '--json', '--unknown-option'])

    expect(result.status).toBe(1)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')

    const envelope = JSON.parse(result.stdout)
    expect(envelope).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid-arguments',
      message: expect.stringContaining('--unknown-option'),
      exitCode: 1,
    })
    expect(envelope).not.toHaveProperty('stack')
  }, 15_000)

  it('does not echo unknown-command tokens that may embed secrets', async () => {
    const secretToken = 'api_key=FAKE_SENTINEL_UNKNOWN_KEY_197e'
    const result = await runCliInProcess([secretToken, '--json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(secretToken)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'unknown-command',
      message: 'Unknown command',
      exitCode: 1,
    })
  }, 15_000)

  it('rejects repeated scalar long options instead of silently choosing the last value', async () => {
    for (const args of [
      ['--base-url', 'http://127.0.0.1:3000', '--base-url', 'http://127.0.0.1:3001', '--json'],
      ['--idempotency-key', 'first', '--idempotency-key', 'second', '--json'],
    ]) {
      const result = await runCliInProcess(args)

      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: 'INVALID_ARGUMENT',
        code: 'invalid-arguments',
        message: expect.stringContaining('cannot be repeated'),
        exitCode: 1,
      })
    }
  }, 15_000)

  it('rejects options that the selected command does not consume', async () => {
    const result = await runCliInProcess(['manifest', '--limit', '3', '--json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'option-not-supported',
      message: 'Option --limit is not valid for manifest.',
      exitCode: 1,
    })
  }, 15_000)

  it('accepts --input for supply preview instead of rejecting it as an unsupported option', async () => {
    const result = await runCliInProcess([
      'supply', 'preview', '--input', '{"kind":"openapi","environment":"sandbox"}', '--json',
    ])

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    // Never option-not-supported for --input: it must clear COMMAND_OPTIONS validation
    // and fail only on the source-specific schema (missing definitionUrl for kind openapi),
    // proving 'supply preview' is registered alongside the other supply subcommands.
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'supply-input-invalid',
      message: 'Input does not match supply.source.preview:v1. Missing or invalid field: definitionUrl.',
      exitCode: 1,
    })
  }, 15_000)

  it('does not advertise or accept client-side truncation for provider connections', async () => {
    const help = await runCliInProcess(['help', 'supply', 'connections', '--json'])
    expect(help.status).toBe(0)
    expect(JSON.parse(help.stdout)).toMatchObject({
      usage: 'ae supply connections <businessId> [lifecycle]',
    })

    const result = await runCliInProcess([
      'supply',
      'connections',
      'business:one',
      '--limit',
      '1',
      '--json',
    ])
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'option-not-supported',
      message: 'Option --limit is not valid for supply connections.',
      suggestion: 'Review the flags supported by this exact command and try again.',
      nextCommand: 'ae help supply connections',
    })
  }, 15_000)

  it('parses technical comparison output flags', () => {
    const parsed = parseArgs([
      '--technical',
      'compare',
      'operation:v1:first',
      'operation:v1:second',
    ])

    expect(parsed.options).toMatchObject({
      technical: true,
    })
    expect(parsed.positionals).toEqual(['operation:v1:first', 'operation:v1:second'])
  })

  it('keeps search compact while still accepting the global technical flag', async () => {
    const help = await runCliInProcess(['help', 'search', '--json'])
    expect(help.status).toBe(0)
    expect(help.stderr).toBe('')
    expect(JSON.parse(help.stdout)).toMatchObject({
      command: 'search',
      usage: 'ae search "<job>" [--limit <1-20>] [--cursor <cursor>] [--filters \'<json>\']',
      guidance: [
        expect.any(String),
        expect.any(String),
        expect.stringContaining('compact catalog facts'),
      ],
      flags: {
        '--technical': {
          description: expect.stringContaining('JSON search results'),
        },
      },
    })

    const parsed = parseArgs(['search', 'reference lookup', '--technical', '--json'])
    expect(parsed.options).toMatchObject({ technical: true, json: true })

    const command = await runCliInProcess([
      'search',
      'reference lookup',
      '--technical',
      '--json',
      '--base-url',
      'http://127.0.0.1:1',
    ])
    expect(command.status).toBe(1)
    expect(command.stderr).toBe('')
    expect(JSON.parse(command.stdout)).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'connection_refused',
    })
  }, 15_000)

  it('advertises and admits technical describe output explicitly', async () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const help = await runCliInProcess(['help', 'describe', '--json'])
    expect(help.status).toBe(0)
    expect(help.stderr).toBe('')
    expect(JSON.parse(help.stdout)).toMatchObject({
      command: 'describe',
      usage: 'ae describe <tool-ref> [--technical]',
      guidance: [expect.stringContaining("ae call <tool-ref> --input '<json>'")],
      flags: {
        '--technical': {
          description: expect.stringContaining('describe results'),
        },
      },
    })

    const parsed = parseArgs(['describe', operationRef, '--technical', '--json'])
    expect(parsed.options).toMatchObject({ technical: true, json: true })
    expect(parsed.positionals).toEqual([operationRef])

    const command = await runCliInProcess([
      'describe',
      operationRef,
      '--technical',
      '--json',
      '--base-url',
      'http://127.0.0.1:1',
    ])
    expect(command.status).toBe(1)
    expect(command.stderr).toBe('')
    expect(JSON.parse(command.stdout)).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'connection_refused',
    })
  }, 15_000)

  it('exposes account subcommand help and accepts the advertised technical manifest', async () => {
    const accountHelp = await runCliInProcess(['help', 'account', 'status', '--json'])
    expect(accountHelp.status).toBe(0)
    expect(JSON.parse(accountHelp.stdout)).toMatchObject({
      kind: 'HELP',
      command: 'account status',
      usage: 'ae account status [market|provider]',
      summary: expect.stringContaining('principal'),
    })
    const balanceHelp = await runCliInProcess(['help', 'account', 'balance', '--json'])
    expect(balanceHelp.status).toBe(0)
    expect(JSON.parse(balanceHelp.stdout)).toMatchObject({
      kind: 'HELP',
      command: 'account balance',
      usage: 'ae account balance [currency]',
      summary: expect.stringContaining('credit'),
    })
    const disconnectHelp = await runCliInProcess(['help', 'account', 'disconnect', '--json'])
    expect(disconnectHelp.status).toBe(0)
    expect(JSON.parse(disconnectHelp.stdout)).toMatchObject({
      kind: 'HELP',
      command: 'account disconnect',
      usage: 'ae account disconnect [market|provider]',
      summary: expect.stringMatching(/buyer by default; provider with `provider`/u),
    })
    const supplyHelp = await runCliInProcess(['help', 'supply', 'status', '--json'])
    expect(supplyHelp.status).toBe(0)
    expect(JSON.parse(supplyHelp.stdout)).toMatchObject({
      kind: 'HELP',
      command: 'supply status',
      usage: 'ae supply status <businessRef> <toolRef>',
      auth: {
        scope: 'market_supply:manage',
        deviceFlow: expect.stringContaining('connect --provider'),
      },
    })
    const supplyToolsHelp = await runCliInProcess(['help', 'supply', 'tools', '--json'])
    expect(supplyToolsHelp.status).toBe(0)
    expect(JSON.parse(supplyToolsHelp.stdout)).toMatchObject({
      kind: 'HELP',
      command: 'supply tools',
      usage: 'ae supply tools <businessRef>',
      summary: expect.stringMatching(/inventory/iu),
    })
    const retiredSupply = await runCliInProcess(['supply', 'operations', 'business:one', '--json'])
    expect(retiredSupply.status).toBe(1)
    expect(JSON.parse(retiredSupply.stdout)).toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'supply-usage' })
    const doctorHelp = await runCliInProcess(['help', 'doctor', '--json'])
    expect(doctorHelp.status).toBe(0)
    expect(JSON.parse(doctorHelp.stdout)).toMatchObject({
      kind: 'HELP',
      command: 'doctor',
      usage: 'ae doctor [--provider [businessId]]',
      summary: expect.stringContaining('without changing'),
    })

    const technicalManifest = await runCliInProcess(['manifest', '--technical', '--json'])
    expect(technicalManifest.status).toBe(0)
    expect(JSON.parse(technicalManifest.stdout)).toMatchObject({
      account: {
        action: { id: 'agentAccess.whoami' },
        route: { path: '/api/v1/account' },
      },
    })
  }, 30_000)

  it('emits one machine-readable JSON help envelope and keeps root text help usable', async () => {
    for (const [args, command] of [
      [['--json', '--help'], 'root'],
      [['connect', '--json', '--help'], 'connect'],
    ] as const) {
      const result = await runCliInProcess(args)

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      const envelope = JSON.parse(result.stdout)
      expect(envelope).toMatchObject({
        kind: 'HELP',
        command,
        usage: expect.any(String),
        flags: expect.any(Object),
        auth: {
          credential: 'AE_API_KEY',
          credentialOrigin: 'AE_API_KEY_ORIGIN',
          scope: 'market_tools:call',
        },
      })
      expect(envelope.flags).toHaveProperty('--technical')
      expect(envelope.flags).toHaveProperty('--limit')
      expect(envelope.flags).toHaveProperty('--cursor')
      expect(envelope.flags).toHaveProperty('--filters')
      if (command === 'connect') {
        expect(envelope.usage).toBe('ae connect [--provider] [--environment sandbox|production]')
        expect(envelope.flags).toHaveProperty('--provider')
        expect(envelope.flags).toHaveProperty('--environment')
        expect(envelope.flags).not.toHaveProperty('--mcp')
        expect(envelope.auth.guidance).toEqual(expect.arrayContaining([
          expect.stringContaining('verification URI'),
          expect.stringContaining('user-only file permissions'),
        ]))
        expect(JSON.stringify(envelope)).not.toContain('MCP connection')
        expect(JSON.stringify(envelope)).not.toContain('/oauth/grant')
      } else {
        expect(envelope.commands).toEqual(expect.objectContaining({
          connect: expect.objectContaining({ usage: expect.stringContaining('connect') }),
        }))
      }
    }

    const textHelp = await runCliInProcess(['--help'])
    expect(textHelp.status).toBe(0)
    expect(textHelp.stdout).toContain('AE CLI')
    expect(textHelp.stdout).toContain('Usage:')
    expect(textHelp.stderr).toBe('')
    const connectTextHelp = await runCliInProcess(['connect', '--help'])
    expect(connectTextHelp.status).toBe(0)
    expect(connectTextHelp.stdout).toContain('AE_API_KEY_ORIGIN')
    expect(connectTextHelp.stdout).toContain('market_tools:call')
    expect(connectTextHelp.stdout).toContain('verification URI')
    expect(connectTextHelp.stdout).toContain('ae connect --provider')
    expect(connectTextHelp.stderr).toBe('')
  }, 30_000)

  it('advertises bounded stdin input for call without broadening supplier input', async () => {
    const callHelp = await runCliInProcess(['help', 'call', '--json'])
    expect(callHelp.status).toBe(0)
    expect(callHelp.stderr).toBe('')
    expect(JSON.parse(callHelp.stdout)).toMatchObject({
      command: 'call',
      guidance: expect.arrayContaining([
        expect.stringContaining('--input -'),
        expect.stringContaining('saved Quote and idempotency key are reused'),
      ]),
      commands: {
        resume: {
          usage: 'ae call resume <recovery-ref> [--wait]',
        },
      },
      flags: {
        '--input': {
          description: expect.stringContaining('call alone accepts -'),
        },
      },
    })

    const resumeHelp = await runCliInProcess(['help', 'call', 'resume', '--json'])
    expect(resumeHelp.status).toBe(0)
    expect(resumeHelp.stderr).toBe('')
    expect(JSON.parse(resumeHelp.stdout)).toMatchObject({
      kind: 'HELP',
      command: 'call resume',
      usage: 'ae call resume <recovery-ref> [--wait]',
      guidance: expect.arrayContaining([
        expect.stringContaining('same origin, Account and Agent principal'),
        expect.stringContaining('No --input or new --idempotency-key'),
      ]),
    })

    const supplyHelp = await runCliInProcess(['help', 'supply', 'publish', '--json'])
    expect(supplyHelp.status).toBe(0)
    expect(JSON.parse(supplyHelp.stdout)).toMatchObject({
      usage: "ae supply publish --input '<json>' [--idempotency-key <key>]",
    })

    const callText = await runCliInProcess(['help', 'call'])
    expect(callText.status).toBe(0)
    expect(callText.stdout).toContain("Usage: ae call <tool-ref> --input '<json>' [--wait]")
    expect(callText.stdout).toContain('Authentication:')
    expect(callText.stdout).toContain('AE_API_KEY')
    expect(callText.stdout).toContain('market_tools:call')
    expect(callText.stdout).toContain('--input -')

    const searchText = await runCliInProcess(['help', 'search'])
    expect(searchText.status).toBe(0)
    expect(searchText.stdout).not.toContain('AE_API_KEY')
  }, 30_000)

  it('documents each --input-based supply subcommand\'s required fields, derived from its own validation schema', async () => {
    const previewHelp = await runCliInProcess(['help', 'supply', 'preview', '--json'])
    expect(previewHelp.status).toBe(0)
    const previewBody = JSON.parse(previewHelp.stdout) as { guidance?: string[] }
    expect(previewBody.guidance?.[0]).toBe('Required input fields: kind, environment.')
    expect(previewBody.guidance?.[1]).toMatch(/^Example: --input '\{.*"kind":"openapi".*"environment":"sandbox".*\}'$/)

    const previewText = await runCliInProcess(['help', 'supply', 'preview'])
    expect(previewText.status).toBe(0)
    expect(previewText.stdout).toContain('Required input fields: kind, environment.')

    const publishHelp = await runCliInProcess(['help', 'supply', 'publish', '--json'])
    expect(publishHelp.status).toBe(0)
    const publishBody = JSON.parse(publishHelp.stdout) as { guidance?: string[] }
    expect(publishBody.guidance?.[0]).toBe(
      'Required input fields: businessRef, source (kind, environment), candidateRef, expectedSourceDigest, '
      + 'presentation (name, description, category), consequences (effects, dataUse, evidence), pricing (kind), '
      + 'environment, idempotencyKey, attestation (authorisedToPublish, informationAccurate, publishAfterSuccessfulValidation).',
    )
    expect(JSON.parse(String(publishBody.guidance?.[1]?.slice('Example: --input \''.length, -1)))).toMatchObject({
      businessRef: expect.any(String),
      source: { kind: 'openapi', environment: 'sandbox' },
      attestation: { authorisedToPublish: true, informationAccurate: true, publishAfterSuccessfulValidation: true },
    })
  }, 15_000)

  it('scopes valid command help, keeps text and JSON aligned, and rejects typo paths', async () => {
    for (const [args, command] of [
      [['recover', '--json', '--help'], 'recover'],
      [['describe', '--json', '--help'], 'describe'],
    ] as const) {
      const json = await runCliInProcess(args)
      expect(json.status).toBe(0)
      expect(json.stderr).toBe('')
      const envelope = JSON.parse(json.stdout) as {
        kind: string
        command: string
        usage: string
        summary: string
        guidance?: readonly string[]
        commands?: unknown
      }
      expect(envelope).toMatchObject({
        kind: 'HELP',
        command,
        usage: expect.any(String),
        summary: expect.any(String),
      })
      expect(envelope.commands).toBeUndefined()

      const text = await runCliInProcess(args.filter((arg) => arg !== '--json'))
      expect(text.status).toBe(0)
      expect(text.stderr).toBe('')
      expect(text.stdout).toContain(`Usage: ${envelope.usage}`)
      expect(text.stdout).toContain(envelope.summary)
      if (command === 'recover') {
        expect(envelope.summary).toContain('uncertain')
        expect(envelope.summary).toContain('not a replay')
        expect(envelope.guidance?.join(' ')).toContain('canonical evidence')
        expect(text.stdout).toContain('not a replay')
      }
    }

    for (const [args, code] of [
      [['typo', '--json', '--help'], 'unknown-command'],
      [['help', 'typo', '--json'], 'unknown-command'],
      [['demand', 'typo', '--json', '--help'], 'unknown-command'],
      [['help', 'advanced', 'typo', '--json'], 'unknown-command'],
    ] as const) {
      const result = await runCliInProcess(args)
      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: 'INVALID_ARGUMENT',
        code,
        exitCode: 1,
      })
    }

  }, 30_000)

  it('derives installed-form usage and actionable failures from one command contract', async () => {
    const root = await runCliInProcess(['help', '--json'])
    expect(root.status).toBe(0)
    const help = JSON.parse(root.stdout) as {
      commands: Record<string, { usage: string; commands?: Record<string, { usage: string }> }>
    }
    for (const command of Object.values(help.commands)) {
      expect(command.usage).toMatch(/^ae(?: |$)/u)
      expect(command.usage).not.toContain('npm run')
      for (const child of Object.values(command.commands ?? {})) {
        expect(child.usage).toMatch(/^ae(?: |$)/u)
        expect(child.usage).not.toContain('npm run')
      }
    }

    const jsonFailure = await runCliInProcess(['call', '--json'])
    expect(jsonFailure.status).toBe(1)
    expect(jsonFailure.stderr).toBe('')
    expect(JSON.parse(jsonFailure.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-usage',
      message: "Usage: ae call <tool-ref> --input '<json>' [--wait]",
      suggestion: 'Review the command arguments and try again.',
      nextCommand: 'ae help call',
      exitCode: 1,
    })

    const humanFailure = await runCliInProcess(['call'])
    expect(humanFailure.status).toBe(1)
    expect(humanFailure.stdout).toBe('')
    expect(humanFailure.stderr).toBe([
      "Usage: ae call <tool-ref> --input '<json>' [--wait]",
      'Review the command arguments and try again.',
      'Next: ae help call',
      '',
    ].join('\n'))
  }, 30_000)

  it('does not leak secret-shaped failure material through suggestions or next commands', async () => {
    const sentinel = 'FAKE_SENTINEL_CLI_SECRET_98c1'
    const result = await runCliInProcess([
      'recover',
      'invocation:v1:private',
      `{"evidence":"Bearer ${sentinel}","url":"https://user:${sentinel}@example.test/private"}`,
      '--idempotency-key',
      sentinel,
      '--json',
    ])
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(sentinel)
    expect(result.stdout).not.toContain('example.test/private')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      nextCommand: 'ae help recover',
    })
  }, 30_000)

  it('reports the build revision embedded at build time and ignores runtime AE_SOURCE_REVISION', () => {
    const json = spawnCliSync(['--version', '--json'], {
      env: { ...process.env, AE_SOURCE_REVISION: 'test-revision' },
    })
    expect(json.status).toBe(0)
    expect(json.stderr).toBe('')
    const parsed = JSON.parse(json.stdout) as { kind: string; version: string; buildRevision: string; runtime: string }
    expect(parsed).toMatchObject({
      kind: 'VERSION',
      version: '0.1.0',
      runtime: process.version,
    })
    expect(parsed.buildRevision).toBeTruthy()
    expect(parsed.buildRevision).not.toBe('test-revision')

    const human = spawnCliSync(['--version'])
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toMatch(/^ae 0\.1\.0 \(.+\)\n$/u)
  }, 30_000)
})
