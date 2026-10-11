import { SiteDiscoveryManifestSchemaVersion } from '@/modules/discovery/site-manifest-version'
import { isRecord } from '@/modules/common/is-record'
import { listMcpActions, mcpToolName } from '@/modules/actions'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CliOptions } from '../../lib/args'
import { isLoopbackCliBaseUrl, safeOriginForDiagnostics } from '../../lib/args'
import { continuationCommand } from '../../lib/continuation-command'
import { callJson } from '../../lib/output'
import type { DoctorCheckDraft } from './shared'

const MCP_CHECK_TIMEOUT_MS = 5_000
const CATALOGUE_STATUS_PATH = '/api/v1/catalogue-status'
const LOCAL_DEV_COMMAND = continuationCommand(['npm', 'run', 'dev:local'])

export async function checkServer(options: CliOptions): Promise<DoctorCheckDraft> {
  const { baseUrl } = options
  try {
    const outcome = await callJson(baseUrl, '/.well-known/ucp')
    if (!outcome.ok || !isRecord(outcome.body)) {
      return serverFailure(options, 'AE server did not return its discovery manifest.')
    }
    if (outcome.body.schemaVersion !== SiteDiscoveryManifestSchemaVersion) {
      return serverFailure(options, 'AE server manifest is not compatible with this CLI.')
    }
    if (outcome.body.origin !== new URL(baseUrl).origin) {
      return serverFailure(options, 'AE server manifest origin does not match the configured origin.')
    }
    return {
      id: 'server', state: 'pass',
      summary: `AE server is reachable and manifest ${SiteDiscoveryManifestSchemaVersion} is compatible.`,
    }
  } catch {
    return serverUnreachableFailure(options)
  }
}

/**
 * A loopback origin that refuses the connection has nothing to point `ae
 * config` or the hosted fallback at: the operator's own local stack is the
 * fix, so this names the probed URL and starts it instead of routing away
 * from the box the operator is actually sitting at.
 */
function serverUnreachableFailure(options: CliOptions): DoctorCheckDraft {
  const { baseUrl } = options
  if (!isLoopbackCliBaseUrl(baseUrl)) return serverFailure(options, 'AE server is not reachable.')
  const safeOrigin = safeOriginForDiagnostics(baseUrl)
  return {
    id: 'server', state: 'fail',
    summary: `AE server is not reachable: nothing is listening at ${safeOrigin}; start the local stack or fix --base-url.`,
    nextCommand: LOCAL_DEV_COMMAND,
  }
}

export async function checkMcp(baseUrl: string): Promise<DoctorCheckDraft> {
  const expected = listMcpActions()
    .filter((action) => action.readOnly && action.credentialAdmission === undefined)
    .map(mcpToolName)
    .sort()
  const client = new Client({ name: 'ae-doctor', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), {
    requestInit: { signal: AbortSignal.timeout(MCP_CHECK_TIMEOUT_MS) },
  })
  try {
    // SDK 1.30.0's declarations disagree only on the optional sessionId spelling.
    await client.connect(transport as unknown as Parameters<Client['connect']>[0])
    const actual = (await client.listTools()).tools.map(({ name }) => name).sort()
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
      return {
        id: 'mcp', state: 'fail',
        summary: 'MCP initialized, but its public tool set does not match this CLI.',
      }
    }
    return {
      id: 'mcp', state: 'pass',
      summary: `MCP initialization and ${actual.length} public tools passed.`,
    }
  } catch {
    return {
      id: 'mcp', state: 'fail',
      summary: 'MCP initialization or public tool discovery failed.',
    }
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function checkDeployment(baseUrl: string): Promise<readonly DoctorCheckDraft[]> {
  return await Promise.all([
    checkToolalReadiness(baseUrl),
    checkReleaseIdentity(baseUrl),
    checkCatalogue(baseUrl),
  ])
}

const CATALOGUE_CHECK_STATES: Readonly<Record<string, DoctorCheckDraft>> = {
  fresh: { id: 'catalogue', state: 'pass', summary: 'Market catalogue coverage is fresh.' },
  stale: { id: 'catalogue', state: 'warn', summary: 'Market catalogue coverage is stale.', code: 'catalogue_stale' },
  failed: { id: 'catalogue', state: 'fail', summary: 'Market catalogue refresh failed.', code: 'catalogue_refresh_failed' },
  absent: { id: 'catalogue', state: 'warn', summary: 'Market catalogue coverage is absent.', code: 'catalogue_absent' },
}
const CATALOGUE_UNREADABLE: DoctorCheckDraft = {
  id: 'catalogue', state: 'warn', summary: 'Market catalogue coverage could not be read.', code: 'catalogue_unreadable',
}

async function checkCatalogue(baseUrl: string): Promise<DoctorCheckDraft> {
  try {
    const outcome = await callJson(baseUrl, CATALOGUE_STATUS_PATH)
    const status = isRecord(outcome.body) && typeof outcome.body.status === 'string' ? outcome.body.status : ''
    return (outcome.ok ? CATALOGUE_CHECK_STATES[status] : undefined) ?? CATALOGUE_UNREADABLE
  } catch {
    return CATALOGUE_UNREADABLE
  }
}

async function checkToolalReadiness(baseUrl: string): Promise<DoctorCheckDraft> {
  try {
    const outcome = await callJson(baseUrl, '/api/ready')
    if (outcome.ok && isRecord(outcome.body) && outcome.body.status === 'ready') {
      return {
        id: 'readiness', state: 'pass',
        summary: 'Server operational readiness passed.',
      }
    }
    const code = readinessFailureCode(outcome.body)
    return {
      id: 'readiness', state: 'fail',
      summary: code === undefined
        ? 'Server is reachable but operational readiness failed. The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.'
        : `Server is reachable but operational readiness failed (${code}). The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.`,
    }
  } catch {
    return {
      id: 'readiness', state: 'fail',
      summary: 'Server manifest was reachable, but operational readiness could not be checked. The service operator must restore the readiness check before calls proceed; the caller should not continue or retry.',
    }
  }
}

function readinessFailureCode(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  if (isRecord(body.checks)) {
    for (const check of Object.values(body.checks)) {
      if (isRecord(check) && safeDiagnosticCode(check.code) !== undefined) {
        return safeDiagnosticCode(check.code)
      }
    }
  }
  return safeDiagnosticCode(body.code)
}

function safeDiagnosticCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(value)
    ? value
    : undefined
}

async function checkReleaseIdentity(baseUrl: string): Promise<DoctorCheckDraft> {
  try {
    const outcome = await callJson(baseUrl, '/api/v1/release')
    if (
      outcome.ok
      && isRecord(outcome.body)
      && outcome.body.kind === 'ok'
      && typeof outcome.body.sourceRevision === 'string'
      && /^[a-f0-9]{40}$/u.test(outcome.body.sourceRevision)
    ) {
      return {
        id: 'release', state: 'pass',
        summary: `Release identity is ${outcome.body.sourceRevision}.`,
      }
    }
    const reason = isRecord(outcome.body) ? safeDiagnosticCode(outcome.body.reason) : undefined
    return {
      id: 'release', state: 'fail',
      summary: reason === undefined
        ? 'Release identity is unavailable. The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.'
        : `Release identity is unavailable (${reason}). The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.`,
    }
  } catch {
    return {
      id: 'release', state: 'fail',
      summary: 'Release identity could not be checked. The service operator must restore the release identity check before calls proceed; the caller should not continue or retry.',
    }
  }
}

function serverFailure(options: CliOptions, summary: string): DoctorCheckDraft {
  const safeOrigin = safeOriginForDiagnostics(options.baseUrl)
  return {
    id: 'server', state: 'fail', summary,
    nextCommand: isLoopbackCliBaseUrl(options.baseUrl)
      ? LOCAL_DEV_COMMAND
      : continuationCommand(['ae', 'status', '--base-url', safeOrigin, '--json']),
  }
}

