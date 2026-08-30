import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  findAction,
  listMcpActionDescriptors,
  listOperationRouteDescriptors,
  type PublicOperationRouteDescriptor,
} from '@/modules/actions'
import type { JsonValue } from '@/modules/capability-contract/public'
import {
  OPERATION_INVOKE_ROUTE_CONTRACT,
} from '@/modules/capability-execution/operation-invoke-entry'

export const PUBLIC_OPERATION_REF_EXAMPLE = `operation:v1:${'a'.repeat(64)}` as const
export const PUBLIC_INVOCATION_REF_EXAMPLE = 'invocation:v1:example' as const
export const PUBLIC_IDEMPOTENCY_KEY_EXAMPLE = 'example-idempotency-key' as const

const reconciliationEvidenceMaterial = {
  kind: 'action_invocation_reconciliation' as const,
  version: 1 as const,
  evidenceRef: 'evidence:v1:example',
  source: 'agentic-economy.example',
  invocationRef: PUBLIC_INVOCATION_REF_EXAMPLE,
  attemptRef: 'attempt:v1:example',
  effectGeneration: 1,
  resolution: 'not_released' as const,
  observedAt: '2026-01-01T00:00:00.000Z',
}

export const PUBLIC_RECONCILIATION_EVIDENCE_EXAMPLE = Object.freeze({
  ...reconciliationEvidenceMaterial,
  digest: canonicalDigest(reconciliationEvidenceMaterial),
})

export type PublicOperationRouteExample = Readonly<{
  actionInput: Readonly<Record<string, JsonValue>>
  http: Readonly<{
    path: string
    headers: Readonly<Record<string, string>>
    body?: Readonly<Record<string, JsonValue>>
  }>
}>

export function operationRouteExample(route: PublicOperationRouteDescriptor): PublicOperationRouteExample {
  const authorization = 'Bearer $AE_API_KEY'
  if (route.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId) {
    const actionInput = {
      operationRef: PUBLIC_OPERATION_REF_EXAMPLE,
      input: {},
      idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
    }
    return {
      actionInput,
      http: {
        path: route.path,
        headers: {
          Authorization: authorization,
          'Content-Type': OPERATION_INVOKE_ROUTE_CONTRACT.media.request,
          Accept: OPERATION_INVOKE_ROUTE_CONTRACT.media.response,
        },
        body: {
          operationRef: PUBLIC_OPERATION_REF_EXAMPLE,
          input: {},
          idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
        },
      },
    }
  }
  if (route.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.list.actionId) {
    const actionInput = { limit: 20 }
    return {
      actionInput,
      http: {
        path: `${route.path}?limit=20`,
        headers: { Authorization: authorization, Accept: OPERATION_INVOKE_ROUTE_CONTRACT.media.response },
      },
    }
  }
  if (route.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId) {
    const actionInput = { invocationRef: PUBLIC_INVOCATION_REF_EXAMPLE }
    return {
      actionInput,
      http: {
        path: route.path.replace('{invocationRef}', PUBLIC_INVOCATION_REF_EXAMPLE),
        headers: { Authorization: authorization, Accept: OPERATION_INVOKE_ROUTE_CONTRACT.media.response },
      },
    }
  }
  if (route.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.cancel.actionId) {
    const actionInput = {
      invocationRef: PUBLIC_INVOCATION_REF_EXAMPLE,
      idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
    }
    return {
      actionInput,
      http: {
        path: route.path.replace('{invocationRef}', PUBLIC_INVOCATION_REF_EXAMPLE),
        headers: {
          Authorization: authorization,
          'Content-Type': OPERATION_INVOKE_ROUTE_CONTRACT.media.request,
          Accept: OPERATION_INVOKE_ROUTE_CONTRACT.media.response,
        },
        body: { idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE },
      },
    }
  }
  const actionInput = {
    invocationRef: PUBLIC_INVOCATION_REF_EXAMPLE,
    idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
    evidence: PUBLIC_RECONCILIATION_EVIDENCE_EXAMPLE,
  }
  return {
    actionInput,
    http: {
      path: route.path.replace('{invocationRef}', PUBLIC_INVOCATION_REF_EXAMPLE),
      headers: {
        Authorization: authorization,
        'Content-Type': OPERATION_INVOKE_ROUTE_CONTRACT.media.request,
        Accept: OPERATION_INVOKE_ROUTE_CONTRACT.media.response,
      },
      body: { idempotencyKey: PUBLIC_IDEMPOTENCY_KEY_EXAMPLE, evidence: PUBLIC_RECONCILIATION_EVIDENCE_EXAMPLE },
    },
  }
}

export function operationRouteExamples(): readonly Readonly<{
  route: PublicOperationRouteDescriptor
  example: PublicOperationRouteExample
}>[] {
  return listOperationRouteDescriptors().map((route) => {
    const example = operationRouteExample(route)
    const action = findAction(route.actionId)
    if (action === undefined) throw new Error(`Operation route action is not registered: ${route.actionId}`)
    const parsed = action.schema.safeParse(example.actionInput)
    if (!parsed.success) throw new Error(`Operation route example is invalid: ${route.actionId}`)
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

export function operationRoutesMarkdown(): readonly string[] {
  return operationRouteExamples().flatMap(({ route, example }) => [
    `- \`${route.method} ${route.path}\` — action \`${route.actionId}\`, contract \`${route.contractVersion}\`, scope \`${OPERATION_INVOKE_ROUTE_CONTRACT.scope}\`.`,
    `  - request: \`${JSON.stringify(example.http.body ?? {})}\`; response: \`${OPERATION_INVOKE_ROUTE_CONTRACT.media.response}\`; required headers: ${route.requiredHeaders.map((header) => `\`${header}\``).join(', ')}.`,
  ])
}
