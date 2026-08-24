import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const root = resolve(process.cwd())
const generatedDirectory = join('convex', '_generated')
const generatedSourceFiles = ['api.d.ts', 'api.js', 'dataModel.d.ts', 'server.d.ts', 'server.js'] as const
const requiredRootFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'convex.json'] as const
const requiredSourceDirectories = ['src', 'convex'] as const

function copyReleaseSource(target: string): void {
  for (const name of requiredRootFiles) cpSync(resolve(root, name), resolve(target, name))
  for (const name of requiredSourceDirectories) {
    cpSync(resolve(root, name), resolve(target, name), { recursive: true })
  }
  const nodeModules = resolve(root, 'node_modules')
  if (!existsSync(nodeModules)) throw new Error('convex_anonymous_codegen_node_modules_missing')
  symlinkSync(nodeModules, resolve(target, 'node_modules'), 'dir')
}

function anonymousEnvironment(): NodeJS.ProcessEnv {
  return {
    ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
    ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
    ...(process.env.TMPDIR === undefined ? {} : { TMPDIR: process.env.TMPDIR }),
    CI: '1',
    NO_COLOR: '1',
    CONVEX_AGENT_MODE: 'anonymous',
    CLERK_JWT_ISSUER_DOMAIN: 'https://release-proof.invalid',
  }
}

function listFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path))
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(path)
  }
  return files
}

function generatedDrift(isolatedRoot: string): string[] {
  const expectedRoot = resolve(root, generatedDirectory)
  const observedRoot = resolve(isolatedRoot, generatedDirectory)
  const expected = new Map(listFiles(expectedRoot).map((path) => [relative(expectedRoot, path), path]))
  const observed = new Map(listFiles(observedRoot).map((path) => [relative(observedRoot, path), path]))
  const names = [...new Set([...expected.keys(), ...observed.keys()])].sort()
  return names.filter((name) => {
    const expectedPath = expected.get(name)
    const observedPath = observed.get(name)
    if (expectedPath === undefined || observedPath === undefined) return true
    const expectedStat = lstatSync(expectedPath)
    const observedStat = lstatSync(observedPath)
    if (expectedStat.isSymbolicLink() !== observedStat.isSymbolicLink()) return true
    return !readFileSync(expectedPath).equals(readFileSync(observedPath))
  })
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function isolatedProcessIds(isolatedRoot: string): number[] {
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error('convex_anonymous_process_inspection_failed')
  return (result.stdout ?? '')
    .split('\n')
    .filter((line) => line.includes(isolatedRoot))
    .map((line) => Number.parseInt(line.trim().split(/\s+/u)[0] ?? '', 10))
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid)
}

async function terminateIsolatedProcesses(isolatedRoot: string): Promise<void> {
  const initial = isolatedProcessIds(isolatedRoot)
  for (const pid of initial) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  if (initial.length > 0) await wait(250)
  for (const pid of isolatedProcessIds(isolatedRoot)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  if (initial.length > 0) await wait(100)
  if (isolatedProcessIds(isolatedRoot).length > 0) {
    throw new Error('convex_anonymous_process_cleanup_failed')
  }
}

async function runConvex(isolatedRoot: string, args: readonly string[]): Promise<void> {
  const convexCli = resolve(isolatedRoot, 'node_modules', 'convex', 'bin', 'main.js')
  const child = spawn(process.execPath, [convexCli, ...args], {
    cwd: isolatedRoot,
    detached: true,
    env: anonymousEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout = `${stdout}${chunk}`.slice(-8_000) })
  child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_000) })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      process.kill(-child.pid!, 'SIGTERM')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }, 180_000)
  const result = await new Promise<Readonly<{ status: number | null; error?: Error }>>((resolvePromise) => {
    child.once('error', (error) => resolvePromise({ status: null, error }))
    child.once('close', (status) => resolvePromise({ status }))
  })
  clearTimeout(timer)
  try {
    process.kill(-child.pid!, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
  await terminateIsolatedProcesses(isolatedRoot)
  if (timedOut) throw new Error(`convex_anonymous_${args[0] ?? 'command'}_failed:timeout`)
  if (result.error !== undefined) {
    throw new Error(`convex_anonymous_${args[0] ?? 'command'}_failed:${result.error.message}`)
  }
  if (result.status !== 0) {
    const output = `${stdout}\n${stderr}`
      .replaceAll(isolatedRoot, '<isolated-checkout>')
      .replaceAll(root, '<source-checkout>')
      .replaceAll(resolve(root, 'node_modules'), '<node_modules>')
      .trim()
    throw new Error(`convex_anonymous_${args[0] ?? 'command'}_failed:${output}`)
  }
}

async function run(): Promise<void> {
  const isolatedRoot = mkdtempSync(resolve(tmpdir(), 'ae-convex-source-proof-'))
  try {
    copyReleaseSource(isolatedRoot)
    for (const name of generatedSourceFiles) {
      rmSync(resolve(isolatedRoot, generatedDirectory, name))
    }
    await runConvex(isolatedRoot, ['init'])
    await runConvex(isolatedRoot, ['codegen', '--typecheck=disable'])
    for (const name of generatedSourceFiles) {
      if (!existsSync(resolve(isolatedRoot, generatedDirectory, name))) {
        throw new Error(`convex_generated_source_missing:${name}`)
      }
    }
    const drift = generatedDrift(isolatedRoot)
    if (drift.length > 0) {
      throw new Error(`convex_generated_source_drift:${drift.join(',')}`)
    }
    const generatedCount = listFiles(resolve(isolatedRoot, generatedDirectory)).length
    process.stdout.write(`CONVEX_ANONYMOUS_CODEGEN_PASS files=${generatedCount}\n`)
  } finally {
    await terminateIsolatedProcesses(isolatedRoot)
    rmSync(isolatedRoot, { recursive: true, force: true })
  }
}

await run()
