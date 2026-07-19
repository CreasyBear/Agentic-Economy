import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type {
  ActionInvocationOrigin,
  InvocationActor,
  PreparedInvocation,
} from './contracts'

export function materialDigest(input: unknown, paths: readonly string[]): string {
  const material = Object.fromEntries(paths.map((path) => [path, readPath(input, path) ?? null]))
  return canonicalDigest(toStableValue(material))
}

export function readPath(value: unknown, path: string): StableHashValue | undefined {
  let cursor: unknown = value
  for (const segment of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return toStableValue(cursor)
}

export function actorFromOrigin(origin: ActionInvocationOrigin): InvocationActor {
  return origin.kind === 'standalone'
    ? { callerRef: origin.callerRef, principalRef: origin.principalRef }
    : { callerRef: `request:${origin.requestRef}`, principalRef: `request-owner:${origin.requestRef}` }
}

export function dataUseFor(actionId: string, input: unknown): PreparedInvocation['dataUse'] {
  if (actionId !== 'inquiry.submit') return { fields: [], limits: {} }
  const contact = readPath(input, 'contact')
  return {
    fields: [
      'body',
      ...(typeof contact === 'object' && contact !== null
        ? Object.keys(contact).map((key) => `contact.${key}`)
        : []),
    ],
    limits: { body: 2_000, 'contact.name': 200, 'contact.email': 254, 'contact.phone': 32 },
  }
}

export function classifyBusinessOutcome(
  result: ActionResult,
): 'queued_communication' | 'refused' | 'not_found' | 'completed' {
  if (result.kind === 'not_found') return 'not_found'
  if (result.kind === 'error' || result.kind === 'refused') return 'refused'
  const receipt = result.receipt
  if (
    result.kind === 'ok' &&
    typeof receipt === 'object' &&
    receipt !== null &&
    'notificationStatus' in receipt &&
    (receipt as { notificationStatus?: unknown }).notificationStatus === 'queued'
  ) return 'queued_communication'
  return 'completed'
}

function toStableValue(value: unknown): StableHashValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toStableValue)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toStableValue(entry)]))
  }
  return null
}
