import type { OfferingRef } from '@/modules/common/ids'


/**
 * Business tool calling.
 *
 * A business page already publishes what a business is. This module publishes
 * what an agent may *do* with one, as a named tool bound to that business,
 * carrying the exact input schema the action already declares.
 *
 * Nothing here invents authority. A tool appears only when the underlying
 * route would actually accept the call, and the descriptor repeats the
 * action's own consequence class and authority requirement rather than
 * restating them more comfortably.
 */
export const BUSINESS_TOOL_AGENT_SCOPE = 'business_tools:invoke' as const

export const BusinessToolContractVersion = 'ae-business-tools:v1' as const
export {
  InquirySubmitToolId,
  businessToolInvokeSchema,
  businessToolPrepareSchema,
} from './public-values'

export type BusinessToolInvocationStyle = Readonly<{
  /**
   * Two-step. `prepare` returns the exact canonical bytes and their digest;
   * the caller commits by echoing that digest. The guard exists so a caller
   * cannot send something it never saw, so the digest is never derivable from
   * the commit payload alone.
   */
  kind: 'prepare_then_commit'
  prepareUrl: string
  invokeUrl: string
  method: 'POST'
  authentication: 'api_key'
  requiredScope: typeof BUSINESS_TOOL_AGENT_SCOPE
}>

export type BusinessToolDescriptor = Readonly<{
  toolId: string
  name: string
  summary: string
  boundaries: readonly string[]
  readOnly: boolean
  consequenceClass: string
  authorityRequirement: string
  contractVersion: string
  invocation: BusinessToolInvocationStyle
  /** The URL names the business; the descriptor binds the exact Offering it targets. */
  boundTarget: Readonly<{ businessSlug: string; offeringRef: OfferingRef }>
  prepareInputJsonSchema?: unknown
  invokeInputJsonSchema?: unknown
  outputJsonSchema?: unknown
}>
// The descriptor builder deliberately is not re-exported here. It reaches into
// the action registry, and this module is imported by discovery documents that
// must stay free of that graph — a barrel re-export would drag server-only
// code into every consumer that only wanted the scope constant. The pure
// URL-bound tool id and input schemas live in public-values.ts and are safe to
// expose for server adapters without pulling in that registry graph.
