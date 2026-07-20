import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const OBSERVER_PATH = 'tools/release/observe-vercel-git-source-deployment.ts'
const SOURCE_REVISION = 'a'.repeat(40)
const CREATED_AT = 1_753_056_000_000
const CONFIG = Object.freeze({
  apiToken: 'vercel-secret-token',
  teamId: 'team_exact',
  projectId: 'prj_exact',
  sourceRevision: SOURCE_REVISION,
  pollIntervalMs: 1,
  timeoutMs: 3,
})

type ObserverConfig = typeof CONFIG
type ObserverResult = Readonly<{
  deploymentId: string
  deploymentUrl: string
  sourceRevision: string
  createdAt: number
}>
type ObserverDependencies = Readonly<{
  fetch: typeof fetch
  wait: (durationMs: number) => Promise<void>
}>
type Observer = (
  config: ObserverConfig,
  dependencies: ObserverDependencies,
) => Promise<ObserverResult>
type FetchCall = Readonly<{
  url: URL
  method: string
  authorization: string | null
}>

describe('Vercel Git source deployment observer', () => {
  it('returns only the one exact READY production deployment through GET requests', async () => {
    const observe = await loadObserver()
    const calls: FetchCall[] = []
    const result = await observe(CONFIG, {
      fetch: queuedFetch([
        { deployments: [listDeployment()] },
        detailDeployment(),
      ], calls),
      wait: async () => undefined,
    })

    expect(result).toEqual({
      deploymentId: 'dpl_exact',
      deploymentUrl: 'https://agentic-economy-exact.vercel.app',
      sourceRevision: SOURCE_REVISION,
      createdAt: CREATED_AT,
    })
    expect(Object.keys(result).sort()).toEqual([
      'createdAt',
      'deploymentId',
      'deploymentUrl',
      'sourceRevision',
    ])
    expect(calls.map((call) => call.method)).toEqual(['GET', 'GET'])
    expect(calls.every((call) => call.authorization === 'Bearer vercel-secret-token'))
      .toBe(true)
    expect(calls[0]!.url.pathname).toBe('/v6/deployments')
    expect(calls[0]!.url.searchParams.get('projectId')).toBe('prj_exact')
    expect(calls[0]!.url.searchParams.get('teamId')).toBe('team_exact')
    expect(calls[0]!.url.searchParams.get('target')).toBe('production')
    expect(calls[0]!.url.searchParams.get('meta-githubCommitSha'))
      .toBe(SOURCE_REVISION)
    expect(calls[1]!.url.pathname).toBe('/v13/deployments/dpl_exact')
    expect(calls[1]!.url.searchParams.get('teamId')).toBe('team_exact')
    expect(JSON.stringify(result)).not.toContain(CONFIG.apiToken)
  })

  it('times out when no exact deployment appears', async () => {
    const observe = await loadObserver()
    const waits: number[] = []
    const calls: FetchCall[] = []
    const fetch = repeatingFetch({ deployments: [] }, calls)

    await expect(observe(CONFIG, {
      fetch,
      wait: async (durationMs) => { waits.push(durationMs) },
    })).rejects.toThrow('vercel_deployment_timeout')
    expect(waits.length).toBeGreaterThan(0)
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
  })

  it('refuses more than one exact deployment', async () => {
    const observe = await loadObserver()
    const calls: FetchCall[] = []
    await expect(observe(CONFIG, {
      fetch: queuedFetch([{
        deployments: [
          listDeployment(),
          listDeployment({ uid: 'dpl_duplicate', url: 'duplicate.vercel.app' }),
        ],
      }], calls),
      wait: async () => undefined,
    })).rejects.toThrow('vercel_deployment_duplicate')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('GET')
  })

  it.each(['ERROR', 'CANCELED'] as const)(
    'refuses a terminal %s deployment',
    async (readyState) => {
      const observe = await loadObserver()
      await expect(observe(CONFIG, {
        fetch: queuedFetch([
          { deployments: [listDeployment({ readyState, state: readyState })] },
          detailDeployment({ readyState }),
        ], []),
        wait: async () => undefined,
      })).rejects.toThrow('vercel_deployment_terminal')
    },
  )

  it.each([
    ['source SHA', { meta: { githubCommitSha: 'b'.repeat(40) } }],
    ['Git ref', { meta: { githubCommitRef: 'codex/not-main' } }],
    ['repository', { meta: { githubCommitOrg: 'Other', githubCommitRepo: 'Repository' } }],
    ['project id', { projectId: 'prj_other' }],
    ['project name', { name: 'other-project' }],
    ['target', { target: 'preview' }],
    ['production alias', { alias: ['other.vercel.app'] }],
  ] as const)('refuses %s mismatch', async (_label, override) => {
    const observe = await loadObserver()
    await expect(observe(CONFIG, {
      fetch: queuedFetch([
        { deployments: [listDeployment()] },
        detailDeployment(override),
      ], []),
      wait: async () => undefined,
    })).rejects.toThrow('vercel_deployment_identity_mismatch')
  })

  it('fails closed on invalid configuration without issuing a request', async () => {
    const observe = await loadObserver()
    const calls: FetchCall[] = []
    await expect(observe({ ...CONFIG, sourceRevision: 'not-a-sha' }, {
      fetch: repeatingFetch({ deployments: [] }, calls),
      wait: async () => undefined,
    })).rejects.toThrow('vercel_observer_config_invalid')
    expect(calls).toEqual([])
  })

  it('does not expose the token or provider response body in failure output', async () => {
    const observe = await loadObserver()
    const responseSecret = 'provider-response-secret'
    let caught: unknown
    try {
      await observe(CONFIG, {
        fetch: (async () => Response.json({ responseSecret }, { status: 500 })) as typeof fetch,
        wait: async () => undefined,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).toContain('vercel_list_request_failed')
    expect(String(caught)).not.toContain(CONFIG.apiToken)
    expect(String(caught)).not.toContain(responseSecret)
  })
})

async function loadObserver(): Promise<Observer> {
  if (!existsSync(OBSERVER_PATH)) {
    throw new Error('[P3C_RED:vercel_observer_absent]')
  }
  const moduleUrl = pathToFileURL(resolve(OBSERVER_PATH)).href
  const loaded: unknown = await import(/* @vite-ignore */ moduleUrl)
  const observer = (loaded as { observeVercelGitSourceDeployment?: unknown })
    .observeVercelGitSourceDeployment
  if (typeof observer !== 'function') {
    throw new Error('[P3C_RED:vercel_observer_export_absent]')
  }
  return observer as Observer
}

function listDeployment(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'dpl_exact',
    name: 'agentic-economy',
    projectId: 'prj_exact',
    url: 'agentic-economy-exact.vercel.app',
    created: CREATED_AT,
    state: 'READY',
    readyState: 'READY',
    target: 'production',
    meta: repositoryMeta(),
    ...overrides,
  }
}

function detailDeployment(overrides: Record<string, unknown> = {}) {
  const overrideMeta = isRecord(overrides.meta) ? overrides.meta : undefined
  return {
    id: 'dpl_exact',
    name: 'agentic-economy',
    projectId: 'prj_exact',
    url: 'agentic-economy-exact.vercel.app',
    createdAt: CREATED_AT,
    readyState: 'READY',
    target: 'production',
    alias: ['agentic-economy-phi.vercel.app'],
    meta: { ...repositoryMeta(), ...overrideMeta },
    ...overrides,
    ...(overrideMeta === undefined ? {} : {
      meta: { ...repositoryMeta(), ...overrideMeta },
    }),
  }
}

function repositoryMeta() {
  return {
    githubCommitSha: SOURCE_REVISION,
    githubCommitRef: 'main',
    githubCommitOrg: 'CreasyBear',
    githubCommitRepo: 'Agentic-Economy',
  }
}

function queuedFetch(
  payloads: readonly unknown[],
  calls: FetchCall[],
): typeof fetch {
  const queue = [...payloads]
  return (async (input, init) => {
    recordFetch(input, init, calls)
    const payload = queue.shift()
    if (payload === undefined) {
      return Response.json({ unexpected: 'request' }, { status: 500 })
    }
    return Response.json(payload)
  }) as typeof fetch
}

function repeatingFetch(payload: unknown, calls: FetchCall[]): typeof fetch {
  return (async (input, init) => {
    recordFetch(input, init, calls)
    return Response.json(payload)
  }) as typeof fetch
}

function recordFetch(
  input: string | URL | Request,
  init: RequestInit | undefined,
  calls: FetchCall[],
): void {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  )
  const headers = new Headers(init?.headers)
  calls.push({
    url,
    method: init?.method ?? 'GET',
    authorization: headers.get('authorization'),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
