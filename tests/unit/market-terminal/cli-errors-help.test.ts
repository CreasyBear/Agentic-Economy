import { describe, expect, it } from 'vitest'

import { parseArgs } from '../../../tools/ae/lib/args'
import { spawnCliSync } from './cli-errors-harness'

describe('market-terminal CLI error contracts', () => {
  it('exposes one operation command family and rejects removed legacy namespaces', () => {
    const help = spawnCliSync(['help', '--json'])
    expect(help.status).toBe(0)
    expect(help.stderr).toBe('')
    const helpBody = JSON.parse(help.stdout) as {
      commands: Record<string, unknown>
      auth: {
        authenticatedOperations: Record<string, string>
        cancelRequirements: string
      }
    }
    const commands = helpBody.commands
    expect(Object.keys(commands)).toEqual([
      'manifest',
      'search',
      'inspect',
      'compare',
      'inspect-plan',
      'connect',
      'fund',
      'call',
      'status',
      'cancel',
      'recover',
      'revoke',
    ])
    expect(Object.keys(helpBody.auth.authenticatedOperations)).toEqual([
      'call',
      'status',
      'cancel',
      'reconcile',
    ])
    expect(helpBody.auth.authenticatedOperations.cancel).toContain('ae cancel ')
    expect(helpBody.auth.authenticatedOperations.reconcile).toContain(' recover ')
    expect(helpBody.auth.cancelRequirements).toContain('AE_API_KEY')
    expect(helpBody.auth.cancelRequirements).toContain('--idempotency-key')
    expect(helpBody.auth.cancelRequirements).toContain('body.idempotencyKey')
    for (const legacy of ['feeds', 'run', 'study', 'reconcile', 'action', 'doctor', 'business', 'demand', 'advanced']) {
      expect(commands).not.toHaveProperty(legacy)
    }

    const textHelp = spawnCliSync(['help'])
    expect(textHelp.status).toBe(0)
    expect(textHelp.stderr).toBe('')
    expect(textHelp.stdout).toContain('Authenticated Operation actions:')
    expect(textHelp.stdout).toContain('call:')
    expect(textHelp.stdout).toContain('status:')
    expect(textHelp.stdout).toContain('cancel:')
    expect(textHelp.stdout).toContain('reconcile:')
    expect(textHelp.stdout).toContain('AE_API_KEY')
    expect(textHelp.stdout).toContain('--idempotency-key')

    const unknown = spawnCliSync(['feeds', '--json'])
    expect(unknown.status).toBe(1)
    expect(unknown.stderr).toBe('')
    expect(JSON.parse(unknown.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'unknown-command',
      exitCode: 1,
    })
  }, 30_000)

  it('prints a canonical JSON envelope for parse failures without a stack', () => {
    const result = spawnCliSync(['manifest', '--json', '--unknown-option'])

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

  it('does not echo unknown-command tokens that may embed secrets', () => {
    const secretToken = 'api_key=FAKE_SENTINEL_UNKNOWN_KEY_197e'
    const result = spawnCliSync([secretToken, '--json'])

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

  it('rejects repeated scalar long options instead of silently choosing the last value', () => {
    for (const args of [
      ['--base-url', 'http://127.0.0.1:3000', '--base-url', 'http://127.0.0.1:3001', '--json'],
      ['--idempotency-key', 'first', '--idempotency-key', 'second', '--json'],
    ]) {
      const result = spawnCliSync(args)

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

  it('rejects options that the selected command does not consume', () => {
    const result = spawnCliSync(['manifest', '--limit', '3', '--json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'option-not-supported',
      message: 'Option --limit is not valid for manifest.',
      exitCode: 1,
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

  it('emits one machine-readable JSON help envelope and keeps root text help usable', () => {
    for (const [args, command] of [
      [['--json', '--help'], 'root'],
      [['connect', '--json', '--help'], 'connect'],
    ] as const) {
      const result = spawnCliSync(args)

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
          scope: 'market_operations:invoke',
        },
      })
      expect(envelope.flags).toHaveProperty('--technical')
      expect(envelope.flags).toHaveProperty('--limit')
      expect(envelope.flags).toHaveProperty('--cursor')
      expect(envelope.flags).toHaveProperty('--filters')
      if (command === 'connect') {
        expect(envelope.auth.guidance).toEqual(expect.arrayContaining([
          expect.stringContaining('verification URI'),
          expect.stringContaining('user-only file permissions'),
        ]))
        expect(JSON.stringify(envelope)).not.toContain('/oauth/grant')
      } else {
        expect(envelope.commands).toEqual(expect.objectContaining({
          connect: expect.objectContaining({ usage: expect.stringContaining('connect') }),
        }))
      }
    }

    const textHelp = spawnCliSync(['--help'])
    expect(textHelp.status).toBe(0)
    expect(textHelp.stdout).toContain('AE CLI')
    expect(textHelp.stdout).toContain('Usage:')
    expect(textHelp.stderr).toBe('')
    const connectTextHelp = spawnCliSync(['connect', '--help'])
    expect(connectTextHelp.status).toBe(0)
    expect(connectTextHelp.stdout).toContain('AE_API_KEY_ORIGIN')
    expect(connectTextHelp.stdout).toContain('market_operations:invoke')
    expect(connectTextHelp.stdout).toContain('verification URI')
    expect(connectTextHelp.stderr).toBe('')
  }, 30_000)

  it('scopes valid command help, keeps text and JSON aligned, and rejects typo paths', () => {
    for (const [args, command] of [
      [['recover', '--json', '--help'], 'recover'],
      [['inspect-plan', '--json', '--help'], 'inspect-plan'],
    ] as const) {
      const json = spawnCliSync(args)
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

      const text = spawnCliSync(args.filter((arg) => arg !== '--json'))
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
      if (command === 'inspect-plan') expect(envelope.usage).toContain('inspect-plan')
    }

    for (const [args, code] of [
      [['typo', '--json', '--help'], 'unknown-command'],
      [['help', 'typo', '--json'], 'unknown-command'],
      [['demand', 'typo', '--json', '--help'], 'unknown-command'],
      [['help', 'advanced', 'typo', '--json'], 'unknown-command'],
    ] as const) {
      const result = spawnCliSync(args)
      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: 'INVALID_ARGUMENT',
        code,
        exitCode: 1,
      })
    }

  }, 30_000)
})
