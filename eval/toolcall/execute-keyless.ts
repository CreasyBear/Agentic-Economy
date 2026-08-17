/**
 * Real keyless execution of the curated `wikipedia-rest.page-summary` capability — the end-to-end
 * proof that businesses -> capability -> engine selection -> real keyless endpoint -> real result.
 *
 * The binding is read from the curated publication (`CLUSTER_A_PUBLICATIONS`, wikipedia entry):
 * endpointUrl = server origin + operation path, adapter `http-json:v1`, credentialRef `none`
 * (PUBLIC_CREDENTIAL_REF). The runtime `send` is an SSRF-guarded, bounded fetch, and the response
 * output is validated against the contract `outputSchema`. Run via
 * `tsx eval/toolcall/run-toolcall.ts --live-execute` (requires network), or directly.
 */

import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { CLUSTER_A_PUBLICATIONS } from '@/modules/dev/internal/curated-cluster-a-publications'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportInvocation,
  type RouteTransportObservation,
  type RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'

const WIKIPEDIA_BINDING_ID = 'binding:wikipedia-rest-summary:page-summary:v1'
const WIKIPEDIA_CAPABILITY_ID = 'wikipedia-rest.page-summary'

/**
 * Reconstructs the full capability-contract document for the curated wikipedia summary op (the
 * input/output schemas and semantic projections the admission surface derives from the
 * publication's `contract` metadata). Used to validate the live response output.
 */
function wikipediaContractDocument() {
  return capabilityContractV2({
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: WIKIPEDIA_CAPABILITY_ID,
    version: 1,
    name: 'Wikipedia page summary',
    description: 'Returns a plain-text summary for a Wikipedia page through the keyless REST summary endpoint.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 300 },
      },
      required: ['title'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        title: { type: 'string' },
        displaytitle: { type: 'string' },
        pageid: { type: 'integer' },
        extract: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'extract'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'title', document: 'input', pointer: '/title', label: 'Page title', role: 'request' },
      { annotationId: 'summary', document: 'output', pointer: '/extract', label: 'Page summary', role: 'completion_evidence' },
    ],
    dataUse: [
      {
        effectId: 'query_release', inputPointer: '/title', classification: 'public',
        phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_wikipedia_summary'],
      },
    ],
    effects: [{
      effectId: 'query_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'not_applicable',
    }],
    evidence: [{ evidenceId: 'summary', outputPointer: '/extract', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  })
}

/** Bounded, SSRF-guarded `send` used by the keyless runtime. */
function buildSend(send: RouteTransportRuntime['send']): RouteTransportRuntime['send'] {
  return async (input: URL, init?) => {
    const url = input instanceof URL ? input : new URL(String(input))
    const allowed = await isPublicHttpTarget(url, defaultDnsResolver)
    if (!allowed) throw new Error('toolcall_ssrf_refused')
    // Wikipedia's REST API policy requires a descriptive User-Agent; without one it answers 429.
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) }
    if (headers['user-agent'] === undefined && headers['User-Agent'] === undefined) {
      headers['User-Agent'] = 'agentic-economy-toolcall/0.1'
    }
    return send(url, { ...init, headers })
  }
}

/**
 * Executes the keyless wikipedia summary for a `{ title }` input and returns the transport
 * observation plus the output-schema validation result. `options.send` lets a caller supply a
 * bounded/guarded fetch; defaults to a guarded undici `fetch`.
 */
export async function executeWikipediaSummary(
  input: Readonly<Record<string, unknown>>,
  options: Readonly<{ send?: RouteTransportRuntime['send'] }> = {},
): Promise<{ observation: RouteTransportObservation; validationKind: 'valid' | 'invalid' }> {
  const entry = CLUSTER_A_PUBLICATIONS.find(
    (candidate) => candidate.publication.commercial.bindingId === WIKIPEDIA_BINDING_ID,
  )
  if (entry === undefined) throw new Error('toolcall_wikipedia_binding_missing')
  const { publication } = entry
  const serverUrl = publication.document.servers[0]?.url
  if (serverUrl === undefined) throw new Error('toolcall_wikipedia_server_missing')
  const title = input['title']
  if (typeof title !== 'string' || title.length === 0) throw new Error('toolcall_wikipedia_title_missing')
  // The real MediaWiki REST API takes the page title as a URL PATH segment (…/page/summary/{title});
  // the curated binding's query mapping is the generic-GET-harness shape (see the offering's
  // shape-note material term). This harness exercises the REAL endpoint, so the title goes in the
  // path.
  const endpointUrl = `${serverUrl}${publication.operation.path}/${encodeURIComponent(title)}`
  const requestTimeoutMs = publication.commercial.requestTimeoutMs ?? 10_000
  const credentialRef = publication.commercial.credentialRef

  const config = {
    method: 'GET' as const,
    query: [{ inputPointer: '/title', parameter: 'title' }],
    requestTimeoutMs,
  }
  const configJson = JSON.stringify(config)

  const invocation: RouteTransportInvocation = {
    binding: {
      adapterId: 'http-json:v1',
      endpointUrl,
      credentialRef,
      configJson,
      configDigest: canonicalDigest(JSON.parse(configJson) as StableHashValue),
    },
    authority: {
      attemptRef: 'attempt:toolcall:wikipedia:v1',
      operationKeyDigest: canonicalDigest({ scope: 'toolcall', op: WIKIPEDIA_CAPABILITY_ID, kind: 'operation' }),
      mandateDigest: canonicalDigest({ scope: 'toolcall', op: WIKIPEDIA_CAPABILITY_ID, kind: 'mandate' }),
      grantDigest: canonicalDigest({ scope: 'toolcall', op: WIKIPEDIA_CAPABILITY_ID, kind: 'grant' }),
      capabilityContractDigest: canonicalDigest({ scope: 'toolcall', op: WIKIPEDIA_CAPABILITY_ID, kind: 'contract' }),
      maximumSpend: { currency: 'USD', units: '0', exponent: 2 },
      expiresAt: Date.now() + 60_000,
      callIdentity: {
        keyId: 'toolcall-keyless',
        signature: canonicalDigest({ scope: 'toolcall', op: WIKIPEDIA_CAPABILITY_ID, kind: 'signature' }),
      },
    },
    inputJson: JSON.stringify(input),
  }

  const guardedFetch: RouteTransportRuntime['send'] = async (target, init) => {
    const response = await fetch(target, {
      method: init?.method ?? 'GET',
      ...(init?.redirect === undefined ? {} : { redirect: init.redirect }),
      ...(init?.signal === undefined ? {} : { signal: init.signal }),
      ...(init?.body === undefined ? {} : { body: init.body }),
      ...(init?.headers === undefined ? {} : { headers: init.headers as Record<string, string> }),
    })
    return {
      status: response.status,
      ok: response.ok,
      headers: { get: (name: string) => response.headers.get(name) },
      text: () => response.text(),
    }
  }

  const runtime: RouteTransportRuntime = {
    send: buildSend(options.send ?? guardedFetch),
    resolveCredential: () => undefined,
    x402PaymentSigningAvailable: () => false,
  }

  const preparation = prepareRegisteredRouteTransportInvocation(
    invocation,
    runtime.resolveCredential,
    runtime.x402PaymentSigningAvailable,
  )
  if (preparation.kind === 'refused') {
    return { observation: preparation.observation, validationKind: 'invalid' }
  }
  const observation = await invokePreparedRouteTransport(preparation.prepared, runtime)

  // Validate the response output against the contract outputSchema. The contract outputSchema
  // describes AE's bounded/projected output (strict, additionalProperties:false with guaranteed
  // required fields), so the raw provider payload is projected down to the contract's guaranteed
  // completion evidence (title + extract) and that projection is validated via the seam.
  let validationKind: 'valid' | 'invalid' = 'invalid'
  if (observation.disposition === 'succeeded' && observation.outputJson !== undefined) {
    const parsed: unknown = JSON.parse(observation.outputJson)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Readonly<Record<string, unknown>>
      const title = record['title']
      const extract = record['extract']
      if (typeof title === 'string' && typeof extract === 'string') {
        const model = openCapabilityDecisionModel(defineCapabilityContract(wikipediaContractDocument()))
        validationKind = model.validateOutput({ title, extract }).kind === 'valid' ? 'valid' : 'invalid'
      }
    }
  }
  return { observation, validationKind }
}
