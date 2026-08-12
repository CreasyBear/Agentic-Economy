import { authenticateAgentAccess } from '@/lib/server/agent-access-auth'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import {
  BUSINESS_TOOL_AGENT_SCOPE,
  BusinessToolContractVersion,
  InquirySubmitToolId,
  businessToolInvokeSchema,
  businessToolPrepareSchema,
} from '@/modules/business-tools/public'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { encodeGovernedAction } from '@/modules/governed-action/public'
import {
  buildGovernedSendIntent,
  type InquiryTargetRef,
} from '@/modules/inquiries/public'
import {
  readPublicTargetAdmissionServer,
  submitPublicInquiryServer,
} from '@/modules/inquiries/inquiry.functions'
import { selectPublicInquiryTarget } from '@/modules/inquiries/route-readbacks'
import { response } from '@/lib/server/no-store-response'
import { kindForStatus } from '@/lib/errors'
import { problem } from '@/lib/server/problem'

const MAX_BUSINESS_TOOL_BODY_BYTES = 4 * 1024

type JsonBodyResult =
  | Readonly<{ kind: 'ok'; value: unknown }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'too_large' }>

type ToolRefusalCode =
  | 'authentication_required'
  | 'scope_required'
  | 'unknown_tool'
  | 'tool_not_available'
  | 'source_unavailable'
  | 'invalid_input'
  | 'request_too_large'
  | 'preparation_failed'

/**
 * Business tool calling over HTTP.
 *
 * The business is named by the URL, never by the payload, so a key holder
 * cannot aim a prepared call at a different business. Availability is the same
 * admission fact the business page and the discovery manifest use, so a tool
 * that is advertised is a tool that will run, and one that is not advertised
 * refuses here rather than failing deeper in.
 */
export type BusinessToolHandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
}>

export async function handleBusinessToolPrepare(
  request: Request,
  slug: string,
  toolId: string,
  options: BusinessToolHandlerOptions = {},
): Promise<Response> {
  const authenticated = await authenticateToolCall(toolId, options)
  if (authenticated !== undefined) return authenticated

  const body = await readJsonBody(request)
  if (body.kind === 'too_large') return refuse(413, 'request_too_large', 'Request body is too large.')
  const parsed = businessToolPrepareSchema.safeParse(body.kind === 'ok' ? body.value : undefined)
  if (!parsed.success) return refuse(400, 'invalid_input', parsed.error.issues[0]?.message ?? 'Input did not match the published schema.')

  const resolved = await resolveToolTarget(slug)
  if (resolved.kind === 'refused') return resolved.response

  const encoding = encodeGovernedAction(buildGovernedSendIntent({
    target: resolved.target,
    body: parsed.data.body,
    contact: compactContact(parsed.data.contact),
  }))
  if (encoding.kind !== 'encoded') {
    return refuse(422, 'preparation_failed', 'This call could not be canonicalized for review.')
  }

  return response({
    kind: 'prepared',
    contractVersion: BusinessToolContractVersion,
    toolId,
    businessSlug: slug,
    expectedDigest: encoding.digest,
    canonicalBytesBase64: encoding.canonicalBytesBase64,
    willSend: { body: parsed.data.body, contact: parsed.data.contact },
    commit: {
      method: 'POST',
      note: 'Echo expectedDigest exactly. A different digest means the reviewed call is not the call being sent.',
    },
  }, 200)
}

export async function handleBusinessToolInvoke(
  request: Request,
  slug: string,
  toolId: string,
  options: BusinessToolHandlerOptions = {},
): Promise<Response> {
  const authenticated = await authenticateToolCall(toolId, options)
  if (authenticated !== undefined) return authenticated

  const body = await readJsonBody(request)
  if (body.kind === 'too_large') return refuse(413, 'request_too_large', 'Request body is too large.')
  const parsed = businessToolInvokeSchema.safeParse(body.kind === 'ok' ? body.value : undefined)
  if (!parsed.success) return refuse(400, 'invalid_input', parsed.error.issues[0]?.message ?? 'Input did not match the published schema.')

  const resolved = await resolveToolTarget(slug)
  if (resolved.kind === 'refused') return resolved.response

  // The digest is verified against freshly rebuilt canonical bytes rather than
  // trusted, so a stale or borrowed digest cannot carry a different message.
  const result = await submitPublicInquiryServer({
    data: {
      target: resolved.target,
      body: parsed.data.body,
      contact: compactContact(parsed.data.contact),
      expectedDigest: parsed.data.expectedDigest,
      ...(parsed.data.operationKey === undefined ? {} : { operationKey: parsed.data.operationKey }),
    },
  })

  return response({
    contractVersion: BusinessToolContractVersion,
    toolId,
    businessSlug: slug,
    result,
  }, result.kind === 'ok' ? 200 : 422)
}

type ResolvedToolTarget =
  | Readonly<{ kind: 'resolved'; target: InquiryTargetRef }>
  | Readonly<{ kind: 'refused'; response: Response }>

/**
 * `exactOptionalPropertyTypes` distinguishes an absent field from one present
 * as undefined, and the canonical encoding does too — a contact carrying
 * `phone: undefined` must hash the same as one omitting it.
 */
function compactContact(contact: Readonly<{
  name?: string | undefined
  email?: string | undefined
  phone?: string | undefined
}>): Readonly<{
  name?: string
  email?: string
  phone?: string
}> {
  return {
    ...(contact.name === undefined ? {} : { name: contact.name }),
    ...(contact.email === undefined ? {} : { email: contact.email }),
    ...(contact.phone === undefined ? {} : { phone: contact.phone }),
  }
}

/** Returns a refusal response, or undefined when the caller may proceed. */
async function authenticateToolCall(
  toolId: string,
  options: BusinessToolHandlerOptions,
): Promise<Response | undefined> {
  const authenticated = await authenticateAgentAccess({
    requiredScope: BUSINESS_TOOL_AGENT_SCOPE,
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (authenticated.kind === 'refused') {
    return refuse(authenticated.status, authenticated.reason, refusalReason(authenticated.reason))
  }
  return toolId === InquirySubmitToolId
    ? undefined
    : refuse(404, 'unknown_tool', `This business publishes no tool named "${toolId}".`)
}

/**
 * Resolved after the payload is validated, so a malformed call costs no source
 * reads, and the same admission fact the manifest published decides whether
 * the advertised tool actually runs.
 */
async function resolveToolTarget(slug: string): Promise<ResolvedToolTarget> {
  const page = await readPublicBusinessPageServer({ data: { slug } })
  if (page.kind === 'not_found') {
    return { kind: 'refused', response: refuse(404, 'tool_not_available', 'No business page is published at this address.') }
  }
  if (page.kind === 'unavailable') {
    return {
      kind: 'refused',
      response: refuse(503, 'source_unavailable', 'The business source is temporarily unavailable. Try again later.'),
    }
  }
  const target = selectPublicInquiryTarget(page.catalog)
  if (target === undefined) {
    return { kind: 'refused', response: refuse(409, 'tool_not_available', 'This business publishes no first-contact path.') }
  }
  const admission = await readPublicTargetAdmissionServer({ data: target })
  if (admission.kind !== 'ok' || !admission.admission.admitted) {
    return { kind: 'refused', response: refuse(409, 'tool_not_available', 'This business is not currently accepting a first contact through AE.') }
  }

  return { kind: 'resolved', target }
}

function refusalReason(code: 'authentication_required' | 'scope_required'): string {
  return code === 'authentication_required'
    ? 'Present a current AE API key.'
    : `This key does not carry the ${BUSINESS_TOOL_AGENT_SCOPE} scope.`
}

async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const bounded = await readBoundedRequestJson(request, MAX_BUSINESS_TOOL_BODY_BYTES)
  if (!bounded.ok) return { kind: bounded.code === 'payload_too_large' ? 'too_large' : 'invalid' }
  return { kind: 'ok', value: bounded.value }
}

function refuse(status: number, code: ToolRefusalCode, reason: string): Response {
  return problem({ status, kind: kindForStatus(status), code, detail: reason, reason })
}

