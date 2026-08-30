import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const LOCAL_CONVEX_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost):3210\/?$/u
const SOURCE_WRITE_SECRET_NAME = 'AE_SOURCE_WRITE_SECRET'
const CONVEX_SERVER_FUNCTION_TOKEN_NAME = 'AE_CONVEX_SERVER_FUNCTION_TOKEN'
const MIN_CONVEX_SERVER_FUNCTION_TOKEN_LENGTH = 32

function mergedLocalEnv({ env, dotenvFiles }) {
  return Object.assign({}, ...dotenvFiles.map(({ content }) => parseEnv(content)), env)
}

function assertLocalProvisioningFence(effectiveEnv) {
  if (effectiveEnv.NODE_ENV?.trim() === 'production') {
    throw new Error('local_source_write_production_forbidden')
  }
  const convexUrl = effectiveEnv.CONVEX_URL?.trim() || effectiveEnv.VITE_CONVEX_URL?.trim()
  if (convexUrl === undefined || !LOCAL_CONVEX_URL.test(convexUrl)) {
    throw new Error('local_source_write_local_convex_required')
  }
}

/**
 * Resolve the one server-only source-write root used by a local app and its
 * local Convex deployment. The URL fence is intentional: this helper must not
 * provision secrets for hosted or production deployments.
 */
export function resolveLocalSourceWriteSecret({
  env = process.env,
  dotenvFiles = [],
  randomBytes: randomBytesImpl = (size) => randomBytes(size),
} = {}) {
  const effectiveEnv = mergedLocalEnv({ env, dotenvFiles })
  assertLocalProvisioningFence(effectiveEnv)

  const configured = nonEmpty(effectiveEnv[SOURCE_WRITE_SECRET_NAME])
  if (configured !== undefined) {
    return { secret: configured, source: 'existing' }
  }

  const generated = Buffer.from(randomBytesImpl(32)).toString('hex')
  return {
    secret: generated,
    source: 'generated',
    persistPath: '.env.development.local',
  }
}

/**
 * Resolve the service-auth token the app's server code signs Convex
 * source-function assertions with (registerAgentAccessGrant and friends).
 * Same local-only fence as the source-write secret; generated values are
 * 64 hex chars, satisfying the >=32-char assertion gate on both sides.
 */
export function resolveLocalConvexServerFunctionToken({
  env = process.env,
  dotenvFiles = [],
  randomBytes: randomBytesImpl = (size) => randomBytes(size),
} = {}) {
  const effectiveEnv = mergedLocalEnv({ env, dotenvFiles })
  assertLocalProvisioningFence(effectiveEnv)

  const configured = nonEmpty(effectiveEnv[CONVEX_SERVER_FUNCTION_TOKEN_NAME])
  if (configured !== undefined) {
    if (configured.length < MIN_CONVEX_SERVER_FUNCTION_TOKEN_LENGTH) {
      throw new Error('local_convex_server_function_token_too_short')
    }
    return { token: configured, source: 'existing' }
  }

  return {
    token: Buffer.from(randomBytesImpl(32)).toString('hex'),
    source: 'generated',
    persistPath: '.env.development.local',
  }
}

export function sourceWriteEnvAssignment(secret) {
  const value = nonEmpty(secret)
  if (value === undefined) {
    throw new Error('local_source_write_secret_empty')
  }
  return `${SOURCE_WRITE_SECRET_NAME}=${value}\n`
}

async function persistLocalEnvAssignment(path, name, value) {
  const assignment = `${name}=${value}\n`
  const current = existsSync(path) ? await readFile(path, 'utf8') : ''
  const linePattern = new RegExp(`^${name}=.*$`, 'mu')
  const next = linePattern.test(current)
    ? current.replace(linePattern, assignment.trimEnd())
    : `${current}${current.length > 0 && !current.endsWith('\n') ? '\n' : ''}${assignment}`
  await writeFile(path, next, 'utf8')
}

export async function persistLocalSourceWriteSecret(path, secret) {
  await persistLocalEnvAssignment(path, SOURCE_WRITE_SECRET_NAME, secret)
}

export async function persistLocalConvexServerFunctionToken(path, token) {
  await persistLocalEnvAssignment(path, CONVEX_SERVER_FUNCTION_TOKEN_NAME, token)
}

export async function configureLocalSourceWriteSecret({
  cwd = process.cwd(),
  env = process.env,
  runEnvSet = runConvexEnvSet,
} = {}) {
  const dotenvFiles = await readDotenvFiles(cwd)
  const result = resolveLocalSourceWriteSecret({ env, dotenvFiles })
  if (result.source === 'generated') {
    await persistLocalSourceWriteSecret(resolvePath(cwd, result.persistPath), result.secret)
  }

  const convexConfig = await readLocalConvexConfig(cwd)
  await runEnvSet({
    cwd,
    url: convexConfig.url,
    adminKey: convexConfig.adminKey,
    secret: result.secret,
  })

  return { ...result, adminKey: convexConfig.adminKey }
}

/**
 * Provision AE_CONVEX_SERVER_FUNCTION_TOKEN idempotently: reuse the
 * configured value, or generate and persist one, then push it into the
 * local Convex deployment env store so server-signed service assertions
 * verify on the Convex side. Returns the resolved token.
 */
export async function configureLocalConvexServerFunctionToken({
  cwd = process.cwd(),
  env = process.env,
  runEnvSet = runConvexEnvSet,
} = {}) {
  const dotenvFiles = await readDotenvFiles(cwd)
  const result = resolveLocalConvexServerFunctionToken({ env, dotenvFiles })
  if (result.source === 'generated') {
    await persistLocalConvexServerFunctionToken(resolvePath(cwd, result.persistPath), result.token)
  }

  const convexConfig = await readLocalConvexConfig(cwd)
  await runEnvSet({
    cwd,
    url: convexConfig.url,
    adminKey: convexConfig.adminKey,
    name: CONVEX_SERVER_FUNCTION_TOKEN_NAME,
    secret: result.token,
  })

  return { ...result, adminKey: convexConfig.adminKey }
}

async function readDotenvFiles(cwd) {
  const paths = ['.env', '.env.local', '.env.development', '.env.development.local']
  const files = []
  for (const path of paths) {
    const absolutePath = resolvePath(cwd, path)
    if (!existsSync(absolutePath)) continue
    files.push({ path, content: await readFile(absolutePath, 'utf8') })
  }
  return files
}


async function readLocalConvexConfig(cwd) {
  const path = resolvePath(cwd, '.convex/local/default/config.json')
  if (!existsSync(path)) {
    throw new Error('local_convex_config_missing_run_convex_deployment_create_local')
  }
  const config = JSON.parse(await readFile(path, 'utf8'))
  if (!Number.isInteger(config.ports?.cloud) || typeof config.adminKey !== 'string') {
    throw new Error('local_convex_config_invalid')
  }
  return {
    url: `http://127.0.0.1:${config.ports.cloud}`,
    adminKey: config.adminKey,
  }
}

function runConvexEnvSet({ cwd, url, adminKey, name = SOURCE_WRITE_SECRET_NAME, secret }) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      'convex',
      'env',
      'set',
      '--url',
      url,
      '--admin-key',
      adminKey,
      name,
    ], {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`local_source_write_convex_env_set_failed:${code ?? signal ?? 'unknown'}`))
    })
    child.stdin.end(`${secret}\n`)
  })
}

function nonEmpty(value) {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

if (process.argv[1] !== undefined && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configureLocalSourceWriteSecret()
    .then(({ source }) => {
      process.stdout.write(`Local source-write secret ${source}; configured app and Convex.\n`)
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
