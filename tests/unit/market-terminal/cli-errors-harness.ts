import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { resolve } from 'node:path'

import { runCli } from '../../../tools/ae/cli'

// vitest globalSetup (tests/setup/build-cli.global.ts) builds this bundle
// before any spawn test runs, so every spawn execs plain JS instead of paying
// a tsx transpile on each of the hundreds of CLI-spawning assertions.
export const CLI_BUNDLE_PATH = resolve(process.cwd(), 'packages/cli/dist/ae.js')

const CLI_ARGV = [CLI_BUNDLE_PATH] as const

export async function spawnCli(
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
): Promise<{
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    status: number | null
    signal: NodeJS.Signals | null
    stdout: string
    stderr: string
  }>()
  const child = spawn(process.execPath, [...CLI_ARGV, ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options?.env,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  child.once('error', reject)
  child.once('close', (status, signal) => resolve({
    status,
    signal,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }))
  return promise
}

/**
 * In-process alternative to `spawnCli`/`spawnCliSync` (oclif's `runCommand`
 * and npm's `mock-npm` take the same approach): calls the CLI's argv entry
 * directly in this worker instead of forking a child process, at the cost of
 * only being valid for calls that do not need a distinct environment (see
 * `runCli` in tools/ae/cli.ts for exactly what is and is not threaded).
 * Reuse the ambient `process.env` (i.e. omit `options.env`, or pass
 * `process.env` itself) for every call site migrated here; anything that
 * needs an overridden environment (AE_CONFIG_DIR, AE_API_KEY, a custom
 * base URL via env instead of --base-url, etc.) must keep using
 * `spawnCli`/`spawnCliSync`, which give each call its own real child-process
 * environment.
 */
export async function runCliInProcess(
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
): Promise<{
  status: number
  signal: null
  stdout: string
  stderr: string
}> {
  const { status, stdout, stderr } = await runCli(args, options?.env === undefined ? {} : { env: options.env })
  return { status, signal: null, stdout, stderr }
}

export function spawnCliSync(
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [...CLI_ARGV, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: options?.env,
    maxBuffer: 4 * 1024 * 1024,
  })
}
