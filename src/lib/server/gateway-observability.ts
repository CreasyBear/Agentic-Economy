import { captureServerGatewayEvent } from '@/lib/observability/posthog.server'
import { initSentryServer,Sentry } from '@/lib/observability/sentry.server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ActionTimingSink } from '@/modules/common/action'

/** Reuse configured SDKs. Only categorical metrics have tags; identifiers are
 * domain-separated digests in events. Reporting can never alter admission. */
export const gatewayObservabilitySink:ActionTimingSink={record(name,durationMs,metadata){
  if(name!=='gateway.operation'||metadata===undefined)return
  try{
    const properties:{[key:string]:string|number|boolean|null}={...metadata}
    for(const key of ['credentialId','principalId','applicationRef','invocationRef','operationRef','correlationId']){
      const value=properties[key];delete properties[key]
      if(typeof value==='string')properties[`${key}Digest`]=canonicalDigest({format:'ae.gateway-observability:v1',kind:key,value})
    }
    const actor=properties.principalIdDigest??properties.correlationIdDigest??'gateway:unattributed'
    captureServerGatewayEvent(String(actor),properties)
    if(initSentryServer()){
      const attributes:Record<string,string>={}
      for(const key of ['outcome','transport','operation','stage','pricing','approval'])if(typeof metadata[key]==='string')attributes[key]=metadata[key]
      if(typeof metadata.refusalCode==='string')attributes.refusalCode=METRIC_REFUSALS.has(metadata.refusalCode)?metadata.refusalCode:'other'
      Sentry.metrics.count('ae.gateway.operations',1,{attributes})
      Sentry.metrics.distribution('ae.gateway.duration',durationMs,{unit:'millisecond',attributes})
    }
  }catch{/* Existing observability is best effort and owns no product effect. */}
}}

// Error codes can originate in provider adapters. Keep that open vocabulary in
// bounded events, while metric series use this finite admission vocabulary.
const METRIC_REFUSALS=new Set(['scope_required','source_unavailable','rate_limited','method_not_allowed','payload_too_large','invalid_content_type','invalid_json','invalid_request','payments_not_ready','mcp_admission_unavailable','credential_invalid','credential_expired','credential_revoked','authentication_required'])
