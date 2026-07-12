import { verify as verifyWebBotAuth } from 'web-bot-auth'
import { verifierFromJWK } from 'web-bot-auth/crypto'
import { sha256 } from '@noble/hashes/sha2'

const noTrustedSignatureAgents = [] as const
const defaultMaxSignatureAgeMs = 60_000
const defaultClockSkewMs = 30_000
const signatureRequirementHeader = 'sig1=("@method" "@authority" "@path" "content-digest" "signature-agent");tag="web-bot-auth"'

export type AgentIdentity = Readonly<{
  kind: 'identity'
  signatureAgent: string
  keyid: string
  verifiedAt: string
}>

export type AgentIdentityVerificationErrorCode =
  | 'malformed_signature'
  | 'invalid_wba_tag'
  | 'missing_method_coverage'
  | 'missing_authority_coverage'
  | 'missing_path_coverage'
  | 'signature_agent_not_covered'
  | 'missing_content_digest_coverage'
  | 'content_digest_mismatch'
  | 'authority_mismatch'
  | 'signature_expired'
  | 'signature_created_in_future'
  | 'signature_stale'
  | 'missing_signature_agent'
  | 'unsupported_signature_agent_format'
  | 'untrusted_signature_agent'
  | 'unsigned_directory_untrusted'
  | 'directory_fetch_failed'
  | 'directory_invalid'
  | 'unknown_key'
  | 'invalid_signature'

export type AgentIdentityVerificationError = Readonly<{
  kind: 'error'
  code: AgentIdentityVerificationErrorCode
  status: 400 | 401 | 502
  reason: string
}>

export type AgentIdentityVerificationResult =
  | Readonly<{ kind: 'unsigned' }>
  | AgentIdentity
  | AgentIdentityVerificationError

export type AgentIdentityVerificationOptions = Readonly<{
  expectedAuthority?: string
  now?: Date
  maxSignatureAgeMs?: number
  clockSkewMs?: number
  allowedSignatureAgents?: readonly string[]
  pretrustedDirectoryOrigins?: readonly string[]
  fetchDirectory?: (signatureAgent: string) => Promise<Response>
  bodyText?: string
}>

type SignatureInputInspection = Readonly<{
  components: readonly string[]
  keyid?: string
  created?: Date
  expires?: Date
  tag?: string
}>

type DirectoryJwk = {
  kty: string
  kid?: string
  alg?: string
  crv?: string
  e?: string
  ext?: boolean
  key_ops?: string[]
  n?: string
  use?: string
  x?: string
  y?: string
  [field: string]: unknown
}

export async function verifyAgentIdentity(
  request: Request,
  options: AgentIdentityVerificationOptions = {},
): Promise<AgentIdentityVerificationResult> {
  const signature = request.headers.get('Signature')
  const signatureInput = request.headers.get('Signature-Input')

  if (signature === null && signatureInput === null) {
    return { kind: 'unsigned' }
  }

  if (signature === null || signatureInput === null || !isPlausibleSignatureHeader(signature)) {
    return identityError('malformed_signature', 400, 'Signature headers are not parseable HTTP message signatures.')
  }

  const signatureAgentHeader = request.headers.get('Signature-Agent')
  const signatureAgent = parseSignatureAgentHeader(signatureAgentHeader)
  if (signatureAgent.kind === 'error') {
    return signatureAgent
  }

  const inspection = inspectSignatureInput(signatureInput)
  if (inspection === undefined) {
    return identityError('malformed_signature', 400, 'Signature-Input is not a supported HTTP message signature dictionary.')
  }

  if (inspection.tag !== 'web-bot-auth') {
    return identityError('invalid_wba_tag', 400, 'Signature must declare the web-bot-auth tag.')
  }

  if (!inspection.components.includes('@method')) {
    return identityError('missing_method_coverage', 400, 'Signature must cover @method.')
  }

  if (!inspection.components.includes('@authority')) {
    return identityError('missing_authority_coverage', 400, 'Signature must cover @authority.')
  }

  if (!inspection.components.includes('@path')) {
    return identityError('missing_path_coverage', 400, 'Signature must cover @path.')
  }

  if (!inspection.components.includes('signature-agent')) {
    return identityError('signature_agent_not_covered', 400, 'Signature must cover Signature-Agent.')
  }

  if (options.bodyText !== undefined) {
    if (!inspection.components.includes('content-digest')) {
      return identityError('missing_content_digest_coverage', 400, 'Signature must cover Content-Digest for bodied requests.')
    }
    const expectedContentDigest = contentDigestHeader(options.bodyText)
    const contentDigest = request.headers.get('Content-Digest')
    if (contentDigest !== expectedContentDigest) {
      return identityError('content_digest_mismatch', 400, 'Content-Digest does not match the request body.')
    }
  }

  const expectedAuthority = options.expectedAuthority ?? new URL(request.url).host
  if (new URL(request.url).host !== expectedAuthority) {
    return identityError('authority_mismatch', 401, 'Signature authority does not match this routing ingress.')
  }

  const freshnessError = validateSignatureFreshness(inspection, options)
  if (freshnessError !== undefined) {
    return freshnessError
  }

  const allowedSignatureAgents = options.allowedSignatureAgents ?? noTrustedSignatureAgents
  if (!allowedSignatureAgents.includes(signatureAgent.value)) {
    return identityError('untrusted_signature_agent', 401, 'Signature-Agent is not in the initial allowlist.')
  }

  const pretrustedDirectoryOrigins = options.pretrustedDirectoryOrigins ?? noTrustedSignatureAgents
  if (!pretrustedDirectoryOrigins.includes(signatureAgent.value)) {
    return identityError('unsigned_directory_untrusted', 401, 'Unsigned signer directory is not trusted for this agent.')
  }

  const keyid = inspection.keyid
  if (keyid === undefined || keyid.length === 0) {
    return identityError('malformed_signature', 400, 'Signature keyid is required.')
  }

  const directoryKeys = await fetchDirectoryKeys(signatureAgent.value, options.fetchDirectory)
  if (directoryKeys.kind === 'error') {
    return directoryKeys
  }

  const key = directoryKeys.keys.find((candidate) => candidate.kid === keyid)
  if (key === undefined) {
    return identityError('unknown_key', 401, 'Signature key is not published for the Signature-Agent.')
  }

  try {
    await verifyWebBotAuth(request, await verifierFromJWK(key))
  } catch {
    return identityError('invalid_signature', 401, 'Signature could not be verified against the published key.')
  }

  return {
    kind: 'identity',
    signatureAgent: signatureAgent.value,
    keyid,
    verifiedAt: (options.now ?? new Date()).toISOString(),
  }
}

export function acceptSignatureHeaderValue(): string {
  return signatureRequirementHeader
}

function contentDigestHeader(body: string): string {
  const digest = sha256(new TextEncoder().encode(body))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return `sha-256=:${btoa(binary)}:`
}

function isPlausibleSignatureHeader(value: string): boolean {
  return /^[A-Za-z0-9_-]+=:([A-Za-z0-9+/=]+):$/.test(value)
}

function parseSignatureAgentHeader(
  value: string | null,
): Readonly<{ kind: 'ok'; value: string }> | AgentIdentityVerificationError {
  if (value === null || value.trim().length === 0) {
    return identityError('missing_signature_agent', 400, 'Signature-Agent is required for signed agent requests.')
  }

  const trimmed = value.trim()
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"') || trimmed.length < 3) {
    return identityError('unsupported_signature_agent_format', 400, 'Only the legacy quoted Signature-Agent form is admitted.')
  }

  return { kind: 'ok', value: trimmed.slice(1, -1) }
}

function inspectSignatureInput(value: string): SignatureInputInspection | undefined {
  const componentListStart = value.indexOf('=(')
  const componentListEnd = value.indexOf(')', componentListStart + 2)
  if (componentListStart < 0 || componentListEnd <= componentListStart) {
    return undefined
  }

  const components: string[] = []
  const componentList = value.slice(componentListStart + 2, componentListEnd)
  for (const match of componentList.matchAll(/"([^"]+)"/g)) {
    const component = match[1]
    if (component !== undefined) {
      components.push(component.toLowerCase())
    }
  }

  if (components.length === 0) {
    return undefined
  }

  const params = value.slice(componentListEnd + 1)
  return {
    components,
    ...optionalStringParam(params, 'keyid'),
    ...optionalDateParam(params, 'created'),
    ...optionalDateParam(params, 'expires'),
    ...optionalStringParam(params, 'tag'),
  }
}

function optionalStringParam(params: string, name: 'keyid' | 'tag'): Partial<Pick<SignatureInputInspection, 'keyid' | 'tag'>> {
  const match = new RegExp(`;${name}="([^"]*)"`).exec(params)
  const value = match?.[1]
  return value === undefined ? {} : { [name]: value }
}

function optionalDateParam(params: string, name: 'created' | 'expires'): Partial<Pick<SignatureInputInspection, 'created' | 'expires'>> {
  const match = new RegExp(`;${name}=(-?\\d+)`).exec(params)
  const value = match?.[1]
  return value === undefined ? {} : { [name]: new Date(Number(value) * 1000) }
}

function validateSignatureFreshness(
  inspection: SignatureInputInspection,
  options: AgentIdentityVerificationOptions,
): AgentIdentityVerificationError | undefined {
  const created = inspection.created
  const expires = inspection.expires
  if (created === undefined || expires === undefined) {
    return identityError('malformed_signature', 400, 'Signature created and expires parameters are required.')
  }

  const nowMs = (options.now ?? new Date()).getTime()
  if (expires.getTime() < nowMs) {
    return identityError('signature_expired', 401, 'Signature has expired.')
  }

  const clockSkewMs = options.clockSkewMs ?? defaultClockSkewMs
  if (created.getTime() - nowMs > clockSkewMs) {
    return identityError('signature_created_in_future', 401, 'Signature created time is too far in the future.')
  }

  const maxSignatureAgeMs = options.maxSignatureAgeMs ?? defaultMaxSignatureAgeMs
  if (nowMs - created.getTime() > maxSignatureAgeMs) {
    return identityError('signature_stale', 401, 'Signature created time is outside the replay window.')
  }

  return undefined
}

async function fetchDirectoryKeys(
  signatureAgent: string,
  fetchDirectory: AgentIdentityVerificationOptions['fetchDirectory'],
): Promise<Readonly<{ kind: 'ok'; keys: readonly DirectoryJwk[] }> | AgentIdentityVerificationError> {
  const fetcher = fetchDirectory ?? defaultFetchDirectory
  let response: Response
  try {
    response = await fetcher(signatureAgent)
  } catch {
    return identityError('directory_fetch_failed', 502, 'Signature-Agent directory could not be fetched.')
  }

  if (!response.ok) {
    return identityError('directory_fetch_failed', 502, 'Signature-Agent directory returned a non-success response.')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return identityError('directory_invalid', 502, 'Signature-Agent directory did not return JSON.')
  }

  const keys = directoryKeysFromPayload(payload)
  if (keys === undefined) {
    return identityError('directory_invalid', 502, 'Signature-Agent directory did not publish a keys array.')
  }

  return { kind: 'ok', keys }
}

function directoryKeysFromPayload(payload: unknown): readonly DirectoryJwk[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.keys)) {
    return undefined
  }

  const keys: DirectoryJwk[] = []
  for (const candidate of payload.keys) {
    if (isRecord(candidate) && typeof candidate.kty === 'string') {
      keys.push(candidate as DirectoryJwk)
    }
  }

  return keys
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function defaultFetchDirectory(signatureAgent: string): Promise<Response> {
  return fetch(new URL('/.well-known/http-message-signatures-directory', signatureAgent))
}

function identityError(
  code: AgentIdentityVerificationErrorCode,
  status: AgentIdentityVerificationError['status'],
  reason: string,
): AgentIdentityVerificationError {
  return { kind: 'error', code, status, reason }
}
