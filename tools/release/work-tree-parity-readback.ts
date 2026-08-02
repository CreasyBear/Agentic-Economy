import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { isRecord } from '../../src/modules/common/is-record'
import { sanitizeWorkTreeParityEvidence, workTreeParityCredentialSecrets } from './work-tree-parity-evidence'
import { createWorkTreeAgentClient } from './work-tree-parity-release'

const execFileAsync = promisify(execFile)
const DEFAULT_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 128 * 1024

export type FreshAgentReadback = Readonly<{
  classification: Readonly<{
    process: 'fresh-child-process'
    client: 'fresh-agent-key'
    context: 'new-node-process'
  }>
  operation: 'inspect'
  status: number
  ok: boolean
  body: unknown
}>

/**
 * Runs a WorkTree inspect in a separate Node process. Credentials are passed only
 * through the child environment and are sanitized before the result crosses back.
 */
export async function runFreshAgentReadback(input: Readonly<{
  baseUrl: URL
  projectId: string
  agentApiKey: string
  bypassSecret?: string
  timeoutMs?: number
  cwd?: string
}>): Promise<FreshAgentReadback> {
  if (input.agentApiKey.trim().length === 0) throw new Error('work_tree_fresh_agent_key_required')
  if (input.projectId.trim().length === 0) throw new Error('work_tree_fresh_project_required')
  const cwd = input.cwd ?? process.cwd()
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    AE_T51_FRESH_BASE_URL: input.baseUrl.href,
    AE_T51_FRESH_PROJECT_ID: input.projectId,
    AE_T51_FRESH_AGENT_KEY: input.agentApiKey,
    ...(input.bypassSecret === undefined ? {} : { AE_T51_FRESH_BYPASS_SECRET: input.bypassSecret }),
  }
  const tsx = resolve(cwd, 'node_modules/.bin/tsx')
  const script = resolve(cwd, 'tools/release/work-tree-parity-readback.ts')
  let stdout: string
  try {
    const result = await execFileAsync(tsx, [script], {
      cwd,
      env: childEnv,
      timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    })
    stdout = result.stdout
  } catch (error) {
    throw new Error('work_tree_fresh_agent_process_failed', { cause: error })
  }
  const value = parseChildOutput(stdout)
  const secrets = workTreeParityCredentialSecrets([input.agentApiKey, input.bypassSecret])
  const sanitized = sanitizeWorkTreeParityEvidence(value, secrets)
  if (!isRecord(sanitized) || sanitized.classification === undefined) {
    throw new Error('work_tree_fresh_agent_readback_invalid')
  }
  return sanitized as FreshAgentReadback
}

/** Child entrypoint. A missing deployment or credential fails the process rather
 * than returning a fixture result. */
export async function readFreshAgentReadbackFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<FreshAgentReadback> {
  const baseUrl = requiredUrl(env.AE_T51_FRESH_BASE_URL)
  const projectId = required(env.AE_T51_FRESH_PROJECT_ID, 'AE_T51_FRESH_PROJECT_ID')
  const agentApiKey = required(env.AE_T51_FRESH_AGENT_KEY, 'AE_T51_FRESH_AGENT_KEY')
  const bypassSecret = optional(env.AE_T51_FRESH_BYPASS_SECRET)
  const client = createWorkTreeAgentClient({ baseUrl, agentApiKey, fetchImpl, ...(bypassSecret === undefined ? {} : { bypassSecret }) })
  const result = await client.inspect({ projectId })
  const sanitized = sanitizeWorkTreeParityEvidence(result, workTreeParityCredentialSecrets([agentApiKey, bypassSecret]))
  return {
    classification: { process: 'fresh-child-process', client: 'fresh-agent-key', context: 'new-node-process' },
    operation: 'inspect',
    status: result.status,
    ok: result.ok,
    body: isRecord(sanitized) && 'body' in sanitized ? sanitized.body : sanitized,
  }
}

function parseChildOutput(value: string): unknown {
  const output = value.trim()
  if (output.length === 0 || Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new Error('work_tree_fresh_agent_output_invalid')
  }
  try {
    return JSON.parse(output) as unknown
  } catch {
    throw new Error('work_tree_fresh_agent_output_invalid')
  }
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim()
  if (result === undefined || result.length === 0) throw new Error(`${name}_required`)
  return result
}

function optional(value: string | undefined): string | undefined {
  const result = value?.trim()
  return result === undefined || result.length === 0 ? undefined : result
}

function requiredUrl(value: string | undefined): URL {
  const raw = required(value, 'AE_T51_FRESH_BASE_URL')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('AE_T51_FRESH_BASE_URL_invalid')
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('AE_T51_FRESH_BASE_URL_invalid')
  }
  return parsed
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  await readFreshAgentReadbackFromEnvironment().then((value) => {
    process.stdout.write(`${JSON.stringify(value)}\n`)
  }).catch((error: unknown) => {
    process.stderr.write(error instanceof Error ? `FAIL ${error.message}\n` : 'FAIL work_tree_fresh_agent_unknown\n')
    process.exitCode = 1
  })
}
