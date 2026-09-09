import { describe, expect, it } from 'vitest'

import {
  buildConvexDevArgs,
  buildConvexSelectArgs,
  buildStages,
  childExitStatus,
  convexChildEnv,
  convexPrintedUrl,
  createSupervisor,
  doctorNextCommand,
  effectiveEnv,
  isCatalogueComplete,
  isConvexReadyOutput,
  isViteReadyOutput,
  parseLauncherFlags,
  probeConvexUrl,
  releaseRevision,
  resolveConvexUrl,
  runStages,
  shouldSpawnConvex,
  signalProcessTree,
  terminateProcessTrees,
  viteLocalUrl,
} from '../../../tools/dev/local-dev.mjs'

type StageOutcome = {
  ok: boolean
  stdout?: string
  stderr?: string
  skipped?: boolean
  reason?: string
  fix?: string
}
type Stage = {
  id: string
  skip?: boolean
  skipReason?: string
  run: () => Promise<StageOutcome | undefined>
}
type StageRun = (reference: string, args?: string) => Promise<StageOutcome>

function recorder() {
  const lines: string[] = []
  return { lines, log: (message: string) => { lines.push(message) } }
}

const completeStatus = JSON.stringify({
  kind: 'ready',
  coverage: { source: 'coinbase', generation: 'gen_1', completeness: 'completed_observed_scan' },
  refreshState: 'complete',
})

describe('local development launcher', () => {
  it('uses the official non-interactive local upgrade path without a reset option', () => {
    expect(buildConvexSelectArgs()).toEqual(['convex', 'deployment', 'select', 'local'])
    expect(buildConvexDevArgs()).toEqual([
      'convex',
      'dev',
      '--typecheck',
      'disable',
      '--local-force-upgrade',
    ])
    expect(buildConvexDevArgs()).not.toContain('reset')
  })

  it('does not treat Vite output as ready before Convex is ready', () => {
    expect(isConvexReadyOutput('Preparing Convex functions...')).toBe(false)
    expect(isConvexReadyOutput('✔ Convex functions ready!')).toBe(true)
    expect(isViteReadyOutput('Convex functions ready!')).toBe(false)
    expect(isViteReadyOutput('➜ Local: http://127.0.0.1:3024/')).toBe(true)
  })

  it('reports timeout and parent-signal statuses without masking child failures', () => {
    expect(childExitStatus({ code: null, signal: 'SIGINT', reason: 'timeout' })).toBe(124)
    expect(childExitStatus({ code: null, signal: 'SIGINT', requestedSignal: 'SIGINT' })).toBe(130)
    expect(childExitStatus({ code: 17, signal: null })).toBe(17)
  })

  it('signals both detached process groups and falls back to a direct child', () => {
    const groupSignals: Array<[number, string]> = []
    const convex = { pid: 101, kill: () => undefined }
    const vite = { pid: 202, kill: () => undefined }
    const kill = (pid: number, signal: string) => groupSignals.push([pid, signal])

    expect(terminateProcessTrees([convex, vite], 'SIGINT', kill)).toEqual([true, true])
    expect(groupSignals).toEqual([[-101, 'SIGINT'], [-202, 'SIGINT']])

    let directSignal: string | undefined
    const fallbackChild = {
      pid: 303,
      kill: (signal: string) => { directSignal = signal },
    }
    const refusingKill = () => { throw new Error('process group unavailable') }
    expect(signalProcessTree(fallbackChild, 'SIGTERM', refusingKill)).toBe(true)
    expect(directSignal).toBe('SIGTERM')
  })
  it('reaps only supervisor-owned children after restart and parent signal', async () => {
    let resolveOwned!: () => void
    const ownedDone = new Promise<void>((resolve) => { resolveOwned = resolve })
    const ownedCalls: unknown[][] = []
    const owned = {
      done: ownedDone,
      terminate: (...args: readonly unknown[]) => {
        ownedCalls.push([...args])
        resolveOwned()
      },
    }
    let staleTerminated = false
    const stale = {
      done: new Promise<void>(() => {}),
      terminate: () => { staleTerminated = true },
    }
    const supervisor = createSupervisor()
    supervisor.add(owned)
    const waitingForRestart = supervisor.waitForChildren()
    supervisor.terminateAll('SIGINT', 'peer-failure')
    await waitingForRestart
    expect(ownedCalls).toEqual([['SIGINT', 'peer-failure', 'SIGINT']])
    expect(staleTerminated).toBe(false)
    void stale

    let resolveSignalled!: () => void
    const signalledDone = new Promise<void>((resolve) => { resolveSignalled = resolve })
    const signalledCalls: unknown[][] = []
    supervisor.add({
      done: signalledDone,
      terminate: (...args: readonly unknown[]) => {
        signalledCalls.push([...args])
        resolveSignalled()
      },
    })
    supervisor.signal('SIGTERM')
    await supervisor.waitForChildren()
    expect(signalledCalls).toEqual([['SIGINT', 'signal', 'SIGTERM']])
  })
})

describe('convex child env', () => {
  it('adds a placeholder issuer domain and the anonymous agent mode when neither is set', () => {
    const { lines, log } = recorder()
    const result = convexChildEnv({ PATH: '/usr/bin' }, { anonymous: true, log })
    expect(result).toEqual({
      PATH: '/usr/bin',
      CLERK_JWT_ISSUER_DOMAIN: 'https://release-proof.invalid',
      CONVEX_AGENT_MODE: 'anonymous',
    })
    expect(lines).toEqual([
      'anonymous local deployment: using placeholder CLERK_JWT_ISSUER_DOMAIN (Clerk is not configured locally)',
    ])
  })

  it('leaves an already-configured Clerk issuer domain untouched', () => {
    const { lines, log } = recorder()
    const env = { CLERK_JWT_ISSUER_DOMAIN: 'https://real-tenant.clerk.accounts.dev' }
    expect(convexChildEnv(env, { anonymous: true, log })).toBe(env)
    expect(lines).toEqual([])
  })

  it('never leaks the placeholder into a real, non-anonymous deployment', () => {
    const { lines, log } = recorder()
    const env = { PATH: '/usr/bin' }
    expect(convexChildEnv(env, { anonymous: false, log })).toBe(env)
    expect(lines).toEqual([])
  })
})

describe('launcher flags', () => {
  it('takes its own flags and forwards everything else to Vite', () => {
    expect(parseLauncherFlags([
      '--skip-scan',
      '--port',
      '4100',
      '--no-doctor',
      '--x',
      '--skip-seed',
    ])).toEqual({
      skipScan: true,
      skipSeed: true,
      runDoctor: false,
      viteArgs: ['--port', '4100', '--x'],
    })
  })

  it('defaults to a full staged start with no Vite overrides', () => {
    expect(parseLauncherFlags([])).toEqual({
      skipScan: false,
      skipSeed: false,
      runDoctor: true,
      viteArgs: [],
    })
    expect(parseLauncherFlags(['--host', '0.0.0.0']).viteArgs).toEqual(['--host', '0.0.0.0'])
  })
})

describe('effective environment', () => {
  const files = [
    { name: '.env', contents: 'SHARED=base\nCONVEX_URL=http://127.0.0.1:1\n' },
    { name: '.env.local', contents: 'VITE_CONVEX_URL=http://127.0.0.1:2\nCONVEX_DEPLOYMENT=local:stale\n' },
    { name: '.env.development', contents: 'SHARED=development\n' },
    { name: '.env.development.local', contents: 'CONVEX_URL=http://127.0.0.1:3\n' },
  ]

  it('lets the later file win and names the file each value came from', () => {
    const { env, sources } = effectiveEnv({ PATH: '/usr/bin' }, files)
    expect(env.SHARED).toBe('development')
    expect(sources.SHARED).toBe('.env.development')
    expect(env.CONVEX_URL).toBe('http://127.0.0.1:3')
    expect(sources.CONVEX_URL).toBe('.env.development.local')
    expect(sources.VITE_CONVEX_URL).toBe('.env.local')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('drops CONVEX_DEPLOYMENT from both the inherited env and the files', () => {
    const inherited = effectiveEnv({ CONVEX_DEPLOYMENT: 'anonymous:other-checkout' }, [])
    expect(inherited.env.CONVEX_DEPLOYMENT).toBeUndefined()
    expect(inherited.dropped).toEqual(['CONVEX_DEPLOYMENT'])

    const fromFile = effectiveEnv({}, files)
    expect(fromFile.env.CONVEX_DEPLOYMENT).toBeUndefined()
    expect(fromFile.sources.CONVEX_DEPLOYMENT).toBeUndefined()
    expect(fromFile.dropped).toEqual(['CONVEX_DEPLOYMENT'])
    expect(effectiveEnv({}, []).dropped).toEqual([])
  })

  it('prefers CONVEX_URL over VITE_CONVEX_URL and reports its file', () => {
    const { env, sources } = effectiveEnv({}, files)
    expect(resolveConvexUrl(env, sources)).toEqual({
      url: 'http://127.0.0.1:3',
      name: 'CONVEX_URL',
      file: '.env.development.local',
    })
    expect(resolveConvexUrl({ VITE_CONVEX_URL: 'http://127.0.0.1:2' }, sources)).toEqual({
      url: 'http://127.0.0.1:2',
      name: 'VITE_CONVEX_URL',
      file: '.env.local',
    })
    expect(resolveConvexUrl({ CONVEX_URL: '  ' }, {})).toBeUndefined()
  })
})

describe('convex probe', () => {
  it('accepts a listening backend and records the probed path', async () => {
    const seen: string[] = []
    const fetchImpl = async (url: URL) => {
      seen.push(String(url))
      return { status: 200 }
    }
    expect(await probeConvexUrl('http://127.0.0.1:3210', fetchImpl, 50)).toEqual({ ok: true })
    expect(seen).toEqual(['http://127.0.0.1:3210/version'])
  })

  it('reports a refused connection, an unexpected status and a timeout', async () => {
    const refusing = async () => { throw new TypeError('fetch failed') }
    expect(await probeConvexUrl('http://127.0.0.1:3210', refusing, 50))
      .toEqual({ ok: false, reason: 'refused' })

    const unavailable = async () => ({ status: 503 })
    expect(await probeConvexUrl('http://127.0.0.1:3210', unavailable, 50))
      .toEqual({ ok: false, reason: 'unexpected_status', status: 503 })

    const hanging = () => new Promise<{ status: number }>(() => {})
    expect(await probeConvexUrl('http://127.0.0.1:3210', hanging, 5))
      .toEqual({ ok: false, reason: 'timeout' })
  })

  it('rejects a value that is not an http URL without touching the network', async () => {
    let called = false
    const fetchImpl = async () => {
      called = true
      return { status: 200 }
    }
    expect(await probeConvexUrl('not-a-url', fetchImpl, 50)).toEqual({ ok: false, reason: 'invalid_url' })
    expect(await probeConvexUrl('ftp://127.0.0.1', fetchImpl, 50)).toEqual({ ok: false, reason: 'invalid_url' })
    expect(called).toBe(false)
  })

  it('only spawns convex dev when nothing is already listening', () => {
    expect(shouldSpawnConvex({ ok: true })).toBe(false)
    expect(shouldSpawnConvex({ ok: false, reason: 'refused' })).toBe(true)
    expect(shouldSpawnConvex(undefined)).toBe(true)
  })
})

describe('startup stages', () => {
  it('runs stages in order and reports what ran', async () => {
    const order: string[] = []
    const stages: Stage[] = ['first', 'second', 'third'].map((id) => ({
      id,
      run: async () => {
        order.push(id)
        return { ok: true }
      },
    }))
    const { lines, log } = recorder()
    expect(await runStages(stages, { log })).toEqual({ ok: true, ran: ['first', 'second', 'third'], skipped: [] })
    expect(order).toEqual(['first', 'second', 'third'])
    expect(lines).toEqual([])
  })

  it('stops at the first failing stage and prints its id, stderr tail and a fix', async () => {
    let laterRan = false
    const { lines, log } = recorder()
    const outcome = await runStages([
      { id: 'identities', run: async () => ({ ok: true }) },
      { id: 'authority', run: async () => ({ ok: false, stderr: 'noise\nCould not find function\n', fix: 'add devSeed:seedSandboxSpendingPolicy' }) },
      { id: 'sandbox-tool', run: async () => { laterRan = true; return { ok: true } } },
    ] satisfies Stage[], { log })

    expect(outcome).toEqual({ ok: false, id: 'authority', ran: ['identities'], skipped: [] })
    expect(laterRan).toBe(false)
    expect(lines[0]).toBe('stage authority failed: noise | Could not find function')
    expect(lines[1]).toBe('fix: add devSeed:seedSandboxSpendingPolicy')
  })

  it('treats a thrown stage as a failure', async () => {
    const { lines, log } = recorder()
    const outcome = await runStages([
      { id: 'scan', run: async () => { throw new Error('convex run is unavailable') } },
    ] satisfies Stage[], { log })
    expect(outcome.ok).toBe(false)
    expect(outcome.id).toBe('scan')
    expect(lines[0]).toBe('stage scan failed: convex run is unavailable')
    expect(lines[1]).toMatch(/^fix: /u)
  })

  it('prints the reason for both declared and runtime skips', async () => {
    const { lines, log } = recorder()
    const outcome = await runStages([
      { id: 'authority', skip: true, skipReason: '--skip-seed', run: async () => ({ ok: true }) },
      { id: 'scan', run: async () => ({ ok: true, skipped: true, reason: 'catalogue already complete' }) },
    ] satisfies Stage[], { log })
    expect(outcome).toEqual({ ok: true, ran: [], skipped: ['authority', 'scan'] })
    expect(lines).toEqual([
      'stage authority skipped: --skip-seed',
      'stage scan skipped: catalogue already complete',
    ])
  })
})

describe('x402-era stage set', () => {
  const stageRun = (overrides: Record<string, StageOutcome> = {}): { calls: string[], run: StageRun } => {
    const calls: string[] = []
    return {
      calls,
      run: async (reference: string) => {
        calls.push(reference)
        return overrides[reference] ?? { ok: true, stdout: '', stderr: '' }
      },
    }
  }

  it('orders identities, authority, scan and the sandbox tool', () => {
    const { run } = stageRun()
    expect(buildStages({ run }).map((stage) => stage.id))
      .toEqual(['identities', 'authority', 'scan', 'sandbox-tool'])
  })

  it('starts a refresh only when the catalogue is not already complete', async () => {
    const complete = stageRun({ 'x402DirectoryIndex:status': { ok: true, stdout: completeStatus } })
    const { lines, log } = recorder()
    expect(await runStages(buildStages({ run: complete.run }), { log }))
      .toEqual({ ok: true, ran: ['identities', 'authority', 'sandbox-tool'], skipped: ['scan'] })
    expect(complete.calls).not.toContain('x402DirectoryIndexRefresh:start')
    expect(lines).toEqual(['stage scan skipped: catalogue already complete'])

    const empty = stageRun({ 'x402DirectoryIndex:status': { ok: true, stdout: JSON.stringify({ kind: 'unavailable', refreshState: 'none' }) } })
    expect((await runStages(buildStages({ run: empty.run }), { log: () => {} })).ok).toBe(true)
    expect(empty.calls).toEqual([
      'workloadCron:ensurePlatformWorkloadIdentities',
      'devSeed:ensureLocalE2EOwnerIdentity',
      'devSeed:seedSandboxSpendingPolicy',
      'x402DirectoryIndex:status',
      'x402DirectoryIndexRefresh:start',
      'devSeed:publishSandboxTool',
    ])
  })

  it('honours --skip-scan and --skip-seed', async () => {
    const { calls, run } = stageRun()
    const { lines, log } = recorder()
    expect(await runStages(buildStages({ run, skipScan: true, skipSeed: true }), { log }))
      .toEqual({ ok: true, ran: ['identities'], skipped: ['authority', 'scan', 'sandbox-tool'] })
    expect(calls).toEqual([
      'workloadCron:ensurePlatformWorkloadIdentities',
      'devSeed:ensureLocalE2EOwnerIdentity',
    ])
    expect(lines).toEqual([
      'stage authority skipped: --skip-seed',
      'stage scan skipped: --skip-scan',
      'stage sandbox-tool skipped: --skip-seed',
    ])
  })

  it('fails the seed stages by name when the mutation does not exist', async () => {
    const { run } = stageRun({
      'devSeed:seedSandboxSpendingPolicy': { ok: false, stderr: 'Could not find function for "devSeed:seedSandboxSpendingPolicy"' },
    })
    const { lines, log } = recorder()
    const outcome = await runStages(buildStages({ run }), { log })
    expect(outcome.ok).toBe(false)
    expect(outcome.id).toBe('authority')
    expect(lines[0]).toContain('devSeed:seedSandboxSpendingPolicy')
    expect(lines[1]).toContain('devSeed:seedSandboxSpendingPolicy')
  })

  it('reads the catalogue completeness from the status query result', () => {
    expect(isCatalogueComplete(completeStatus)).toBe(true)
    expect(isCatalogueComplete(`log line\n${completeStatus}\n`)).toBe(true)
    expect(isCatalogueComplete(JSON.stringify({ kind: 'unavailable', refreshState: 'complete' }))).toBe(false)
    expect(isCatalogueComplete('not json at all')).toBe(false)
    expect(isCatalogueComplete('')).toBe(false)
  })
})

describe('release identity and reported URLs', () => {
  it('returns a 40-hex revision or nothing outside a repository', () => {
    expect(releaseRevision(() => `${'a1b2c3d4'.repeat(5)}\n`)).toBe('a1b2c3d4'.repeat(5))
    expect(releaseRevision(() => { throw new Error('not a git repository') })).toBeUndefined()
    expect(releaseRevision(() => 'HEAD')).toBeUndefined()
  })

  it('reads the URLs the two dev servers print', () => {
    expect(viteLocalUrl('  ➜  Local:   http://127.0.0.1:3024/\n  ➜  Network: use --host\n'))
      .toBe('http://127.0.0.1:3024')
    expect(viteLocalUrl('nothing yet')).toBeUndefined()

    expect(convexPrintedUrl('Started running the Convex deployment locally at http://127.0.0.1:3210\n'))
      .toBe('http://127.0.0.1:3210')
    expect(convexPrintedUrl('Convex dashboard is at http://127.0.0.1:6790/\nConvex functions ready!\n'))
      .toBeUndefined()
    expect(convexPrintedUrl('Convex functions ready!')).toBeUndefined()
  })

  it('picks the doctor next command from the JSON report', () => {
    expect(doctorNextCommand(JSON.stringify({
      kind: 'degraded',
      checks: [
        { id: 'origin', state: 'pass' },
        { id: 'server', state: 'fail', summary: 'unreachable', nextCommand: 'ae doctor --base-url http://127.0.0.1:3024' },
        { id: 'buyer', state: 'warn', nextCommand: 'ae connect' },
      ],
    }))).toBe('ae doctor --base-url http://127.0.0.1:3024')

    expect(doctorNextCommand(JSON.stringify({
      kind: 'degraded',
      checks: [{ id: 'buyer', state: 'warn', nextCommand: 'ae connect' }],
    }))).toBe('ae connect')

    expect(doctorNextCommand('AE doctor: degraded\nNext: ae fund\n')).toBe('ae fund')
    expect(doctorNextCommand(JSON.stringify({ kind: 'ready', checks: [{ id: 'origin', state: 'pass' }] })))
      .toBeUndefined()
    expect(doctorNextCommand('')).toBeUndefined()
  })
})

describe('convex run output parsing', () => {
  it('finds the result JSON behind a CLI banner', () => {
    expect(isCatalogueComplete(`✔ Provisioned a dev deployment {ignored\n${completeStatus}`)).toBe(true)
    expect(doctorNextCommand(`some { banner\n${JSON.stringify({ kind: 'degraded', checks: [{ id: 'server', state: 'fail', nextCommand: 'ae connect' }] })}`))
      .toBe('ae connect')
  })
})
