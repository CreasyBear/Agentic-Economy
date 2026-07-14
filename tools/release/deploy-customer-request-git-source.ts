import { z } from 'zod'
import { pathToFileURL } from 'node:url'

const PROJECT_NAME = 'agentic-economy' as const
const GITHUB_REPOSITORY_ID = 1_283_024_672 as const
const PRODUCTION_REF = 'main' as const
const gitRevision = /^[a-f0-9]{40}$/
const deploymentSchema = z.looseObject({
  id: z.string().startsWith('dpl_'),
  url: z.string().min(1),
  readyState: z.enum(['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED']),
  createdAt: z.number().int().nonnegative(),
  gitSource: z.looseObject({
    type: z.literal('github'),
    repoId: z.literal(GITHUB_REPOSITORY_ID),
    ref: z.literal(PRODUCTION_REF),
    sha: z.string().regex(gitRevision),
  }),
})

type DeployOptions = Readonly<{
  token: string
  teamId: string
  projectId: string
  sourceRevision: string
  fetchImpl?: typeof fetch
  wait?: (milliseconds: number) => Promise<void>
  maxPolls?: number
}>

export async function deployCustomerRequestGitSource(options: DeployOptions): Promise<Readonly<{
  kind: 'deployed'
  deploymentId: string
  deploymentUrl: string
  sourceRevision: string
  createdAt: string
}>> {
  assertConfigured(options)
  const fetchImpl = options.fetchImpl ?? fetch
  const requestHeaders = {
    Authorization: `Bearer ${options.token}`,
    'Content-Type': 'application/json',
  }
  const createUrl = new URL('https://api.vercel.com/v13/deployments')
  createUrl.searchParams.set('teamId', options.teamId)
  createUrl.searchParams.set('forceNew', '1')
  const created = await readDeployment(await fetchImpl(createUrl, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      name: PROJECT_NAME,
      project: options.projectId,
      target: 'production',
      gitSource: {
        type: 'github',
        repoId: GITHUB_REPOSITORY_ID,
        ref: PRODUCTION_REF,
        sha: options.sourceRevision,
      },
    }),
  }), 'vercel_git_source_deployment_creation_failed')
  assertSourceRevision(created.gitSource.sha, options.sourceRevision)

  let deployment = created
  for (let poll = 0; deployment.readyState !== 'READY'; poll += 1) {
    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      throw new Error(`vercel_git_source_deployment_failed:${deployment.readyState}`)
    }
    if (poll >= (options.maxPolls ?? 180)) throw new Error('vercel_git_source_deployment_timeout')
    await (options.wait ?? wait)(5_000)
    const readUrl = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(created.id)}`)
    readUrl.searchParams.set('teamId', options.teamId)
    deployment = await readDeployment(await fetchImpl(readUrl, { headers: requestHeaders }), 'vercel_git_source_deployment_read_failed')
    assertSourceRevision(deployment.gitSource.sha, options.sourceRevision)
  }

  return Object.freeze({
    kind: 'deployed',
    deploymentId: deployment.id,
    deploymentUrl: `https://${deployment.url}`,
    sourceRevision: deployment.gitSource.sha,
    createdAt: new Date(deployment.createdAt).toISOString(),
  })
}

async function readDeployment(response: Response, errorCode: string): Promise<z.infer<typeof deploymentSchema>> {
  if (!response.ok) throw new Error(`${errorCode}:${response.status}`)
  return deploymentSchema.parse(await response.json())
}

function assertConfigured(options: DeployOptions): void {
  if (!options.token.trim()) throw new Error('VERCEL_TOKEN_required')
  if (!/^team_[A-Za-z0-9]+$/.test(options.teamId)) throw new Error('VERCEL_ORG_ID_invalid')
  if (!/^prj_[A-Za-z0-9]+$/.test(options.projectId)) throw new Error('VERCEL_PROJECT_ID_invalid')
  if (!gitRevision.test(options.sourceRevision)) throw new Error('AE_RELEASE_SOURCE_REVISION_invalid')
}

function assertSourceRevision(actual: string, expected: string): void {
  if (actual !== expected) throw new Error('vercel_git_source_revision_mismatch')
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function main(env: Record<string, string | undefined> = process.env): Promise<void> {
  const result = await deployCustomerRequestGitSource({
    token: env.VERCEL_TOKEN ?? '',
    teamId: env.VERCEL_ORG_ID ?? '',
    projectId: env.VERCEL_PROJECT_ID ?? '',
    sourceRevision: env.AE_RELEASE_SOURCE_REVISION ?? '',
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) await main()
