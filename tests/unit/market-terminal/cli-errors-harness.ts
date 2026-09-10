import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { resolve } from 'node:path'

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
