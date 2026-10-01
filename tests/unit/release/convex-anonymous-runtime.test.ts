import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  copyReleaseSource,
  runConvexCommand,
  startConvexDev,
  terminateIsolatedProcesses,
} from '../../../tools/release/convex-anonymous-runtime'

const fixtures: Array<{ root: string; sourceRoot: string; isolatedRoot: string }> = []

// The external CLI fixture observes real environment, pipes, exit and process lifetime.
// No Convex runtime or internal helper is mocked; no deployment or provider is contacted.
const cli = `
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const scenario = process.argv[3];
if (process.argv[2] === 'dev') {
  const version = process.argv[process.argv.indexOf('--local-backend-version') + 1];
  fs.writeFileSync('dev-args.json', JSON.stringify(process.argv.slice(2)));
  fs.writeFileSync('dev.pid', String(process.pid));
  if (version === 'precompiled-startup-failure') {
    process.stderr.write('credential-that-must-not-appear-in-error');
    process.exitCode = 9;
  } else {
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
    if (version !== 'precompiled-stalled') {
      process.stderr.write('Convex functions ');
      setTimeout(() => {
        process.stderr.write('ready! (' + 'x'.repeat(512) + ')');
        if (version === 'precompiled-late-failure') setTimeout(() => process.exit(9), 100);
        if (version === 'precompiled-overflow') setTimeout(() => process.stdout.write('a'.repeat(16 * 1024 * 1024)), 100);
      }, 10);
    }
  }
} else if (scenario === 'environment') {
  console.log(JSON.stringify(process.env));
} else if (scenario === 'complete') {
  process.stdout.write(JSON.stringify({ value: 'a'.repeat(12000) }));
  process.stderr.write('complete-stderr');
} else if (scenario === 'overflow') {
  process.stdout.write('a'.repeat(2048));
  setInterval(() => {}, 1000);
} else if (scenario === 'failure') {
  process.stderr.write('credential-that-must-not-appear-in-error');
  process.exitCode = 9;
} else if (scenario === 'timeout') {
  fs.writeFileSync('owned.pid', String(process.pid));
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (scenario === 'backend' || scenario === 'backend-failure') {
  const worker = path.resolve('owned-worker.cjs');
  fs.writeFileSync(worker, "require('node:fs').writeFileSync('backend.pid', String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);");
  const child = spawn(process.execPath, [worker], { detached: true, stdio: 'ignore', cwd: process.cwd() });
  child.unref();
  const timer = setInterval(() => {
    if (fs.existsSync('backend.pid')) {
      clearInterval(timer); console.log('backend-started');
      if (scenario === 'backend-failure') process.exitCode = 9;
    }
  }, 10);
} else {
  console.log('local-command');
}
`

function fixture(): { root: string; sourceRoot: string; isolatedRoot: string } {
  const root = mkdtempSync(resolve(tmpdir(), 'ae-anonymous-runtime-test-'))
  const sourceRoot = resolve(root, 'source')
  const isolatedRoot = resolve(root, 'isolated')
  mkdirSync(resolve(sourceRoot, 'src'), { recursive: true })
  mkdirSync(resolve(sourceRoot, 'convex'), { recursive: true })
  mkdirSync(resolve(sourceRoot, 'node_modules', 'convex', 'bin'), { recursive: true })
  mkdirSync(isolatedRoot)
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'convex.json']) {
    writeFileSync(resolve(sourceRoot, name), '{}')
  }
  writeFileSync(resolve(sourceRoot, 'src', 'source.ts'), 'export const source = true')
  writeFileSync(resolve(sourceRoot, 'convex', 'fixture.ts'), 'export const fixture = true')
  writeFileSync(resolve(sourceRoot, 'node_modules', 'convex', 'bin', 'main.js'), cli)
  const result = { root, sourceRoot, isolatedRoot }
  fixtures.push(result)
  return result
}

function copiedFixture(): ReturnType<typeof fixture> {
  const result = fixture()
  copyReleaseSource(result.sourceRoot, result.isolatedRoot)
  return result
}

function processIsGone(path: string): boolean {
  const pid = Number(readFileSync(path, 'utf8'))
  try { process.kill(pid, 0); return false }
  catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH'
  }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const fixture of fixtures.splice(0)) {
    try { await terminateIsolatedProcesses(fixture.isolatedRoot) }
    finally { rmSync(fixture.root, { recursive: true, force: true }) }
  }
})

describe('anonymous Convex release runtime', () => {
  it('copies source without inherited deployment state or dotenv files', () => {
    const input = fixture()
    mkdirSync(resolve(input.sourceRoot, '.convex'))
    writeFileSync(resolve(input.sourceRoot, '.env.local'), 'CONVEX_DEPLOYMENT=prod:private')
    writeFileSync(resolve(input.sourceRoot, 'src', '.env'), 'SECRET=private')
    copyReleaseSource(input.sourceRoot, input.isolatedRoot)
    expect(readFileSync(resolve(input.isolatedRoot, 'src', 'source.ts'), 'utf8')).toContain('source = true')
    expect(existsSync(resolve(input.isolatedRoot, '.convex'))).toBe(false)
    expect(existsSync(resolve(input.isolatedRoot, '.env.local'))).toBe(false)
    expect(existsSync(resolve(input.isolatedRoot, 'src', '.env'))).toBe(false)
    expect(existsSync(resolve(input.isolatedRoot, 'node_modules', 'convex', 'bin', 'main.js'))).toBe(true)
  })

  it('refuses a nonfresh copy or overlapping source', () => {
    const input = fixture()
    writeFileSync(resolve(input.isolatedRoot, '.env.local'), 'CONVEX_DEPLOYMENT=prod:private')
    expect(() => copyReleaseSource(input.sourceRoot, input.isolatedRoot)).toThrow('convex_anonymous_copy_target_not_fresh')
    expect(() => copyReleaseSource(input.sourceRoot, input.sourceRoot)).toThrow('convex_anonymous_roots_not_separate')
  })

  it('preserves HOME while excluding inherited credentials and deployment selectors', async () => {
    const input = copiedFixture()
    const home = process.env.HOME
    vi.stubEnv('CONVEX_DEPLOYMENT', 'prod:private')
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'private')
    vi.stubEnv('STRIPE_SECRET_KEY', 'private')
    const output = await runConvexCommand({ ...input, args: ['data', 'environment'] })
    const observed = JSON.parse(output.stdout)
    expect(observed.HOME).toBe(home)
    expect(observed.CONVEX_DEPLOYMENT).toBeUndefined()
    expect(observed.CONVEX_DEPLOY_KEY).toBeUndefined()
    expect(observed.STRIPE_SECRET_KEY).toBeUndefined()
    expect(observed.CONVEX_AGENT_MODE).toBe('anonymous')
    expect(observed.AE_DEPLOYMENT_ENVIRONMENT).toBe('development')
    expect(observed.npm_config_cache).toBe(resolve(realpathSync(input.isolatedRoot), '.npm-cache'))
    expect(observed.npm_config_userconfig).toBe(resolve(realpathSync(input.isolatedRoot), '.npmrc'))
  })

  it('returns complete JSON beyond the former trailing-output cap', async () => {
    const input = copiedFixture()
    const output = await runConvexCommand({ ...input, args: ['data', 'complete'] })
    expect(JSON.parse(output.stdout)).toEqual({ value: 'a'.repeat(12000) })
    expect(output.stderr).toBe('complete-stderr')
  })

  it('fails output saturation instead of returning a partial success', async () => {
    const input = copiedFixture()
    await expect(runConvexCommand({ ...input, args: ['data', 'overflow'], outputLimitBytes: 1024, retainBackendOnSuccess: true }))
      .rejects.toThrow('convex_anonymous_command_output_limit')
  })

  it('does not include command output or credentials in failure diagnostics', async () => {
    const input = copiedFixture()
    await expect(runConvexCommand({ ...input, args: ['data', 'failure'] }))
      .rejects.toThrow(/^convex_anonymous_command_failed$/u)
  })

  it('terminates an owned CLI that ignores SIGTERM after timeout', async () => {
    const input = copiedFixture()
    await expect(runConvexCommand({ ...input, args: ['data', 'timeout'], timeoutMs: 300, retainBackendOnSuccess: true }))
      .rejects.toThrow('convex_anonymous_command_timeout')
    expect(processIsGone(resolve(input.isolatedRoot, 'owned.pid'))).toBe(true)
  })

  it('cleans an escaped backend after a successful CLI command', async () => {
    const input = copiedFixture()
    const output = await runConvexCommand({ ...input, args: ['data', 'backend'] })
    expect(output.stdout.trim()).toBe('backend-started')
    expect(processIsGone(resolve(input.isolatedRoot, 'backend.pid'))).toBe(true)
  })

  it('retains an explicitly requested successful backend until owner cleanup', async () => {
    const input = copiedFixture()
    const output = await runConvexCommand({ ...input, args: ['data', 'backend'], retainBackendOnSuccess: true })
    expect(output.stdout.trim()).toBe('backend-started')
    expect(processIsGone(resolve(input.isolatedRoot, 'backend.pid'))).toBe(false)
    await terminateIsolatedProcesses(input.isolatedRoot)
    expect(processIsGone(resolve(input.isolatedRoot, 'backend.pid'))).toBe(true)
  })

  it('cleans a failed command backend despite successful-session retention being requested', async () => {
    const input = copiedFixture()
    await expect(runConvexCommand({ ...input, args: ['data', 'backend-failure'], retainBackendOnSuccess: true }))
      .rejects.toThrow('convex_anonymous_command_failed')
    expect(processIsGone(resolve(input.isolatedRoot, 'backend.pid'))).toBe(true)
  })

  it.each([
    ['data', '--prod'], ['data', '--url=https://remote.invalid'], ['run', '--admin-key', 'private'],
    ['import', '--deployment', 'prod'], ['export', '--env-file', '/private/env'],
    ['dev', '--once', '--dev-deployment', 'cloud'], ['deploy'], ['dev'],
  ])('rejects nonlocal selection %j before spawning the CLI', async (...args: string[]) => {
    const input = copiedFixture()
    await expect(runConvexCommand({ ...input, args })).rejects.toThrow(/convex_anonymous_/u)
  })

  it.each([
    'CONVEX_DEPLOYMENT=prod:private', 'CONVEX_DEPLOY_KEY=private',
    'CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210', 'VITE_CONVEX_URL=https://remote.invalid',
  ])('rejects a copied project remote/credential selector %s', async (line) => {
    const input = copiedFixture()
    writeFileSync(resolve(input.isolatedRoot, '.env.local'), line)
    await expect(runConvexCommand({ ...input, args: ['data'] }))
      .rejects.toThrow('convex_anonymous_selection_forbidden')
  })

  it('accepts its generated anonymous loopback selectors but refuses other local project data', async () => {
    const input = copiedFixture()
    writeFileSync(resolve(input.isolatedRoot, '.env.local'),
      'CONVEX_DEPLOYMENT=anonymous:anonymous-agent # native fixture\nVITE_CONVEX_URL=http://127.0.0.1:3210\n')
    mkdirSync(resolve(input.isolatedRoot, '.convex', 'local', 'default'), { recursive: true })
    const config = resolve(input.isolatedRoot, '.convex', 'local', 'default', 'config.json')
    writeFileSync(config, JSON.stringify({ deploymentName: 'anonymous-agent', adminKey: 'local-only' }))
    await expect(runConvexCommand({ ...input, args: ['data'] })).resolves.toEqual({ stdout: 'local-command\n', stderr: '' })
    writeFileSync(config, JSON.stringify({ deploymentName: 'local-existing', adminKey: 'private' }))
    await expect(runConvexCommand({ ...input, args: ['data'] }))
      .rejects.toThrow('convex_anonymous_selection_forbidden')
  })

  it('waits for the actual dev readiness marker and returns an idempotent owned stop', async () => {
    const input = copiedFixture()
    const stop = await startConvexDev({ ...input, backendVersion: 'precompiled-ready' })
    expect(processIsGone(resolve(input.isolatedRoot, 'dev.pid'))).toBe(false)
    expect(JSON.parse(readFileSync(resolve(input.isolatedRoot, 'dev-args.json'), 'utf8'))).toEqual([
      'dev', '--typecheck=disable', '--codegen=disable', '--tail-logs=disable',
      '--local-backend-version', 'precompiled-ready',
    ])
    await stop()
    await stop()
    expect(processIsGone(resolve(input.isolatedRoot, 'dev.pid'))).toBe(true)
  })

  it('refuses a failed dev startup without leaking output and cleans its process', async () => {
    const input = copiedFixture()
    await expect(startConvexDev({ ...input, backendVersion: 'precompiled-startup-failure' }))
      .rejects.toThrow(/^convex_anonymous_dev_exited$/u)
    expect(processIsGone(resolve(input.isolatedRoot, 'dev.pid'))).toBe(true)
  })

  it('bounds stalled startup and terminates the owned dev process', async () => {
    const input = copiedFixture()
    const actualSetTimeout = globalThis.setTimeout
    // Accelerate only the external wall-clock deadline; process/cleanup behavior remains real.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, milliseconds, ...args) =>
      actualSetTimeout(callback, milliseconds === 180_000 ? 300 : milliseconds, ...args))
    await expect(startConvexDev({ ...input, backendVersion: 'precompiled-stalled' }))
      .rejects.toThrow('convex_anonymous_dev_timeout')
    expect(processIsGone(resolve(input.isolatedRoot, 'dev.pid'))).toBe(true)
  })

  it('reports an unexpected post-readiness exit through the final owned stop', async () => {
    const input = copiedFixture()
    const stop = await startConvexDev({ ...input, backendVersion: 'precompiled-late-failure' })
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await expect(stop()).rejects.toThrow('convex_anonymous_dev_exited')
    expect(processIsGone(resolve(input.isolatedRoot, 'dev.pid'))).toBe(true)
  })

  it('refuses output saturation after readiness and automatically stops the owned dev', async () => {
    const input = copiedFixture()
    const stop = await startConvexDev({ ...input, backendVersion: 'precompiled-overflow' })
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await expect(stop()).rejects.toThrow('convex_anonymous_dev_output_limit')
    expect(processIsGone(resolve(input.isolatedRoot, 'dev.pid'))).toBe(true)
  })
})
