import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { parseEnv } from 'node:util'

import { configureLocalSourceWriteSecret } from './local-source-write-secret.mjs'

const VITE_MODE = '--vite'
const VITE_ARGS_ENV = 'AE_LOCAL_DEV_VITE_ARGS'
const CONVEX_START_COMMAND = 'node tools/dev/local-dev.mjs --vite'
const DEFAULT_VITE_ARGS = ['--port', '3024', '--strictPort', '--host', '127.0.0.1']

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

function childExitStatus({ code, signal, requestedSignal = null }) {
  if (requestedSignal !== null) return signalExitStatus(requestedSignal)
  if (code !== null) return code
  if (signal !== null) return signalExitStatus(signal)
  return 1
}

function runChild(command, args, env = process.env, { sigterm = 'SIGTERM' } = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  })

  return new Promise((resolve, reject) => {
    let settled = false
    let requestedSignal = null

    const forwardSignal = (signal, forwardedSignal = signal) => {
      if (settled || child.exitCode !== null) return
      requestedSignal = signal
      child.kill(forwardedSignal)
    }
    const onSigint = () => forwardSignal('SIGINT')
    const onSigterm = () => forwardSignal('SIGTERM', sigterm)
    const cleanup = () => {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
    }
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }

    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)
    child.once('error', (error) => settle(reject, error))
    child.once('exit', (code, signal) =>
      settle(resolve, { code, signal, requestedSignal }),
    )
  })
}

function localDevelopmentEnv() {
  const env = { ...process.env }
  // A supervisor can carry deployment/model choices from another checkout.
  // The repository's local env is authoritative for this local stack.
  delete env.CONVEX_DEPLOYMENT
  for (const path of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (existsSync(path)) Object.assign(env, parseEnv(readFileSync(path, 'utf8')))
  }
  return env
}

function readViteArgs() {
  const raw = process.env[VITE_ARGS_ENV]
  if (raw === undefined) return []

  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
    throw new Error(`${VITE_ARGS_ENV} must contain a JSON array of strings`)
  }
  return parsed
}

async function runVite(viteArgs) {
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

  const result = await runChild('npm', ['run', 'dev', '--', ...appArgs], env)
  process.exitCode = childExitStatus(result)
}

async function runLocalStack(viteArgs) {
  const env = localDevelopmentEnv()
  const selected = await runChild('npx', ['convex', 'deployment', 'select', 'local'], env)
  if (childExitStatus(selected) !== 0) {
    process.exitCode = childExitStatus(selected)
    return
  }

  env[VITE_ARGS_ENV] = JSON.stringify(viteArgs)
  const convex = await runChild(
    'npx',
    ['convex', 'dev', '--typecheck', 'disable', '--start', CONVEX_START_COMMAND],
    env,
    { sigterm: 'SIGINT' },
  )
  process.exitCode = childExitStatus(convex)
}

async function main() {
  assertSupportedNode()
  if (process.argv[2] === VITE_MODE) {
    const viteArgs = process.argv.slice(3)
    await runVite(viteArgs.length > 0 ? viteArgs : readViteArgs())
    return
  }
  await runLocalStack(process.argv.slice(2))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
