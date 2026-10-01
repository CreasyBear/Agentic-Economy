import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'

const requiredRootFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'convex.json'] as const
const requiredSourceDirectories = ['src', 'convex'] as const
const allowedCommands = new Set(['init', 'dev', 'codegen', 'env', 'run', 'data', 'export', 'import'])
const forbiddenOptions = new Set([
  '--prod', '--url', '--admin-key', '--deployment', '--deployment-name', '--preview-name',
  '--env-file', '--team', '--project', '--configure', '--start', '--run-sh',
])
const forbiddenEnvironment = new Set([
  'CONVEX_DEPLOY_KEY', 'CONVEX_ACCESS_TOKEN', 'CONVEX_DEPLOYMENT_TOKEN',
  'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_AGENT_MODE',
])

// Requires: a fresh, separate source copy and anonymous project-local development selection.
// Ensures: complete bounded command output and cleanup of this copy's CLI/backend processes,
// except successful explicitly retained sessions whose caller owns final cleanup.
// Invariant: source files, inherited secrets/selectors, HOME and shared deployments are untouched.
// On violation: fail with a diagnostic code; truncated output or failed cleanup cannot be success.
// Cost/benefit: these three operations serve codegen verification and the native restore drill,
// replacing duplicated isolation/cleanup logic without introducing a deployment framework.
export function copyReleaseSource(sourceRoot: string, targetRoot: string): void {
  const source = realpathSync(sourceRoot)
  const target = realpathSync(targetRoot)
  requireSeparateRoots(source, target)
  if (lstatSync(targetRoot).isSymbolicLink() || readdirSync(target).length !== 0) {
    throw new Error('convex_anonymous_copy_target_not_fresh')
  }
  for (const name of requiredRootFiles) {
    const path = resolve(source, name)
    if (!lstatSync(path).isFile()) throw new Error('convex_anonymous_copy_source_invalid')
    cpSync(path, resolve(target, name))
  }
  for (const name of requiredSourceDirectories) {
    cpSync(resolve(source, name), resolve(target, name), {
      recursive: true,
      filter: (path) => {
        const name = basename(path)
        if (name.startsWith('.env') || name === '.convex' || name === '.npmrc') return false
        if (lstatSync(path).isSymbolicLink()) throw new Error('convex_anonymous_copy_source_symlink')
        return true
      },
    })
  }
  const nodeModules = resolve(source, 'node_modules')
  if (!existsSync(nodeModules)) throw new Error('convex_anonymous_codegen_node_modules_missing')
  symlinkSync(nodeModules, resolve(target, 'node_modules'), 'dir')
}

function requireSeparateRoots(source: string, isolated: string): void {
  if (source === isolated || isolated.startsWith(`${source}${sep}`) || source.startsWith(`${isolated}${sep}`)) {
    throw new Error('convex_anonymous_roots_not_separate')
  }
}

function anonymousEnvironment(isolatedRoot: string): NodeJS.ProcessEnv {
  return {
    ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
    ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
    ...(process.env.TMPDIR === undefined ? {} : { TMPDIR: process.env.TMPDIR }),
    CI: '1', NO_COLOR: '1', CONVEX_AGENT_MODE: 'anonymous',
    AE_DEPLOYMENT_ENVIRONMENT: 'development',
    CLERK_JWT_ISSUER_DOMAIN: 'https://release-proof.invalid',
    npm_config_audit: 'false', npm_config_cache: resolve(isolatedRoot, '.npm-cache'),
    npm_config_fetch_retries: '2', npm_config_fetch_retry_maxtimeout: '10000',
    npm_config_fetch_retry_mintimeout: '1000', npm_config_fetch_timeout: '30000',
    npm_config_fund: 'false', npm_config_prefer_offline: 'true',
    npm_config_update_notifier: 'false', npm_config_userconfig: resolve(isolatedRoot, '.npmrc'),
  }
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && url.username === '' && url.password === ''
  } catch { return false }
}

function readConfiguration(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch { throw new Error('convex_anonymous_configuration_invalid') }
}

function assertAnonymousSelection(isolatedRoot: string, args: readonly string[], persistentDev = false): void {
  if (!allowedCommands.has(args[0] ?? '')) throw new Error('convex_anonymous_command_not_allowed')
  for (const [index, arg] of args.entries()) {
    const option = arg.split('=')[0] ?? arg
    if (forbiddenOptions.has(option)) throw new Error('convex_anonymous_selection_forbidden')
    if (option === '--dev-deployment' && (arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[index + 1]) !== 'local') {
      throw new Error('convex_anonymous_selection_forbidden')
    }
  }
  if (args[0] === 'dev' && !persistentDev && !args.includes('--once')) throw new Error('convex_anonymous_dev_once_required')
  if (args[0] === 'env' && args[1] === 'set') {
    const name = args[2] ?? ''
    if (name === 'CONVEX_DEPLOYMENT' || forbiddenEnvironment.has(name)
      || (name === 'AE_DEPLOYMENT_ENVIRONMENT' && args[3] !== 'development')) {
      throw new Error('convex_anonymous_selection_forbidden')
    }
  }
  // These are the installed CLI's actual project selectors, not web runtime configuration.
  for (const name of ['.env', '.env.local']) {
    const path = resolve(isolatedRoot, name)
    if (!existsSync(path)) continue
    if (!lstatSync(path).isFile()) throw new Error('convex_anonymous_configuration_invalid')
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*(?:#.*)?$/u)
      if (match === null) continue
      const name = match[1]
      const raw = match[2]
      if (name === undefined || raw === undefined) throw new Error('convex_anonymous_configuration_invalid')
      const value = raw.replace(/^['"]|['"]$/gu, '')
      if (forbiddenEnvironment.has(name)
        || (name === 'CONVEX_DEPLOYMENT' && value !== 'anonymous:anonymous-agent')
        || (['CONVEX_URL', 'VITE_CONVEX_URL', 'NEXT_PUBLIC_CONVEX_URL', 'CONVEX_SITE_URL'].includes(name) && !isLoopbackUrl(value))) {
        throw new Error('convex_anonymous_selection_forbidden')
      }
    }
  }
  const configPath = resolve(isolatedRoot, '.convex', 'local', 'default', 'config.json')
  if (existsSync(configPath)) {
    const config = readConfiguration(configPath)
    if (typeof config !== 'object' || config === null || !('deploymentName' in config)
      || config.deploymentName !== 'anonymous-agent') throw new Error('convex_anonymous_selection_forbidden')
  }
  const project = readConfiguration(resolve(isolatedRoot, 'convex.json'))
  if (typeof project !== 'object' || project === null || 'team' in project || 'project' in project) {
    throw new Error('convex_anonymous_selection_forbidden')
  }
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function isolatedProcessIds(isolatedRoot: string, processGroup?: number): number[] {
  const result = spawnSync('ps', ['-axo', 'pid=,pgid=,uid=,command='], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error('convex_anonymous_process_inspection_failed')
  const currentUid = typeof process.getuid === 'function' ? process.getuid() : undefined
  const pids: number[] = []
  for (const line of (result.stdout ?? '').split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u)
    const [, pidText, groupText, uidText, command] = match ?? []
    if (pidText === undefined || groupText === undefined || uidText === undefined || command === undefined) continue
    const pid = Number(pidText)
    const position = command.indexOf(isolatedRoot)
    const nextCharacter = command[position + isolatedRoot.length]
    const pathMatches = position >= 0 && (nextCharacter === undefined || /[\s/"']/u.test(nextCharacter))
    const groupMatches = processGroup !== undefined && Number(groupText) === processGroup
    if ((pathMatches || groupMatches) && (currentUid === undefined || Number(uidText) === currentUid)
      && Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid) pids.push(pid)
  }
  return pids
}

function signal(pid: number, name: NodeJS.Signals): void {
  try { process.kill(pid, name) }
  catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ESRCH') {
      throw new Error('convex_anonymous_process_cleanup_failed', { cause: error })
    }
  }
}

export async function terminateIsolatedProcesses(isolatedRoot: string, processGroup?: number): Promise<void> {
  const isolated = realpathSync(isolatedRoot)
  const initial = isolatedProcessIds(isolated, processGroup)
  for (const pid of initial) signal(pid, 'SIGTERM')
  if (initial.length > 0) await wait(250)
  for (const pid of isolatedProcessIds(isolated, processGroup)) signal(pid, 'SIGKILL')
  if (initial.length > 0) await wait(100)
  if (isolatedProcessIds(isolated, processGroup).length > 0) {
    throw new Error('convex_anonymous_process_cleanup_failed')
  }
}

export async function runConvexCommand(input: Readonly<{
  sourceRoot: string
  isolatedRoot: string
  args: readonly string[]
  outputLimitBytes?: number
  timeoutMs?: number
  retainBackendOnSuccess?: boolean
}>): Promise<Readonly<{ stdout: string; stderr: string }>> {
  const source = realpathSync(input.sourceRoot)
  const isolated = realpathSync(input.isolatedRoot)
  requireSeparateRoots(source, isolated)
  assertAnonymousSelection(isolated, input.args)
  const outputLimit = input.outputLimitBytes ?? 16 * 1024 * 1024
  const timeout = input.timeoutMs ?? 180_000
  if (!Number.isSafeInteger(outputLimit) || outputLimit <= 0 || !Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error('convex_anonymous_command_limits_invalid')
  }
  const child = spawn(process.execPath, [resolve(isolated, 'node_modules', 'convex', 'bin', 'main.js'), ...input.args], {
    cwd: isolated, detached: true, env: anonymousEnvironment(isolated), stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let bytes = 0
  let failure: 'timeout' | 'output_limit' | undefined
  let cleanup: Promise<void> | undefined
  let cleanupFailed = false
  let succeeded = false
  const stop = (reason: 'timeout' | 'output_limit'): void => {
    if (failure !== undefined) return
    failure = reason
    child.kill('SIGTERM')
    cleanup = terminateIsolatedProcesses(isolated, child.pid).catch(() => { cleanupFailed = true })
  }
  const collect = (target: Buffer[], chunk: Buffer): void => {
    bytes += chunk.length
    if (bytes > outputLimit) stop('output_limit')
    else if (failure === undefined) target.push(chunk)
  }
  child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk))
  child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk))
  const timer = setTimeout(() => stop('timeout'), timeout)
  try {
    const result = await new Promise<Readonly<{ status: number | null; failed: boolean }>>((resolvePromise) => {
      child.once('error', () => resolvePromise({ status: null, failed: true }))
      child.once('close', (status) => resolvePromise({ status, failed: false }))
    })
    if (cleanup !== undefined) await cleanup
    if (cleanupFailed) throw new Error('convex_anonymous_process_cleanup_failed')
    if (failure !== undefined) throw new Error(`convex_anonymous_command_${failure}`)
    if (result.failed || result.status !== 0) throw new Error('convex_anonymous_command_failed')
    succeeded = true
    return { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }
  } finally {
    clearTimeout(timer)
    if (!succeeded || input.retainBackendOnSuccess !== true) {
      await terminateIsolatedProcesses(isolated, child.pid)
    }
  }
}

// Requires: the same anonymous isolation, plus an explicit maintained backend version.
// Ensures: readiness is observed from the official CLI before exposing the owned stop function.
// Invariant: persistent dev is available only through these fixed arguments; ordinary commands
// still require dev --once. A background failure cannot become a successful restore receipt.
// On violation: stop the owned CLI/backend and retain a code-only failure for the final stop.
export async function startConvexDev(input: Readonly<{
  sourceRoot: string
  isolatedRoot: string
  backendVersion: string
}>): Promise<() => Promise<void>> {
  const source = realpathSync(input.sourceRoot)
  const isolated = realpathSync(input.isolatedRoot)
  requireSeparateRoots(source, isolated)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(input.backendVersion)) {
    throw new Error('convex_anonymous_backend_version_invalid')
  }
  const args = ['dev', '--typecheck=disable', '--codegen=disable', '--tail-logs=disable',
    '--local-backend-version', input.backendVersion]
  assertAnonymousSelection(isolated, args, true)
  return await new Promise<() => Promise<void>>((resolveReady, rejectReady) => {
    const child = spawn(process.execPath, [resolve(isolated, 'node_modules', 'convex', 'bin', 'main.js'), ...args], {
      cwd: isolated, detached: true, env: anonymousEnvironment(isolated), stdio: ['ignore', 'pipe', 'pipe'],
    })
    let ready = false
    let stopping = false
    let failure: string | undefined
    let bytes = 0
    let markerTail = ''
    let cleanup: Promise<void> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanupOwned = (): Promise<void> => {
      if (cleanup === undefined) {
        stopping = true
        if (timer !== undefined) clearTimeout(timer)
        cleanup = terminateIsolatedProcesses(isolated, child.pid).catch(() => {
          failure = 'convex_anonymous_process_cleanup_failed'
          throw new Error(failure)
        })
      }
      return cleanup
    }
    const stop = async (): Promise<void> => {
      await cleanupOwned()
      if (failure !== undefined) throw new Error(failure)
    }
    const fail = (code: string): void => {
      failure ??= code
      const beforeReady = !ready
      void cleanupOwned().then(
        () => { if (beforeReady) rejectReady(new Error(failure)) },
        () => { if (beforeReady) rejectReady(new Error('convex_anonymous_process_cleanup_failed')) },
      )
    }
    const observe = (chunk: Buffer): void => {
      bytes += chunk.length
      if (bytes > 16 * 1024 * 1024) { fail('convex_anonymous_dev_output_limit'); return }
      if (ready || stopping) return
      const observed = `${markerTail}${chunk.toString('utf8')}`
      markerTail = observed.slice(-256)
      if (observed.includes('Convex functions ready!')) {
        ready = true
        if (timer !== undefined) clearTimeout(timer)
        resolveReady(stop)
      }
    }
    child.stdout.on('data', observe)
    child.stderr.on('data', observe)
    child.once('error', () => fail('convex_anonymous_dev_failed'))
    child.once('close', () => {
      if (!stopping) fail('convex_anonymous_dev_exited')
    })
    timer = setTimeout(() => fail('convex_anonymous_dev_timeout'), 180_000)
  })
}
