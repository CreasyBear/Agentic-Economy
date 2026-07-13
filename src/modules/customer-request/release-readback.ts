import { z } from 'zod'

import { CUSTOMER_REQUEST_AGENT_ENTRYPOINT } from '@/modules/customer-request/agent-contract'

const RELEASE_SCHEMA_VERSION = 'ae.customer-request-release:v1' as const
const SOURCE_REPOSITORY = 'CreasyBear/Agentic-Economy' as const
const EVIDENCE_INPUTS = Object.freeze([
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_TARGET_ENV',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_GIT_PROVIDER',
  'VERCEL_GIT_REPO_OWNER',
  'VERCEL_GIT_REPO_SLUG',
  'VERCEL_GIT_COMMIT_SHA',
] as const)

const gitRevision = /^[a-f0-9]{40}$/
const deploymentId = /^dpl_[A-Za-z0-9]+$/
const vercelHostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const customerRequestReleaseReadbackSchema = z.object({
  kind: z.literal('release_readback'),
  schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
  source: z.object({
    provider: z.literal('github'),
    repository: z.literal(SOURCE_REPOSITORY),
    revision: z.string().regex(gitRevision),
  }).strict(),
  deployment: z.object({
    provider: z.literal('vercel'),
    id: z.string().regex(deploymentId),
    environment: z.literal('production'),
    targetEnvironment: z.literal('production'),
    url: z.url().startsWith('https://'),
    productionUrl: z.url().startsWith('https://'),
  }).strict(),
  requestEntrypoint: z.object({
    contract: z.literal(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.contract),
    method: z.literal(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method),
    path: z.literal(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path),
    authentication: z.literal(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication),
    requiredScope: z.literal(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope),
  }).strict(),
  evidence: z.object({
    observedAt: z.iso.datetime(),
    inputs: z.tuple([
      z.literal('VERCEL'),
      z.literal('VERCEL_ENV'),
      z.literal('VERCEL_TARGET_ENV'),
      z.literal('VERCEL_DEPLOYMENT_ID'),
      z.literal('VERCEL_URL'),
      z.literal('VERCEL_PROJECT_PRODUCTION_URL'),
      z.literal('VERCEL_GIT_PROVIDER'),
      z.literal('VERCEL_GIT_REPO_OWNER'),
      z.literal('VERCEL_GIT_REPO_SLUG'),
      z.literal('VERCEL_GIT_COMMIT_SHA'),
    ]),
    sandbox: z.object({
      involved: z.literal(false),
      reason: z.literal('release readback does not discover or execute supply'),
    }).strict(),
  }).strict(),
}).strict()

export type CustomerRequestReleaseReadback = Readonly<{
  kind: 'release_readback'
  schemaVersion: typeof RELEASE_SCHEMA_VERSION
  source: Readonly<{
    provider: 'github'
    repository: typeof SOURCE_REPOSITORY
    revision: string
  }>
  deployment: Readonly<{
    provider: 'vercel'
    id: string
    environment: 'production'
    targetEnvironment: 'production'
    url: string
    productionUrl: string
  }>
  requestEntrypoint: typeof CUSTOMER_REQUEST_AGENT_ENTRYPOINT
  evidence: Readonly<{
    observedAt: string
    inputs: typeof EVIDENCE_INPUTS
    sandbox: Readonly<{
      involved: false
      reason: 'release readback does not discover or execute supply'
    }>
  }>
}>

export type CustomerRequestReleaseResult = CustomerRequestReleaseReadback | Readonly<{
  kind: 'unavailable'
  reason: 'authoritative_release_identity_unavailable'
}>

export function parseCustomerRequestReleaseReadback(input: unknown): CustomerRequestReleaseReadback {
  return customerRequestReleaseReadbackSchema.parse(input)
}

export function readCustomerRequestRelease(options: Readonly<{
  env: Record<string, string | undefined>
  observedAt?: () => number
}>): CustomerRequestReleaseResult {
  const env = options.env
  const revision = env.VERCEL_GIT_COMMIT_SHA?.trim()
  const id = env.VERCEL_DEPLOYMENT_ID?.trim()
  const url = env.VERCEL_URL?.trim()
  const productionUrl = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (
    env.VERCEL !== '1'
    || env.VERCEL_ENV !== 'production'
    || env.VERCEL_TARGET_ENV !== 'production'
    || env.VERCEL_GIT_PROVIDER !== 'github'
    || `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` !== SOURCE_REPOSITORY
    || revision === undefined
    || !gitRevision.test(revision)
    || id === undefined
    || !deploymentId.test(id)
    || url === undefined
    || !vercelHostname.test(url)
    || productionUrl === undefined
    || !vercelHostname.test(productionUrl)
  ) return unavailable()

  const observedAt = new Date((options.observedAt ?? Date.now)()).toISOString()
  return Object.freeze({
    kind: 'release_readback',
    schemaVersion: RELEASE_SCHEMA_VERSION,
    source: Object.freeze({ provider: 'github', repository: SOURCE_REPOSITORY, revision }),
    deployment: Object.freeze({
      provider: 'vercel',
      id,
      environment: 'production',
      targetEnvironment: 'production',
      url: `https://${url}`,
      productionUrl: `https://${productionUrl}`,
    }),
    requestEntrypoint: CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
    evidence: Object.freeze({
      observedAt,
      inputs: EVIDENCE_INPUTS,
      sandbox: Object.freeze({
        involved: false,
        reason: 'release readback does not discover or execute supply',
      }),
    }),
  })
}

export function verifyCustomerRequestHostedRevision(options: Readonly<{
  expectedRevision: string
  readback: CustomerRequestReleaseReadback
}>): Readonly<{ kind: 'verified'; revision: string; deploymentId: string }> {
  if (!gitRevision.test(options.expectedRevision) || options.readback.source.revision !== options.expectedRevision) {
    throw new Error('hosted_release_revision_mismatch')
  }
  if (
    options.readback.schemaVersion !== RELEASE_SCHEMA_VERSION
    || options.readback.source.provider !== 'github'
    || options.readback.source.repository !== SOURCE_REPOSITORY
    || options.readback.deployment.provider !== 'vercel'
    || options.readback.deployment.environment !== 'production'
    || options.readback.deployment.targetEnvironment !== 'production'
    || options.readback.requestEntrypoint.contract !== CUSTOMER_REQUEST_AGENT_ENTRYPOINT.contract
    || options.readback.requestEntrypoint.method !== CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method
    || options.readback.requestEntrypoint.path !== CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path
    || options.readback.requestEntrypoint.authentication !== CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication
    || options.readback.requestEntrypoint.requiredScope !== CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope
  ) throw new Error('hosted_release_entrypoint_mismatch')

  return Object.freeze({
    kind: 'verified',
    revision: options.readback.source.revision,
    deploymentId: options.readback.deployment.id,
  })
}

function unavailable(): CustomerRequestReleaseResult {
  return Object.freeze({ kind: 'unavailable', reason: 'authoritative_release_identity_unavailable' })
}
