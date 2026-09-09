import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { delimiter, dirname, resolve as resolvePath } from 'node:path'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

import { configureLocalConvexServerFunctionToken, configureLocalSourceWriteSecret } from './local-source-write-secret.mjs'

const DEFAULT_VITE_ARGS = ['--port', '3024', '--strictPort', '--host', '127.0.0.1']
const DEFAULT_VITE_URL = 'http://127.0.0.1:3024'
const LOCAL_STARTUP_TIMEOUT_MS = 120_000
// A grown local database (tens of thousands of rows) can take well past the
// Convex CLI's own 30s default to cold-start; a fresh clone never notices
// this because its database is empty.
export const DEFAULT_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS = 180
const CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS_ENV = 'CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS'
const STAGE_TIMEOUT_MS = 90_000
const DOCTOR_TIMEOUT_MS = 120_000
const CHILD_KILL_GRACE_MS = 1_000
const CAPTURE_LIMIT = 65_536
const READY_WINDOW = 8_192
const PROBE_TIMEOUT_MS = 3_000
const VITE_ARGS_ENV = 'AE_LOCAL_DEV_VITE_ARGS'
const RELEASE_REVISION_ENV = 'AE_RELEASE_SOURCE_REVISION'
const CONVEX_DEPLOYMENT_ENV = 'CONVEX_DEPLOYMENT'
// Vite's own precedence: later files win, `.env.[mode].local` last.
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local']
const ANSI_PATTERN = /\u001B\[[0-9;]*m/gu
const CONVEX_READY_PATTERN = /Convex functions ready!/u
const VITE_READY_PATTERN = /\bLocal:\s+https?:\/\//u
// Vite's own "ready in Nms" line lands in the same banner flush as `Local:`
// in practice; accepting it too tolerates a chunk boundary that splits the
// banner from the URL line.
const VITE_READY_IN_PATTERN = /\bVITE\b[^\n]*\bready in\b/u
const VITE_URL_PATTERN = /\bLocal:\s+(https?:\/\/\S+?)\/?\s*$/mu
// `convex dev` only prints its URL on some paths, so the comparison is
// conditional. The dashboard URL is a different port and must not be read as
// the deployment URL.
const CONVEX_URL_PATTERN = /^(?![^\n]*[Dd]ashboard)[^\n]*\b(?:deployment|backend|convex)\b[^\n]{0,80}?(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{2,5})/gimu
const RELEASE_REVISION_PATTERN = /^[0-9a-f]{40}$/u
const LAUNCHER_LOG_PREFIX = 'local-dev'

export function isConvexReadyOutput(output) {
  return CONVEX_READY_PATTERN.test(output)
}

export function isViteReadyOutput(output) {
  const text = stripAnsi(output)
  return VITE_READY_PATTERN.test(text) || VITE_READY_IN_PATTERN.test(text)
}

function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_PATTERN, '')
}

function nonEmpty(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length === 0 ? undefined : trimmed
}

function log(message) {
  process.stderr.write(`${LAUNCHER_LOG_PREFIX}: ${message}\n`)
}

export function buildConvexSelectArgs() {
  return ['convex', 'deployment', 'select', 'local']
}

/**
 * Anonymous local deployments have no parseable deployment name
 * (`anonymous-agent` cannot be resolved against the Convex cloud API), so
 * `convex deployment select local` hard-fails before `convex dev` runs.
 * `convex dev` resolves the same local state file itself; skipping the
 * select no-op restores the dev:local flow for anonymous sandboxes.
 */
export function isAnonymousLocalDeployment() {
  const statePath = resolvePath('.convex/local/default/config.json')
  if (!existsSync(statePath)) return false

  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    return state.deploymentName === 'anonymous-agent'
  } catch {
    return false
  }
}

export function buildConvexDevArgs() {
  return ['convex', 'dev', '--typecheck', 'disable', '--local-force-upgrade']
}

// Matches the placeholder `tools/release/verify-convex-generated-anonymous.ts`
// already proves anonymous codegen against, so both paths agree on what an
// unconfigured Clerk looks like.
const ANONYMOUS_CLERK_JWT_ISSUER_DOMAIN = 'https://release-proof.invalid'

/**
 * `convex/auth.config.ts` throws on a missing `CLERK_JWT_ISSUER_DOMAIN`, so a
 * fresh anonymous local deployment with no Clerk configured cannot push
 * functions. Give `convex dev` the same placeholder the anonymous codegen
 * proof uses; a real deployment (or one where Clerk is already configured)
 * is returned unchanged.
 */
export function convexChildEnv(env, { anonymous = false, log: write = log } = {}) {
  const needsTimeout = env[CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS_ENV] === undefined
  const needsClerkPlaceholder = anonymous && env.CLERK_JWT_ISSUER_DOMAIN === undefined
  if (!needsTimeout && !needsClerkPlaceholder) return env

  const next = { ...env }
  if (needsTimeout) {
    next[CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS_ENV] = String(DEFAULT_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS)
  }
  if (needsClerkPlaceholder) {
    write('anonymous local deployment: using placeholder CLERK_JWT_ISSUER_DOMAIN (Clerk is not configured locally)')
    next.CLERK_JWT_ISSUER_DOMAIN = ANONYMOUS_CLERK_JWT_ISSUER_DOMAIN
    next.CONVEX_AGENT_MODE = 'anonymous'
  }
  return next
}

const CONVEX_TIMEOUT_FAILURE_PATTERN = /did not start on port/u
const CONVEX_CLERK_FAILURE_PATTERN = /CLERK_JWT_ISSUER_DOMAIN/u

/**
 * Picks a `fix:` line for a `convex dev` child that exited before printing
 * its ready pattern, by matching the captured output against the two known
 * causes; anything else gets a generic pointer back at the output above.
 */
export function convexExitFix(output, env = {}) {
  const text = stripAnsi(output ?? '')
  if (CONVEX_TIMEOUT_FAILURE_PATTERN.test(text)) {
    const used = env[CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS_ENV] ?? String(DEFAULT_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS)
    return `the local backend took longer than ${CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS_ENV}=${used}; rerun, or raise it for a large local database`
  }
  if (CONVEX_CLERK_FAILURE_PATTERN.test(text)) {
    return `set CLERK_JWT_ISSUER_DOMAIN, or use an anonymous local deployment which sets the ${ANONYMOUS_CLERK_JWT_ISSUER_DOMAIN} placeholder automatically`
  }
  return 'read the Convex output above'
}

/**
 * Launcher flags are consumed here; every other argument belongs to Vite.
 */
export function parseLauncherFlags(argv = []) {
  let skipScan = false
  let skipSeed = false
  let runDoctor = true
  const viteArgs = []
  for (const arg of argv) {
    if (arg === '--skip-scan') {
      skipScan = true
      continue
    }
    if (arg === '--skip-seed') {
      skipSeed = true
      continue
    }
    if (arg === '--no-doctor') {
      runDoctor = false
      continue
    }
    viteArgs.push(arg)
  }
  return { skipScan, skipSeed, runDoctor, viteArgs }
}

function readEnvFiles(names = ENV_FILES) {
  return names.flatMap((name) => existsSync(name)
    ? [{ name, contents: readFileSync(name, 'utf8') }]
    : [])
}

/**
 * Merge the dotenv files the way Vite does (later file wins) and record which
 * file supplied each name. Only names are recorded, never values.
 *
 * `CONVEX_DEPLOYMENT` is always dropped: a supervisor or a checked-in file can
 * carry a deployment choice from another checkout, and `convex dev` resolves
 * the local deployment from `.convex/` itself.
 */
export function effectiveEnv(baseEnv = process.env, files = readEnvFiles()) {
  const env = { ...baseEnv }
  const sources = {}
  for (const { name, contents } of files) {
    for (const [key, value] of Object.entries(parseEnv(contents ?? ''))) {
      env[key] = value
      sources[key] = name
    }
  }
  const dropped = []
  if (env[CONVEX_DEPLOYMENT_ENV] !== undefined) {
    delete env[CONVEX_DEPLOYMENT_ENV]
    delete sources[CONVEX_DEPLOYMENT_ENV]
    dropped.push(CONVEX_DEPLOYMENT_ENV)
  }
  return { env, sources, dropped }
}

function launcherEnv() {
  const merged = effectiveEnv()
  // npm/npx use `#!/usr/bin/env node`; keep every child on this verified
  // Node 22 binary even when the interactive shell's PATH still prefers a
  // different major.
  merged.env.PATH = [dirname(process.execPath), merged.env.PATH].filter(Boolean).join(delimiter)
  return merged
}

/**
 * `convex dev` owns `.env.local`, so the launcher reads the URL back out of the
 * merged env rather than writing it.
 */
export function resolveConvexUrl(env = {}, sources = {}) {
  const direct = nonEmpty(env.CONVEX_URL)
  if (direct !== undefined) {
    return { url: direct, name: 'CONVEX_URL', file: sources.CONVEX_URL ?? 'the environment' }
  }
  const vite = nonEmpty(env.VITE_CONVEX_URL)
  if (vite !== undefined) {
    return { url: vite, name: 'VITE_CONVEX_URL', file: sources.VITE_CONVEX_URL ?? 'the environment' }
  }
  return undefined
}

export function viteLocalUrl(output) {
  const match = VITE_URL_PATTERN.exec(stripAnsi(output))
  return match?.[1]
}

export function convexPrintedUrl(output) {
  const text = stripAnsi(output)
  let last
  CONVEX_URL_PATTERN.lastIndex = 0
  for (const match of text.matchAll(CONVEX_URL_PATTERN)) last = match[1]
  return last
}

function sameOrigin(left, right) {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

/**
 * A liveness probe, not a health check: Convex backends answer `/version`
 * before any function is pushed.
 */
export async function probeConvexUrl(url, fetchImpl = fetch, timeoutMs = PROBE_TIMEOUT_MS) {
  let probeUrl
  try {
    probeUrl = new URL('/version', url)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (probeUrl.protocol !== 'http:' && probeUrl.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_url' }
  }

  const controller = new AbortController()
  const timeout = Symbol('timeout')
  let timer
  const expiry = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(timeout)
    }, timeoutMs)
  })
  try {
    const response = await Promise.race([
      fetchImpl(probeUrl, { method: 'GET', signal: controller.signal }),
      expiry,
    ])
    if (response === timeout) return { ok: false, reason: 'timeout' }
    const status = Number(response?.status)
    if (status >= 200 && status < 300) return { ok: true }
    return { ok: false, reason: 'unexpected_status', status }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'AbortError' || name === 'TimeoutError') return { ok: false, reason: 'timeout' }
    return { ok: false, reason: 'refused' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Never disturb a backend this launcher did not start.
 */
export function shouldSpawnConvex(probeResult) {
  return probeResult?.ok !== true
}

/**
 * `git rev-parse HEAD` outside a repository exits non-zero; that is not a
 * launcher failure, the release identity is simply unknown.
 */
export function releaseRevision(execImpl = defaultExec) {
  try {
    const revision = String(execImpl('git', ['rev-parse', 'HEAD']) ?? '').trim()
    return RELEASE_REVISION_PATTERN.test(revision) ? revision : undefined
  } catch {
    return undefined
  }
}

function defaultExec(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/**
 * `convex run` prints its result with `console.log`, so stdout can carry a
 * banner ahead of the JSON. Widest slice first, then narrower ones.
 */
function jsonTail(text) {
  const source = stripAnsi(text).trim()
  const end = source.lastIndexOf('}')
  for (let start = source.indexOf('{'); start !== -1 && start < end; start = source.indexOf('{', start + 1)) {
    try {
      return JSON.parse(source.slice(start, end + 1))
    } catch {
      // A log line opened a brace; try the next candidate.
    }
  }
  return undefined
}

/**
 * `x402DirectoryIndex:status` returns `kind: 'ready'` only when
 * `activeDirectoryGeneration` found a generation with `status === 'complete'`
 * and `terminalObserved === true`, and it then reports
 * `coverage.completeness === 'completed_observed_scan'`. `kind` is the field
 * this skip relies on; `refreshState` describes the last attempt, not the
 * active generation, so it cannot stand in for it.
 */
export function isCatalogueComplete(stdout) {
  const status = jsonTail(stdout)
  return status?.kind === 'ready' && status?.coverage?.completeness === 'completed_observed_scan'
}

/**
 * The `--json` doctor prints a `DoctorResult`; the human renderer's `Next:`
 * line is derived from the same first-failure-then-warning order.
 */
export function doctorNextCommand(stdout) {
  const text = stripAnsi(stdout)
  const printed = /^Next:\s*(.+)$/mu.exec(text)
  if (printed !== null) return printed[1]?.trim()
  const checks = jsonTail(text)?.checks
  if (!Array.isArray(checks)) return undefined
  const withCommand = (state) => checks.find((check) => check?.state === state && typeof check?.nextCommand === 'string')
  const failing = checks.find((check) => check?.state === 'fail')
  if (failing !== undefined) return nonEmpty(failing.nextCommand)
  return nonEmpty(withCommand('warn')?.nextCommand) ?? nonEmpty(withCommand('pass')?.nextCommand)
}

function stderrTail(text, lines = 4) {
  const kept = stripAnsi(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-lines)
  return kept.length === 0 ? 'no output' : kept.join(' | ')
}

/**
 * Ordered, fail-closed startup stages. A stage stops the launcher so a broken
 * local stack is never presented as a working one.
 */
export async function runStages(stages, ctx = {}) {
  const write = ctx.log ?? log
  const ran = []
  const skipped = []
  for (const stage of stages) {
    if (stage.skip === true) {
      skipped.push(stage.id)
      write(`stage ${stage.id} skipped: ${stage.skipReason ?? 'no reason given'}`)
      continue
    }
    let outcome
    try {
      outcome = (await stage.run(ctx)) ?? { ok: true }
    } catch (error) {
      outcome = { ok: false, stderr: error instanceof Error ? error.message : String(error) }
    }
    if (outcome.ok !== true) {
      write(`stage ${stage.id} failed: ${stderrTail(outcome.stderr ?? '')}`)
      write(`fix: ${outcome.fix ?? stage.fix ?? `run the stage by hand and read its error before retrying \`npm run dev:local\``}`)
      return { ok: false, id: stage.id, ran, skipped }
    }
    if (outcome.skipped === true) {
      skipped.push(stage.id)
      write(`stage ${stage.id} skipped: ${outcome.reason ?? 'no reason given'}`)
      continue
    }
    ran.push(stage.id)
  }
  return { ok: true, ran, skipped }
}

const seedFix = (reference) => `${reference} must exist and be idempotent; add it in convex/devSeed.ts or rerun \`npm run dev:local -- --skip-seed\``

export function buildStages({ skipScan = false, skipSeed = false, run }) {
  return [
    {
      id: 'identities',
      async run() {
        const fleet = await run('workloadCron:ensurePlatformWorkloadIdentities')
        if (!fleet.ok) {
          return { ...fleet, fix: 'workloadCron:ensurePlatformWorkloadIdentities must succeed before the cron fleet can act; read the Convex error above' }
        }
        const owner = await run('devSeed:ensureLocalE2EOwnerIdentity')
        if (!owner.ok) {
          return { ...owner, fix: 'devSeed:ensureLocalE2EOwnerIdentity must succeed before the local consent loop can run' }
        }
        return { ok: true }
      },
    },
    {
      id: 'authority',
      skip: skipSeed,
      skipReason: '--skip-seed',
      async run() {
        const seeded = await run('devSeed:seedSandboxSpendingPolicy', '{}')
        return seeded.ok ? { ok: true } : { ...seeded, fix: seedFix('devSeed:seedSandboxSpendingPolicy') }
      },
    },
    {
      id: 'scan',
      skip: skipScan,
      skipReason: '--skip-scan',
      async run() {
        const status = await run('x402DirectoryIndex:status', '{}')
        if (!status.ok) {
          return { ...status, fix: 'x402DirectoryIndex:status must be readable before the catalogue can be refreshed' }
        }
        if (isCatalogueComplete(status.stdout)) {
          return { ok: true, skipped: true, reason: 'catalogue already complete' }
        }
        // The scan is a workflow; starting it is the contract, completion is not.
        const started = await run('x402DirectoryIndexRefresh:start', '{}')
        return started.ok
          ? { ok: true }
          : { ...started, fix: 'x402DirectoryIndexRefresh:start must accept the scan request; rerun with `--skip-scan` to boot without a catalogue' }
      },
    },
    {
      id: 'sandbox-tool',
      skip: skipSeed,
      skipReason: '--skip-seed',
      async run() {
        const published = await run('devSeed:publishSandboxTool', '{}')
        return published.ok ? { ok: true } : { ...published, fix: seedFix('devSeed:publishSandboxTool') }
      },
    },
  ]
}

function assertSupportedNode() {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
  if (major === 22) return

  throw new Error(
    `Unsupported Node.js runtime ${process.version}. This project requires Node.js 22. Use \`nvm install 22 && nvm use 22\` (or another Node 22 installation), then retry \`npm run dev:local\`.`,
  )
}

function signalExitStatus(signal) {
  const signalNumber = osConstants.signals[signal]
  return signalNumber === undefined ? 1 : 128 + signalNumber
}

export function childExitStatus({
  code,
  signal,
  requestedSignal = null,
  reason = null,
}) {
  if (reason === 'timeout') return 124
  if (requestedSignal !== null) return signalExitStatus(requestedSignal)
  if (code !== null) return code
  if (signal !== null) return signalExitStatus(signal)
  return 1
}

export function signalProcessTree(child, signal, kill = process.kill) {
  if (!Number.isInteger(child?.pid)) return false

  try {
    kill(-child.pid, signal)
    return true
  } catch {
    try {
      child.kill(signal)
      return true
    } catch {
      return false
    }
  }
}

export function terminateProcessTrees(children, signal, kill = process.kill) {
  return children.map((child) => signalProcessTree(child, signal, kill))
}

function formatChildFailure(label, result) {
  if (result.reason === 'timeout') {
    return `${label} timed out after ${result.timeoutMs}ms`
  }
  if (result.error instanceof Error) {
    return `${label} failed to start: ${result.error.message}`
  }
  if (result.signal !== null) {
    return `${label} exited from ${result.signal}`
  }
  if (result.code !== null) {
    return `${label} exited with code ${result.code}`
  }
  return `${label} exited unexpectedly`
}

function reportChildFailure(label, result) {
  if (result.requestedSignal !== null) return
  log(formatChildFailure(label, result))
}

export function readViteArgs(env = process.env) {
  const raw = env[VITE_ARGS_ENV]
  if (raw === undefined) return []

  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
    throw new Error(`${VITE_ARGS_ENV} must contain a JSON array of strings`)
  }
  return parsed
}

function createManagedChild(command, args, env, {
  label,
  readyPattern,
  timeoutMs = LOCAL_STARTUP_TIMEOUT_MS,
  capture = false,
  quiet = false,
} = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    detached: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  let settled = false
  let ready = readyPattern === undefined
  let output = ''
  let stdout = ''
  let stderr = ''
  let requestedSignal = null
  let reason = null
  let timeoutHandle = null
  let killHandle = null
  let resolveReady
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve
  })
  if (ready) resolveReady({ ready: true })

  const forwardOutput = (target, chunk, isStdout) => {
    if (!quiet) target.write(chunk)
    const text = chunk.toString('utf8')
    if (capture) {
      if (isStdout) stdout = `${stdout}${text}`.slice(-CAPTURE_LIMIT)
      else stderr = `${stderr}${text}`.slice(-CAPTURE_LIMIT)
    }
    if (ready || readyPattern === undefined) return
    output = `${output}${text}`.slice(-READY_WINDOW)
    if (!readyPattern(output)) return
    ready = true
    resolveReady({ ready: true })
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  child.stdout?.on('data', (chunk) => forwardOutput(process.stdout, chunk, true))
  child.stderr?.on('data', (chunk) => forwardOutput(process.stderr, chunk, false))

  let resolveDone
  const done = new Promise((resolve) => {
    resolveDone = resolve
  })

  const settle = (result) => {
    if (settled) return
    settled = true
    clearTimeout(timeoutHandle)
    clearTimeout(killHandle)
    const completed = {
      ...result,
      label,
      requestedSignal,
      reason,
      timeoutMs,
      stdout,
      stderr,
    }
    if (!ready) {
      ready = true
      resolveReady({ ready: false, result: completed })
    }
    resolveDone(completed)
  }

  child.once('error', (error) => settle({ error, code: null, signal: null }))
  child.once('exit', (code, signal) => settle({ code, signal }))

  const terminate = (
    signal = 'SIGTERM',
    terminationReason = 'signal',
    statusSignal = signal,
  ) => {
    if (settled) return
    if (terminationReason === 'timeout') reason = 'timeout'
    if (terminationReason === 'signal' && requestedSignal === null) {
      requestedSignal = statusSignal
    }
    signalProcessTree(child, signal)
    if (killHandle === null) {
      killHandle = setTimeout(() => {
        if (!settled) signalProcessTree(child, 'SIGKILL')
      }, CHILD_KILL_GRACE_MS)
    }
  }

  if (timeoutMs !== null) {
    timeoutHandle = setTimeout(() => terminate('SIGINT', 'timeout', null), timeoutMs)
  }

  return { child, done, ready: readyPromise, terminate, output: () => output }
}

export function createSupervisor() {
  const children = new Set()
  let parentSignal = null

  const add = (managed) => {
    children.add(managed)
    void managed.done.then(() => children.delete(managed), () => children.delete(managed))
    if (parentSignal !== null) {
      managed.terminate(
        parentSignal === 'SIGTERM' ? 'SIGINT' : parentSignal,
        'signal',
        parentSignal,
      )
    }
    return managed
  }
  const terminateAll = (signal, reason, statusSignal = signal) => {
    for (const managed of children) managed.terminate(signal, reason, statusSignal)
  }
  const waitForChildren = async () => {
    await Promise.all([...children].map(({ done }) => done))
  }
  const signal = (receivedSignal) => {
    if (parentSignal === null) parentSignal = receivedSignal
    terminateAll(
      receivedSignal === 'SIGTERM' ? 'SIGINT' : receivedSignal,
      'signal',
      receivedSignal,
    )
  }

  return {
    add,
    signal,
    terminateAll,
    waitForChildren,
    get parentSignal() {
      return parentSignal
    },
  }
}

function convexRunner(supervisor, env) {
  return async (reference, args) => {
    const managed = supervisor.add(createManagedChild(
      'npx',
      ['convex', 'run', reference, ...(args === undefined ? [] : [args])],
      env,
      { label: `convex run ${reference}`, timeoutMs: STAGE_TIMEOUT_MS, capture: true },
    ))
    const result = await managed.done
    return {
      ok: childExitStatus(result) === 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? result.error?.message ?? '',
    }
  }
}

async function runVite(viteArgs, supervisor, baseEnv) {
  const env = { ...baseEnv }
  const { secret, adminKey } = await configureLocalSourceWriteSecret({ env })
  const { token: serverFunctionToken } = await configureLocalConvexServerFunctionToken({ env })
  const appArgs = viteArgs.length > 0 ? viteArgs : DEFAULT_VITE_ARGS
  const revision = releaseRevision()
  Object.assign(env, {
    AE_SOURCE_WRITE_SECRET: secret,
    AE_CONVEX_SERVER_FUNCTION_TOKEN: serverFunctionToken,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
    VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E:
      env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E ?? 'true',
    // An explicit revision (CI, a release rehearsal) stays authoritative.
    ...(revision === undefined || nonEmpty(env[RELEASE_REVISION_ENV]) !== undefined
      ? {}
      : { [RELEASE_REVISION_ENV]: revision }),
  })
  delete env[VITE_ARGS_ENV]

  return supervisor.add(createManagedChild(
    'npm',
    ['run', 'dev', '--', ...appArgs],
    env,
    {
      label: 'Vite',
      readyPattern: isViteReadyOutput,
    },
  ))
}

async function reportDoctor(supervisor, env, baseUrl) {
  const managed = supervisor.add(createManagedChild(
    'npm',
    ['run', '--silent', 'ae', '--', 'doctor', '--json', '--base-url', baseUrl],
    env,
    { label: 'AE doctor', timeoutMs: DOCTOR_TIMEOUT_MS, capture: true, quiet: true },
  ))
  const result = await managed.done
  const next = doctorNextCommand(result.stdout ?? '') ?? doctorNextCommand(result.stderr ?? '')
  if (next !== undefined) {
    log(`doctor Next: ${next}`)
    return
  }
  log(childExitStatus(result) === 0
    ? 'doctor reported no next command'
    : `doctor could not run (${formatChildFailure('AE doctor', result)}); the stack is still up`)
}

async function startConvex(supervisor, env) {
  const anonymous = isAnonymousLocalDeployment()
  if (anonymous) {
    log('anonymous local deployment — skipping `convex deployment select local`')
  } else {
    const selected = supervisor.add(createManagedChild(
      'npx',
      buildConvexSelectArgs(),
      env,
      { label: 'Convex deployment select' },
    ))
    const selectedResult = await selected.done
    if (supervisor.parentSignal !== null) return { status: signalExitStatus(supervisor.parentSignal) }
    if (childExitStatus(selectedResult) !== 0) {
      reportChildFailure('Convex deployment select', selectedResult)
      return { status: childExitStatus(selectedResult) }
    }
  }

  const convexEnv = convexChildEnv(env, { anonymous })
  const convex = supervisor.add(createManagedChild(
    'npx',
    buildConvexDevArgs(),
    convexEnv,
    { label: 'Convex dev', readyPattern: isConvexReadyOutput },
  ))
  const readiness = await convex.ready
  if (!readiness.ready) {
    const result = readiness.result ?? await convex.done
    if (supervisor.parentSignal !== null) return { status: signalExitStatus(supervisor.parentSignal) }
    reportChildFailure('Convex dev', result)
    log(`fix: ${convexExitFix(convex.output(), convexEnv)}`)
    supervisor.terminateAll('SIGINT', 'peer-failure')
    return { status: childExitStatus(result) }
  }
  if (supervisor.parentSignal !== null) {
    supervisor.terminateAll('SIGINT', 'signal', supervisor.parentSignal)
    return { status: signalExitStatus(supervisor.parentSignal) }
  }
  return { convex }
}

function reportUnreachableConvex(convexUrl, probe) {
  const detail = probe.reason === 'unexpected_status'
    ? `answered ${probe.status}`
    : `is ${probe.reason.replace('_', ' ')}`
  log(`the Convex URL Vite will use (${convexUrl.url} from ${convexUrl.file}) ${detail}`)
  log(`fix: remove the stale ${convexUrl.name} from ${convexUrl.file} or start the backend it points at`)
}

async function runLocalStack({ viteArgs, skipScan, skipSeed, runDoctor }) {
  let { env, sources, dropped } = launcherEnv()
  for (const name of dropped) log(`ignoring inherited ${name}; convex dev resolves the local deployment`)
  const supervisor = createSupervisor()
  const onSigint = () => supervisor.signal('SIGINT')
  const onSigterm = () => supervisor.signal('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  try {
    const existing = resolveConvexUrl(env, sources)
    const existingProbe = existing === undefined
      ? { ok: false, reason: 'invalid_url' }
      : await probeConvexUrl(existing.url)
    let convex = null
    if (shouldSpawnConvex(existingProbe)) {
      const started = await startConvex(supervisor, env)
      if (started.convex === undefined) return started.status
      convex = started.convex
      // `convex dev` writes the local URL into `.env.local`; re-read the files.
      ;({ env, sources } = launcherEnv())
    } else {
      log(`a local backend is already running at ${existing.url}; reusing it`)
    }

    const convexUrl = resolveConvexUrl(env, sources)
    if (convexUrl === undefined) {
      log('no CONVEX_URL or VITE_CONVEX_URL is set after Convex started')
      log('fix: let `npx convex dev` write .env.local, or set CONVEX_URL to the backend you want Vite to use')
      supervisor.terminateAll('SIGINT', 'peer-failure')
      return 1
    }

    const printed = convex === null ? undefined : convexPrintedUrl(convex.output())
    if (printed !== undefined && !sameOrigin(printed, convexUrl.url)) {
      log(`convex dev is serving ${printed} but Vite would use ${convexUrl.url} (${convexUrl.name} in ${convexUrl.file})`)
      log(`fix: remove the stale ${convexUrl.name} from ${convexUrl.file} or start the backend it points at`)
      supervisor.terminateAll('SIGINT', 'peer-failure')
      return 1
    }

    const probe = await probeConvexUrl(convexUrl.url)
    if (!probe.ok) {
      reportUnreachableConvex(convexUrl, probe)
      supervisor.terminateAll('SIGINT', 'peer-failure')
      return 1
    }

    const staged = await runStages(
      buildStages({ skipScan, skipSeed, run: convexRunner(supervisor, env) }),
      { log },
    )
    if (!staged.ok) {
      supervisor.terminateAll('SIGINT', 'peer-failure')
      return 1
    }
    if (supervisor.parentSignal !== null) {
      supervisor.terminateAll('SIGINT', 'signal', supervisor.parentSignal)
      return signalExitStatus(supervisor.parentSignal)
    }

    let vite
    try {
      vite = await runVite(viteArgs, supervisor, env)
    } catch (error) {
      supervisor.terminateAll('SIGINT', 'peer-failure')
      if (convex !== null) await convex.done
      reportChildFailure('Vite setup', { error, code: null, signal: null, requestedSignal: null, reason: null })
      return 1
    }

    const viteReadiness = await vite.ready
    if (viteReadiness.ready && runDoctor) {
      await reportDoctor(supervisor, env, viteLocalUrl(vite.output()) ?? DEFAULT_VITE_URL)
    }

    const watched = [
      ...(convex === null ? [] : [{ owner: 'Convex dev', done: convex.done }]),
      { owner: 'Vite', done: vite.done },
    ]
    const firstExit = await Promise.race(watched.map(({ owner, done }) => done.then((result) => ({ owner, result }))))
    if (supervisor.parentSignal !== null) {
      supervisor.terminateAll('SIGINT', 'signal', supervisor.parentSignal)
      await Promise.all(watched.map(({ done }) => done))
      return signalExitStatus(supervisor.parentSignal)
    }

    supervisor.terminateAll('SIGINT', 'peer-failure')
    const result = firstExit.result
    if (childExitStatus(result) === 0) {
      log(`${firstExit.owner} exited unexpectedly`)
      return 1
    }
    reportChildFailure(firstExit.owner, result)
    return childExitStatus(result)
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    await supervisor.waitForChildren()
  }
}

async function main() {
  assertSupportedNode()
  const flags = parseLauncherFlags(process.argv.slice(2))
  return runLocalStack({
    ...flags,
    viteArgs: flags.viteArgs.length > 0 ? flags.viteArgs : readViteArgs(),
  })
}

if (
  process.argv[1] !== undefined &&
  resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((status) => {
      if (Number.isInteger(status)) process.exitCode = status
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
