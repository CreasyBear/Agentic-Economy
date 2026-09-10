import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  findAction,
  listMcpActionDescriptors,
  listCallRouteDescriptors,
  type PublicCallRouteDescriptor,
} from '@/modules/actions'
import type { JsonValue } from '@/modules/capability-contract/public'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  TOOL_QUOTE_ACTION_ID,
  TOOL_QUOTE_PATH,
} from '@/modules/capability-execution/quote'

export const PUBLIC_TOOL_REF_EXAMPLE = `operation:v1:${'a'.repeat(64)}` as const
export const PUBLIC_CALL_REF_EXAMPLE = 'invocation:v1:example' as const
export const PUBLIC_IDEMPOTENCY_KEY_EXAMPLE = 'example-idempotency-key' as const

const reconciliationEvidenceMaterial = {
  kind: 'action_invocation_reconciliation' as const,
  version: 1 as const,
  evidenceRef: 'evidence:v1:example',
  source: 'agentic-economy.example',
  invocationRef: PUBLIC_CALL_REF_EXAMPLE,
  attemptRef: 'attempt:v1:example',
  effectGeneration: 1,
  resolution: 'not_released' as const,
  observedAt: '2026-01-01T00:00:00.000Z',
}

export const PUBLIC_RECONCILIATION_EVIDENCE_EXAMPLE = Object.freeze({
  ...reconciliationEvidenceMaterial,
  digest: canonicalDigest(reconciliationEvidenceMaterial),
})

export type PublicCallRouteExample = Readonly<{
  actionInput: Readonly<Record<string, JsonValue>>
  http: Readonly<{
    path: string
    headers: Readonly<Record<string, string>>
    body?: Readonly<Record<string, JsonValue>>
  }>
}>

export function callRouteExample(route: PublicCallRouteDescriptor): PublicCallRouteExample {
  const authorization = 'Bearer $AE_API_KEY'
  if (route.actionId === TOOL_QUOTE_ACTION_ID) {
    const actionInput = { toolRef: PUBLIC_TOOL_REF_EXAMPLE, input: {} }
    return {
      actionInput,
      http: {
        path: TOOL_QUOTE_PATH,
        headers: {
          Authorization: authorization,
          'Content-Type': CALL_ROUTE_CONTRACT.media.request,
          Accept: CALL_ROUTE_CONTRACT.media.response,
        },
        body: actionInput,
      },
    }
  }
  if (route.actionId === CALL_ROUTE_CONTRACT.call.actionId) {
    const actionInput = {
      quoteRef: `operation-commitment:v1:${'b'.repeat(64)}`,
      idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
    }
    return {
      actionInput,
      http: {
        path: route.path,
        headers: {
          Authorization: authorization,
          'Content-Type': CALL_ROUTE_CONTRACT.media.request,
          Accept: CALL_ROUTE_CONTRACT.media.response,
        },
        body: actionInput,
      },
    }
  }
  if (route.actionId === CALL_ROUTE_CONTRACT.list.actionId) {
    const actionInput = { limit: 20 }
    return {
      actionInput,
      http: {
        path: `${route.path}?limit=20`,
        headers: { Authorization: authorization, Accept: CALL_ROUTE_CONTRACT.media.response },
      },
    }
  }
  if (route.actionId === CALL_ROUTE_CONTRACT.status.actionId) {
    const actionInput = { callRef: PUBLIC_CALL_REF_EXAMPLE }
    return {
      actionInput,
      http: {
        path: route.path.replace('{callRef}', PUBLIC_CALL_REF_EXAMPLE),
        headers: { Authorization: authorization, Accept: CALL_ROUTE_CONTRACT.media.response },
      },
    }
  }
  if (route.actionId === CALL_ROUTE_CONTRACT.cancel.actionId) {
    const actionInput = {
      callRef: PUBLIC_CALL_REF_EXAMPLE,
      idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
    }
    return {
      actionInput,
      http: {
        path: route.path.replace('{callRef}', PUBLIC_CALL_REF_EXAMPLE),
        headers: {
          Authorization: authorization,
          'Content-Type': CALL_ROUTE_CONTRACT.media.request,
          Accept: CALL_ROUTE_CONTRACT.media.response,
        },
        body: { idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE },
      },
    }
  }
  const actionInput = {
    callRef: PUBLIC_CALL_REF_EXAMPLE,
    idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
    evidence: PUBLIC_RECONCILIATION_EVIDENCE_EXAMPLE,
  }
  return {
    actionInput,
    http: {
      path: route.path.replace('{callRef}', PUBLIC_CALL_REF_EXAMPLE),
      headers: {
        Authorization: authorization,
        'Content-Type': CALL_ROUTE_CONTRACT.media.request,
        Accept: CALL_ROUTE_CONTRACT.media.response,
      },
      body: { idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE, evidence: PUBLIC_RECONCILIATION_EVIDENCE_EXAMPLE },
    },
  }
}

export function callRouteExamples(): readonly Readonly<{
  route: PublicCallRouteDescriptor
  example: PublicCallRouteExample
}>[] {
  return listCallRouteDescriptors().map((route) => {
    const example = callRouteExample(route)
    const action = findAction(route.actionId)
    if (action === undefined) throw new Error(`Call route action is not registered: ${route.actionId}`)
    const parsed = action.schema.safeParse(example.actionInput)
    if (!parsed.success) throw new Error(`Call route example is invalid: ${route.actionId}`)
    return { route, example }
  })
}

export type PublicMcpToolDoc = Readonly<{
  name: string
  actionId: string
  summary: string
  readOnly: boolean
  inputJsonSchema?: unknown
  outputJsonSchema?: unknown
}>

export function publicMcpToolDocs(): readonly PublicMcpToolDoc[] {
  return listMcpActionDescriptors().map((descriptor) => ({
    name: descriptor.toolName,
    actionId: descriptor.id,
    summary: descriptor.summary,
    readOnly: descriptor.readOnly,
    ...(descriptor.inputJsonSchema === undefined ? {} : { inputJsonSchema: descriptor.inputJsonSchema }),
    ...(descriptor.outputJsonSchema === undefined ? {} : { outputJsonSchema: descriptor.outputJsonSchema }),
  }))
}

export function callRoutesMarkdown(): readonly string[] {
  return callRouteExamples().flatMap(({ route, example }) => [
    `- \`${route.method} ${route.path}\` — action \`${route.actionId}\`, contract \`${route.contractVersion}\`, scope \`${CALL_ROUTE_CONTRACT.scope}\`.`,
    `  - request: \`${JSON.stringify(example.http.body ?? {})}\`; response: \`${CALL_ROUTE_CONTRACT.media.response}\`; required headers: ${route.requiredHeaders.map((header) => `\`${header}\``).join(', ')}.`,
  ])
}
