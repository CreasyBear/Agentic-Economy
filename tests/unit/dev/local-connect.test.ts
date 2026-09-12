import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'

import {
  buildConnectArgs,
  isLoopback,
  parseFlags,
  runLocalConnect,
} from '../../../tools/dev/local-connect.ts'

const BASE_URL = 'http://127.0.0.1:3024'

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
}

function recorder() {
  const chunks: string[] = []
  return { chunks, write: (text: string) => { chunks.push(text) } }
}

describe('isLoopback', () => {
  it('accepts http and https loopback hosts', () => {
    expect(isLoopback(BASE_URL)).toBe(true)
    expect(isLoopback('http://localhost:3024')).toBe(true)
    expect(isLoopback('https://127.9.9.9/')).toBe(true)
    expect(isLoopback('http://[::1]:3024')).toBe(true)
  })

  it('rejects remote hosts, other schemes, and unparseable input', () => {
    expect(isLoopback('https://agenticeconomy.example')).toBe(false)
    expect(isLoopback('http://127.0.0.1.evil.example')).toBe(false)
    expect(isLoopback('http://10.0.0.1:3024')).toBe(false)
    expect(isLoopback('ftp://127.0.0.1')).toBe(false)
    expect(isLoopback('not a url')).toBe(false)
    expect(isLoopback(undefined)).toBe(false)
  })
})

describe('parseFlags', () => {
  it('defaults to the local dev server and a buyer (non-provider) run', () => {
    expect(parseFlags([])).toEqual({ baseUrl: 'http://127.0.0.1:3024', provider: false })
  })

  it('reads spaced and inline values', () => {
    expect(parseFlags(['--base-url', 'http://localhost:9'])).toEqual({ baseUrl: 'http://localhost:9', provider: false })
    expect(parseFlags(['--base-url=http://localhost:9']).baseUrl).toBe('http://localhost:9')
  })

  it('rejects unknown options and missing values', () => {
    expect(() => parseFlags(['--wat'])).toThrow(/Unknown option/u)
    expect(() => parseFlags(['--base-url'])).toThrow(/requires a value/u)
  })

  it('sets provider without a business id when none is given', () => {
    expect(parseFlags(['--provider'])).toEqual({ baseUrl: 'http://127.0.0.1:3024', provider: true })
  })

  it('reads an optional business id after --provider without swallowing a following flag', () => {
    expect(parseFlags(['--provider', 'biz-1'])).toMatchObject({ provider: true, businessId: 'biz-1' })
    expect(parseFlags(['--provider=biz-1'])).toMatchObject({ provider: true, businessId: 'biz-1' })
    expect(parseFlags(['--provider', '--base-url', BASE_URL])).toEqual({ baseUrl: BASE_URL, provider: true })
  })
})

describe('buildConnectArgs', () => {
  it('runs the workspace ae CLI in JSON mode against the given base URL', () => {
    expect(buildConnectArgs(BASE_URL)).toEqual([
      'run', '--silent', 'ae', '--', 'connect', '--base-url', BASE_URL, '--json',
    ])
  })

  it('forwards --provider to the child ae connect when requested', () => {
    expect(buildConnectArgs(BASE_URL, true)).toEqual([
      'run', '--silent', 'ae', '--', 'connect', '--provider', '--base-url', BASE_URL, '--json',
    ])
  })
})

describe('runLocalConnect', () => {
  const harness = () => {
    const child = new FakeChild()
    const stdout = recorder()
    const stderr = recorder()
    const spawned: Array<{ baseUrl: string, provider: boolean }> = []
    const run = (argv: readonly string[]) => runLocalConnect({
      argv,
      spawnImpl: (baseUrl: string, provider: boolean) => {
        spawned.push({ baseUrl, provider })
        return child as never
      },
      stdout: stdout.write,
      stderr: stderr.write,
    })
    return { child, stdout, stderr, spawned, run }
  }

  it('refuses a non-loopback base URL without spawning anything', async () => {
    const { spawned, stderr, run } = harness()

    const outcome = await run(['--base-url', 'https://agenticeconomy.example'])

    expect(outcome.exitCode).toBe(2)
    expect(spawned).toEqual([])
    expect(stderr.chunks.join('')).toContain('refusing https://agenticeconomy.example')
  })

  it('exits 2 on an unknown flag without spawning anything', async () => {
    const { spawned, stderr, run } = harness()

    const outcome = await run(['--nope'])

    expect(outcome.exitCode).toBe(2)
    expect(spawned).toEqual([])
    expect(stderr.chunks.join('')).toContain('Unknown option --nope')
  })

  it('streams the child stdout and stderr straight through and reports its exit code', async () => {
    const { child, stdout, stderr, spawned, run } = harness()

    const running = run(['--base-url', BASE_URL])
    child.stderr.emit('data', 'Approve: http://127.0.0.1:3024/oauth/authorize?user_code=WDJB-MJHT\nUser code: WDJB-MJHT\nWaiting for authorization…\n')
    child.stdout.emit('data', `${JSON.stringify({ kind: 'pending' })}\n`)
    child.emit('close', 0, null)
    const outcome = await running

    expect(spawned).toEqual([{ baseUrl: BASE_URL, provider: false }])
    expect(outcome.exitCode).toBe(0)
    expect(stderr.chunks.join('')).toContain('User code: WDJB-MJHT')
    expect(stdout.chunks.join('')).toContain('"kind":"pending"')
    expect(stderr.chunks.join('')).toContain('next: npm run ae -- account status')
  })

  it('forwards --provider to the child spawn', async () => {
    const { child, spawned, run } = harness()

    const running = run(['--base-url', BASE_URL, '--provider'])
    child.emit('close', 0, null)
    await running

    expect(spawned).toEqual([{ baseUrl: BASE_URL, provider: true }])
  })

  it('reports a non-zero child exit code', async () => {
    const { child, run } = harness()

    const running = run([])
    child.emit('close', 1, null)
    const outcome = await running

    expect(outcome.exitCode).toBe(1)
  })

  it('exits 1 when the child cannot be started', async () => {
    const { child, stderr, run } = harness()

    const running = run([])
    child.emit('error', new Error('spawn npm ENOENT'))
    const outcome = await running

    expect(outcome.exitCode).toBe(1)
    expect(stderr.chunks.join('')).toContain('spawn npm ENOENT')
  })

  it('prints a base-url-aware next command when a non-default base URL was used', async () => {
    const { child, stderr, run } = harness()

    const running = run(['--base-url', 'http://127.0.0.1:9999'])
    child.emit('close', 0, null)
    await running

    expect(stderr.chunks.join('')).toContain('next: npm run ae -- account status --base-url http://127.0.0.1:9999')
  })
})
