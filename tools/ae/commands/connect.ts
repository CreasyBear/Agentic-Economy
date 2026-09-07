import {
  AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
  MARKET_SUPPLY_MANAGE_SCOPE,
} from '@/modules/agent-access/contract'
import {
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
  agentAccountSelfResultSchema,
  type AgentAccountSelfResult,
} from '@/modules/agent-access/account.actions'
import { isRecord } from '@/modules/common/is-record'
import { spawn } from 'node:child_process'
import { retry } from 'es-toolkit'

import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential, storeConnection } from '../lib/config'
import { continuationCommand } from '../lib/continuation-command'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { requireAgentAccessKey } from './status'

const OAUTH_REGISTER_PATH = '/oauth/register' as const
const OAUTH_DEVICE_AUTHORIZATION_PATH = '/oauth/device_authorization' as const
const OAUTH_TOKEN_PATH = '/oauth/token' as const
const DEVICE_GRANT_TYPE = AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.grant_types[0]
const MAX_CONNECT_WAIT_MS = 60_000
const MIN_POLL_DELAY_MS = 1_000
const MAX_POLL_DELAY_MS = 10_000
const DEFAULT_POLL_DELAY_MS = 5_000
const ISSUED_KEY_VALIDATION_RETRIES = 20
const ISSUED_KEY_VALIDATION_DELAY_MS = 250

type JsonRecord = Record<string, unknown>

type ConnectDetails = Readonly<{
  clientId: string
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  intervalMs: number
  provider: boolean
}>

function continuationFlags(options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource' | 'json'>): readonly string[] {
  return [
    ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
      ? []
      : ['--base-url', options.baseUrl]),
    ...(options.json ? ['--json'] : []),
  ]
}

function connectContinuation(
  options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource' | 'json'>,
  tokens: readonly (string | number | undefined)[],
): string {
  return continuationCommand([...tokens, ...continuationFlags(options)])
}

function oauthForm(values: Record<string, string>): { body: string; headers: HeadersInit } {
  const form = new URLSearchParams(values)
  return { body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
}

function textField(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CliFailure(`OAuth ${field} response field is missing.`, {
      kind: 'UNAVAILABLE',
      code: 'connect-response-invalid',
    })
  }
  return value.trim()
}

function positiveSeconds(value: unknown, field: string, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new CliFailure(`OAuth ${field} response field is invalid.`, {
      kind: 'UNAVAILABLE',
      code: 'connect-response-invalid',
    })
  }
  return value
}

function verificationUri(value: unknown): string {
  const uri = textField(value, 'verification_uri')
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw new CliFailure('OAuth verification_uri response field must be an absolute HTTP(S) URL with an authority.', {
      kind: 'UNAVAILABLE',
      code: 'connect-response-invalid',
    })
  }

  const protocol = parsed.protocol
  const hasWebAuthority = (protocol === 'http:' || protocol === 'https:')
    && uri.toLowerCase().startsWith(`${protocol}//`)
    && parsed.host.length > 0
    && uri.slice(`${protocol}//`.length).charAt(0) !== '/'
  if (!hasWebAuthority) {
    throw new CliFailure('OAuth verification_uri response field must be an absolute HTTP(S) URL with an authority.', {
      kind: 'UNAVAILABLE',
      code: 'connect-response-invalid',
    })
  }
  return uri
}

function connectPending(details: ConnectDetails, options: CliOptions): JsonRecord {
  const nextCommand = connectContinuation(options, [
    'ae', 'connect',
    ...(details.provider ? ['--provider'] : []),
  ])
  const nextAction = `Approve ${details.verificationUri} with user code ${details.userCode}, then run ${nextCommand} again if this wait expires.`
  return {
    kind: 'pending',
    clientId: details.clientId,
    verificationUri: details.verificationUri,
    userCode: details.userCode,
    nextAction,
    nextCommand,
  }
}

function connectedNextCommand(provider: boolean, options: CliOptions): string {
  if (provider) return connectContinuation(options, ['ae', 'supply', 'tools', '<businessRef>'])
  return connectContinuation(options, ['ae', 'search', 'what you need'])
}

function connectedNextAction(provider: boolean, options: CliOptions): string {
  return `Run ${connectedNextCommand(provider, options)}.`
}

function ownerConnectionHref(baseUrl: string, principalRef: string): string {
  const url = new URL('/agent-access', baseUrl)
  url.searchParams.set('caller', principalRef)
  return url.toString()
}

function printConnectResult(value: JsonRecord, options: CliOptions): void {
  const apiKeyOrigin = new URL(options.baseUrl).origin
  const output = typeof value.access_token === 'string' || value.kind === 'connected'
    ? { ...value, apiKeyOrigin }
    : value
  if (options.json) {
    printJson(output)
    return
  }
  heading('Connect AE')
  table([
    ['status', typeof value.kind === 'string' ? value.kind : 'unknown'],
    ...((typeof value.verificationUri === 'string') ? [['verification', value.verificationUri] as const] : []),
    ...((typeof value.userCode === 'string') ? [['user code', value.userCode] as const] : []),
    ...((typeof value.scope === 'string') ? [['scope', value.scope] as const] : []),
  ])
  if (value.kind === 'connected') {
    line('Your agent is connected. The origin-bound key is stored with user-only file permissions.')
    const nextCommand = typeof value.nextCommand === 'string'
      ? value.nextCommand
      : connectedNextCommand(value.profile === 'provider', options)
    line(`Next: ${nextCommand}`)
  } else if (typeof value.nextAction === 'string') {
    line(value.nextAction)
  }
  line(JSON.stringify(output, undefined, 2))
}

function openVerificationUri(uri: string, options: CliOptions): void {
  if (options.json || !process.stdout.isTTY || process.env.AE_DISABLE_BROWSER_OPEN === '1') return
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', uri] : [uri]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.unref()
}

async function validateAccessToken(options: CliOptions, key: string, provider: boolean): Promise<AgentAccountSelfResult> {
  const outcome = await callJson(options.baseUrl, AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path, {
    method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method,
    headers: { Authorization: `Bearer ${key}` },
  })
  const account = agentAccountSelfResultSchema.safeParse(outcome.body)
  const requiredScopes = (provider ? MARKET_SUPPLY_MANAGE_SCOPE : AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope).split(' ')
  if (outcome.ok && account.success && requiredScopes.every((scope) => account.data.scopes.includes(scope))) {
    return account.data
  }
  if (outcome.status === 401 || outcome.status === 403) {
    throw new CliFailure('AE_API_KEY was rejected by the configured server.', {
      kind: outcome.status === 401 ? 'UNAUTHENTICATED' : 'PERMISSION_DENIED',
      code: 'api_key_invalid',
    })
  }
  throw new CliFailure('AE_API_KEY could not be validated by the configured server.', {
    kind: outcome.status >= 500 ? 'UNAVAILABLE' : 'UNAUTHENTICATED',
    code: outcome.status >= 500 ? 'connect_validation_unavailable' : 'api_key_invalid',
  })
}

async function validateConfiguredKey(options: CliOptions, provider: boolean): Promise<AgentAccountSelfResult> {
  return await validateAccessToken(options, requireAgentAccessKey('connect', options, provider ? MARKET_SUPPLY_MANAGE_SCOPE : undefined), provider)
}
async function validateIssuedAccessToken(options: CliOptions, key: string, provider: boolean): Promise<AgentAccountSelfResult> {
  return await retry(
    async () => await validateAccessToken(options, key, provider),
    {
      retries: ISSUED_KEY_VALIDATION_RETRIES,
      delay: ISSUED_KEY_VALIDATION_DELAY_MS,
      shouldRetry: (error) => error instanceof CliFailure
        && error.kind === 'UNAUTHENTICATED'
        && error.code === 'api_key_invalid',
    },
  )
}
/** Register a public device client, obtain owner consent, and deliver one AE key. */
export async function runConnectCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) {
    throw usageFailure('connect', 'connect-usage')
  }

  const provider = options.provider === true
  const requestedScope = provider
    ? MARKET_SUPPLY_MANAGE_SCOPE
    : AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope
  const registrationRequest = provider
    ? {
        ...AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
        client_name: 'Agentic Economy Provider CLI',
        scope: requestedScope,
      }
    : AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST
  const configuredCredential = resolveAgentAccessCredential(options.baseUrl, provider ? MARKET_SUPPLY_MANAGE_SCOPE : undefined)
  if (configuredCredential !== undefined) {
    try {
      const account = await validateConfiguredKey(options, provider)
      printConnectResult({
        kind: 'connected',
        credential: 'origin_bound_agent_key',
        profile: provider ? 'provider' : 'market',
        connectionState: provider ? 'ready_to_supply' : 'ready_to_buy',
        principalRef: account.principalRef,
        accountRef: account.accountRef,
        credentialId: account.credentialId,
        authorityMode: account.authorityMode,
        scopes: account.scopes,
        ownerConnectionHref: ownerConnectionHref(options.baseUrl, account.principalRef),
        source: `validated_${configuredCredential.source}`,
        nextAction: connectedNextAction(provider, options),
        nextCommand: connectedNextCommand(provider, options),
      }, options)
      return
    } catch (error) {
      if (configuredCredential.source !== 'stored'
        || !(error instanceof CliFailure)
        || error.code !== 'api_key_invalid') throw error
    }
  }

  const registrationOutcome = await callJson(options.baseUrl, OAUTH_REGISTER_PATH, {
    method: 'POST',
    body: JSON.stringify(registrationRequest),
  })
  const registration = requireOk(registrationOutcome, OAUTH_REGISTER_PATH)
  const clientId = textField(isRecord(registration) ? registration.client_id : undefined, 'registration.client_id')

  const deviceRequest = oauthForm({ client_id: clientId, scope: requestedScope })
  const deviceOutcome = await callJson(options.baseUrl, OAUTH_DEVICE_AUTHORIZATION_PATH, {
    method: 'POST',
    headers: deviceRequest.headers,
    body: deviceRequest.body,
  })
  const device = requireOk(deviceOutcome, OAUTH_DEVICE_AUTHORIZATION_PATH)
  const deviceRecord = isRecord(device) ? device : undefined
  const details: ConnectDetails = {
    clientId,
    deviceCode: textField(deviceRecord?.device_code, 'device_code'),
    userCode: textField(deviceRecord?.user_code, 'user_code'),
    verificationUri: verificationUri(deviceRecord?.verification_uri),
    expiresIn: positiveSeconds(deviceRecord?.expires_in, 'expires_in', 600),
    intervalMs: Math.min(MAX_POLL_DELAY_MS, Math.max(MIN_POLL_DELAY_MS, positiveSeconds(deviceRecord?.interval, 'interval', DEFAULT_POLL_DELAY_MS / 1000) * 1_000)),
    provider,
  }

  if (options.json) {
    process.stderr.write(`Approve: ${details.verificationUri}\nUser code: ${details.userCode}\nWaiting for authorization…\n`)
  } else {
    heading('Connect AE')
    table([
      ['verification', details.verificationUri],
      ['user code', details.userCode],
      ['expires', `${details.expiresIn}s`],
    ])
    line('Approve the request, then this command will poll for the one-time credential.')
  }
  openVerificationUri(details.verificationUri, options)

  const deadline = Math.min(Date.now() + MAX_CONNECT_WAIT_MS, Date.now() + details.expiresIn * 1_000)
  let delayMs = details.intervalMs
  for (;;) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      printConnectResult(connectPending(details, options), options)
      return
    }

    const tokenRequest = oauthForm({
      grant_type: DEVICE_GRANT_TYPE,
      client_id: details.clientId,
      device_code: details.deviceCode,
    })
    const tokenOutcome = await callJson(options.baseUrl, OAUTH_TOKEN_PATH, {
      method: 'POST',
      headers: tokenRequest.headers,
      body: tokenRequest.body,
    })
    if (tokenOutcome.ok) {
      const token = tokenOutcome.body
      if (!isRecord(token)) {
        throw new CliFailure('OAuth token response was not a JSON object.', { kind: 'UNAVAILABLE', code: 'connect-response-invalid' })
      }
      const accessToken = textField(token.access_token, 'access_token')
      const account = await validateIssuedAccessToken(options, accessToken, provider)
      const storedAt = storeConnection({
        baseUrl: options.baseUrl,
        accessToken,
        ...(typeof token.token_type === 'string' ? { tokenType: token.token_type } : {}),
        ...(typeof token.scope === 'string' ? { scope: token.scope } : {}),
        profile: provider ? 'provider' : 'market',
      })
      printConnectResult({
        kind: 'connected',
        clientId: details.clientId,
        verificationUri: details.verificationUri,
        userCode: details.userCode,
        ...(typeof token.token_type === 'string' ? { tokenType: token.token_type } : {}),
        ...(typeof token.scope === 'string' ? { scope: token.scope } : {}),
        credential: 'origin_bound_agent_key',
        profile: provider ? 'provider' : 'market',
        connectionState: provider ? 'ready_to_supply' : 'ready_to_buy',
        principalRef: account.principalRef,
        accountRef: account.accountRef,
        credentialId: account.credentialId,
        authorityMode: account.authorityMode,
        scopes: account.scopes,
        ownerConnectionHref: ownerConnectionHref(options.baseUrl, account.principalRef),
        credentialStored: true,
        configPath: storedAt,
        nextAction: connectedNextAction(provider, options),
        nextCommand: connectedNextCommand(provider, options),
      }, options)
      return
    }

    const errorBody = isRecord(tokenOutcome.body) ? tokenOutcome.body : undefined
    const oauthError = typeof errorBody?.error === 'string' ? errorBody.error : undefined
    if (oauthError !== 'authorization_pending' && oauthError !== 'slow_down') {
      throw new CliFailure(`OAuth token request failed${oauthError === undefined ? '' : `: ${oauthError}`}.`, {
        kind: tokenOutcome.status === 401 ? 'UNAUTHENTICATED' : tokenOutcome.status === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE',
        code: oauthError ?? 'connect-token-failed',
        detail: typeof errorBody?.error_description === 'string' ? errorBody.error_description : undefined,
      })
    }

    const retryAfter = Number(tokenOutcome.headers.get('Retry-After'))
    if (oauthError === 'slow_down') {
      delayMs = Math.min(MAX_POLL_DELAY_MS, Math.max(MIN_POLL_DELAY_MS, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : delayMs + 1_000))
    } else if (Number.isFinite(retryAfter) && retryAfter > 0) {
      delayMs = Math.min(MAX_POLL_DELAY_MS, Math.max(MIN_POLL_DELAY_MS, retryAfter * 1_000))
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(delayMs, deadline - Date.now()))
    })
  }
}
