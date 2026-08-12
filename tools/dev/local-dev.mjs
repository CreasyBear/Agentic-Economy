import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { delimiter, dirname, resolve as resolvePath } from 'node:path'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

import { configureLocalSourceWriteSecret } from './local-source-write-secret.mjs'

const DEFAULT_VITE_ARGS = ['--port', '3024', '--strictPort', '--host', '127.0.0.1']
const LOCAL_STARTUP_TIMEOUT_MS = 120_000
const CHILD_KILL_GRACE_MS = 1_000
const VITE_ARGS_ENV = 'AE_LOCAL_DEV_VITE_ARGS'
const CONVEX_READY_PATTERN = /Convex functions ready!/u
const VITE_READY_PATTERN = /\bLocal:\s+https?:\/\//u
export function isConvexReadyOutput(output) {
  return CONVEX_READY_PATTERN.test(output)
}

export function isViteReadyOutput(output) {
  return VITE_READY_PATTERN.test(output)
}


export function buildConvexSelectArgs() {
  return ['convex', 'deployment', 'select', 'local']
}

export function buildConvexDevArgs() {
  return ['convex', 'dev', '--typecheck', 'disable', '--local-force-upgrade']
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
  process.stderr.write(`local-dev: ${formatChildFailure(label, result)}\n`)
}

function localDevelopmentEnv() {
  const env = { ...process.env }
  // npm/npx use `#!/usr/bin/env node`; keep every child on this verified
  // Node 22 binary even when the interactive shell's PATH still prefers Node 25.
  env.PATH = [dirname(process.execPath), env.PATH].filter(Boolean).join(delimiter)
  // A supervisor can carry deployment/model choices from another checkout.
  // The repository's local env is authoritative for this local stack.
  delete env.CONVEX_DEPLOYMENT
  for (const path of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (existsSync(path)) Object.assign(env, parseEnv(readFileSync(path, 'utf8')))
  }
  return env
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
  let requestedSignal = null
  let reason = null
  let timeoutHandle = null
  let killHandle = null
  let resolveReady
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve
  })
  if (ready) resolveReady({ ready: true })

  const forwardOutput = (target, chunk) => {
    target.write(chunk)
    if (ready || readyPattern === undefined) return
    output = `${output}${chunk.toString('utf8')}`.slice(-8_192)
    if (!readyPattern(output)) return
    ready = true
    resolveReady({ ready: true })
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  child.stdout?.on('data', (chunk) => forwardOutput(process.stdout, chunk))
  child.stderr?.on('data', (chunk) => forwardOutput(process.stderr, chunk))

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

  return { child, done, ready: readyPromise, terminate }
}

function createSupervisor() {
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
    get parentSignal() {
      return parentSignal
    },
  }
}

async function runVite(viteArgs, supervisor) {
  const env = localDevelopmentEnv()
  const { secret, adminKey } = await configureLocalSourceWriteSecret({ env })
  const appArgs = viteArgs.length > 0 ? viteArgs : DEFAULT_VITE_ARGS
  Object.assign(env, {
    AE_SOURCE_WRITE_SECRET: secret,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
    VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E:
      env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E ?? 'true',
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

async function runLocalStack(viteArgs) {
  const env = localDevelopmentEnv()
  const supervisor = createSupervisor()
  const onSigint = () => supervisor.signal('SIGINT')
  const onSigterm = () => supervisor.signal('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  try {
    const selected = supervisor.add(createManagedChild(
      'npx',
      buildConvexSelectArgs(),
      env,
      { label: 'Convex deployment select' },
    ))
    const selectedResult = await selected.done
    if (supervisor.parentSignal !== null) {
      return signalExitStatus(supervisor.parentSignal)
    }
    if (childExitStatus(selectedResult) !== 0) {
      reportChildFailure('Convex deployment select', selectedResult)
      return childExitStatus(selectedResult)
    }

    const convex = supervisor.add(createManagedChild(
      'npx',
      buildConvexDevArgs(),
      env,
      { label: 'Convex dev', readyPattern: isConvexReadyOutput },
    ))
    const convexReadiness = await convex.ready
    if (!convexReadiness.ready) {
      const result = convexReadiness.result ?? await convex.done
      if (supervisor.parentSignal !== null) {
        return signalExitStatus(supervisor.parentSignal)
      }
      reportChildFailure('Convex dev', result)
      supervisor.terminateAll('SIGINT', 'peer-failure')
      return childExitStatus(result)
    }
    if (supervisor.parentSignal !== null) {
      supervisor.terminateAll('SIGINT', 'signal', supervisor.parentSignal)
      return signalExitStatus(supervisor.parentSignal)
    }

    let vite
    try {
      vite = await runVite(viteArgs, supervisor)
    } catch (error) {
      supervisor.terminateAll('SIGINT', 'peer-failure')
      await convex.done
      const result = { error, code: null, signal: null, requestedSignal: null, reason: null }
      reportChildFailure('Vite setup', result)
      return 1
    }

    const firstExit = await Promise.race([
      convex.done.then((result) => ({ owner: 'Convex dev', result })),
      vite.done.then((result) => ({ owner: 'Vite', result })),
    ])
    if (supervisor.parentSignal !== null) {
      supervisor.terminateAll('SIGINT', 'signal', supervisor.parentSignal)
      await Promise.all([convex.done, vite.done])
      return signalExitStatus(supervisor.parentSignal)
    }

    supervisor.terminateAll('SIGINT', 'peer-failure')
    const result = firstExit.result
    if (childExitStatus(result) === 0) {
      process.stderr.write(`local-dev: ${firstExit.owner} exited unexpectedly\n`)
      return 1
    }
    reportChildFailure(firstExit.owner, result)
    return childExitStatus(result)
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
}

async function main() {
  assertSupportedNode()
  const viteArgs = process.argv.slice(2)
  return runLocalStack(viteArgs.length > 0 ? viteArgs : readViteArgs())
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
