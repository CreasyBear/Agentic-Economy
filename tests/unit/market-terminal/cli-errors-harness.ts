import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'

const CLI_ARGV = ['--import', 'tsx', 'tools/ae/cli.ts'] as const

export async function spawnCli(args: readonly string[]): Promise<{
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
  })
}
