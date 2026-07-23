import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { PHASE3C_PRODUCTION_ALIAS } from './paid-operation-hosted-proof-contract'

const VERCEL_API_ORIGIN = 'https://api.vercel.com'
const EXPECTED_PROJECT_NAME = 'agentic-economy'
const EXPECTED_REPOSITORY_ORG = 'CreasyBear'
const EXPECTED_REPOSITORY_NAME = 'Agentic-Economy'
const EXPECTED_GIT_REF = 'main'
const EXPECTED_TARGET = 'production'
const DEFAULT_POLL_INTERVAL_MS = 10_000
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1_000

export type ObserveVercelGitSourceDeploymentConfig = Readonly<{
  apiToken: string
  teamId: string
  projectId: string
  sourceRevision: string
  pollIntervalMs?: number
  timeoutMs?: number
}>

export type ObservedVercelGitSourceDeployment = Readonly<{
  deploymentId: string
  deploymentUrl: string
  sourceRevision: string
  createdAt: number
}>

export type VercelGitSourceDeploymentObserverDependencies = Readonly<{
  fetch: typeof fetch
  wait: (durationMs: number) => Promise<void>
}>

type JsonRecord = Record<string, unknown>

export async function observeVercelGitSourceDeployment(
  config: ObserveVercelGitSourceDeploymentConfig,
  dependencies: VercelGitSourceDeploymentObserverDependencies = {
    fetch: globalThis.fetch,
    wait: async (durationMs) => await new Promise((resolveWait) => {
      setTimeout(resolveWait, durationMs)
    }),
  },
): Promise<ObservedVercelGitSourceDeployment> {
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  validateConfig(config, pollIntervalMs, timeoutMs)

  const listUrl = new URL('/v6/deployments', VERCEL_API_ORIGIN)
  listUrl.searchParams.set('projectId', config.projectId)
  listUrl.searchParams.set('teamId', config.teamId)
  listUrl.searchParams.set('target', EXPECTED_TARGET)
  listUrl.searchParams.set('meta-githubCommitSha', config.sourceRevision)
  listUrl.searchParams.set('limit', '10')
  const maximumAttempts = Math.ceil(timeoutMs / pollIntervalMs) + 1

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const listPayload = await getJson(
      dependencies.fetch,
      listUrl,
      config.apiToken,
      'vercel_list_request_failed',
    )
    const deployments = deploymentList(listPayload)
    if (deployments.length > 1) fail('vercel_deployment_duplicate')

    const listed = deployments[0]
    if (listed !== undefined) {
      const listedIdentity = validateListedDeployment(listed, config)
      const detailUrl = new URL(
        `/v13/deployments/${encodeURIComponent(listedIdentity.id)}`,
        VERCEL_API_ORIGIN,
      )
      detailUrl.searchParams.set('teamId', config.teamId)
      const detailPayload = await getJson(
        dependencies.fetch,
        detailUrl,
        config.apiToken,
        'vercel_detail_request_failed',
      )
      const detail = validateDetailedDeployment(
        detailPayload,
        listedIdentity,
        config,
      )
      if (detail.readyState === 'ERROR' || detail.readyState === 'CANCELED') {
        fail('vercel_deployment_terminal')
      }
      if (detail.readyState === 'READY') {
        const canonicalAliasUrl = new URL(
          `/v13/deployments/${encodeURIComponent(PHASE3C_PRODUCTION_ALIAS)}`,
          VERCEL_API_ORIGIN,
        )
        canonicalAliasUrl.searchParams.set('teamId', config.teamId)
        const canonicalAliasPayload = await getJson(
          dependencies.fetch,
          canonicalAliasUrl,
          config.apiToken,
          'vercel_alias_request_failed',
        )
        validateCanonicalAliasDeployment(
          canonicalAliasPayload,
          detail,
          config,
        )
        return Object.freeze({
          deploymentId: detail.id,
          deploymentUrl: `https://${detail.url}`,
          sourceRevision: config.sourceRevision,
          createdAt: detail.createdAt,
        })
      }
      if (!['QUEUED', 'BUILDING', 'INITIALIZING'].includes(detail.readyState)) {
        fail('vercel_deployment_state_invalid')
      }
    }

    if (attempt === maximumAttempts - 1) break
    await dependencies.wait(pollIntervalMs)
  }
  fail('vercel_deployment_timeout')
}

function validateConfig(
  config: ObserveVercelGitSourceDeploymentConfig,
  pollIntervalMs: number,
  timeoutMs: number,
): void {
  if (!boundedIdentifier(config.apiToken)
    || !boundedIdentifier(config.teamId)
    || !boundedIdentifier(config.projectId)
    || !/^[0-9a-f]{40}$/u.test(config.sourceRevision)
    || !Number.isSafeInteger(pollIntervalMs)
    || pollIntervalMs < 1
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < pollIntervalMs) {
    fail('vercel_observer_config_invalid')
  }
}

async function getJson(
  fetchImplementation: typeof fetch,
  url: URL,
  apiToken: string,
  failureCode: string,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImplementation(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiToken}`,
      },
    })
  } catch {
    fail(failureCode)
  }
  if (!response.ok) fail(failureCode)
  try {
    return await response.json()
  } catch {
    fail(failureCode)
  }
}

function deploymentList(payload: unknown): readonly JsonRecord[] {
  if (!isRecord(payload)
    || !Array.isArray(payload.deployments)
    || !payload.deployments.every(isRecord)) {
    fail('vercel_list_response_invalid')
  }
  return payload.deployments
}

function validateListedDeployment(
  deployment: JsonRecord,
  config: ObserveVercelGitSourceDeploymentConfig,
): Readonly<{ id: string; url: string; createdAt: number }> {
  const id = stringValue(deployment.uid)
  const url = stringValue(deployment.url)
  const createdAt = integerValue(deployment.created)
  if (id === undefined
    || !validDeploymentHost(url)
    || createdAt === undefined
    || deployment.name !== EXPECTED_PROJECT_NAME
    || deployment.projectId !== config.projectId
    || deployment.target !== EXPECTED_TARGET
    || !exactRepositoryMetadata(deployment.meta, config.sourceRevision)) {
    fail('vercel_deployment_identity_mismatch')
  }
  return { id, url, createdAt }
}

function validateDetailedDeployment(
  deployment: unknown,
  listed: Readonly<{ id: string; url: string; createdAt: number }>,
  config: ObserveVercelGitSourceDeploymentConfig,
): Readonly<{
  id: string
  url: string
  createdAt: number
  readyState: string
}> {
  if (!isRecord(deployment)) fail('vercel_detail_response_invalid')
  const id = stringValue(deployment.id)
  const url = stringValue(deployment.url)
  const createdAt = integerValue(deployment.createdAt)
  const readyState = stringValue(deployment.readyState)
  if (id !== listed.id
    || url !== listed.url
    || createdAt !== listed.createdAt
    || readyState === undefined
    || deployment.name !== EXPECTED_PROJECT_NAME
    || deployment.projectId !== config.projectId
    || deployment.target !== EXPECTED_TARGET
    || !validDeploymentHost(url)
    || !exactRepositoryMetadata(deployment.meta, config.sourceRevision)) {
    fail('vercel_deployment_identity_mismatch')
  }
  return { id, url, createdAt, readyState }
}

function validateCanonicalAliasDeployment(
  deployment: unknown,
  expected: Readonly<{
    id: string
    url: string
    createdAt: number
    readyState: string
  }>,
  config: ObserveVercelGitSourceDeploymentConfig,
): void {
  if (!isRecord(deployment)) fail('vercel_alias_response_invalid')
  if (deployment.id !== expected.id
    || deployment.url !== expected.url
    || deployment.createdAt !== expected.createdAt
    || deployment.readyState !== expected.readyState
    || deployment.name !== EXPECTED_PROJECT_NAME
    || deployment.projectId !== config.projectId
    || deployment.target !== EXPECTED_TARGET
    || !exactRepositoryMetadata(deployment.meta, config.sourceRevision)) {
    fail('vercel_deployment_identity_mismatch')
  }
}

function exactRepositoryMetadata(
  metadata: unknown,
  sourceRevision: string,
): boolean {
  return isRecord(metadata)
    && metadata.githubCommitSha === sourceRevision
    && metadata.githubCommitRef === EXPECTED_GIT_REF
    && metadata.githubCommitOrg === EXPECTED_REPOSITORY_ORG
    && metadata.githubCommitRepo === EXPECTED_REPOSITORY_NAME
}

function boundedIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0
    && value.length <= 512
    && !/[\r\n]/u.test(value)
}

function validDeploymentHost(value: string | undefined): value is string {
  return value !== undefined
    && value.length <= 253
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/u.test(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(code: string): never {
  throw new Error(code)
}

async function main(): Promise<void> {
  try {
    const observed = await observeVercelGitSourceDeployment({
      apiToken: process.env.VERCEL_TOKEN ?? '',
      teamId: process.env.VERCEL_ORG_ID ?? '',
      projectId: process.env.VERCEL_PROJECT_ID ?? '',
      sourceRevision: process.env.AE_RELEASE_SOURCE_REVISION ?? '',
    })
    process.stdout.write(`${JSON.stringify(observed)}\n`)
  } catch (error) {
    const message = error instanceof Error && /^[a-z_]+$/u.test(error.message)
      ? error.message
      : 'vercel_observation_failed'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

const entryPath = process.argv[1]
if (entryPath !== undefined
  && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  await main()
}
