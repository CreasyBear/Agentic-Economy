import type {
  Action,
  ActionInvocationResultClassification,
  ActionResult,
} from '@/modules/common/action'
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

export function classifyActionResult<Result extends ActionResult>(
  action: Action<unknown, Result>,
  result: Result,
): ActionInvocationResultClassification {
  return action.classifyInvocationResult?.(result) ?? {
    outcome: result.kind,
    referenceable: false,
  }
}

function toStableValue(value: unknown): StableHashValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toStableValue)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toStableValue(entry)]))
  }
  return null
}
