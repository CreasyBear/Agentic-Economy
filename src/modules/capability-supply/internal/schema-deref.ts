import { dereference } from '@scalar/openapi-parser'

import type { JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'

import type { SchemaDereferencer } from './admit-provider-schema'

/**
 * Short-circuit marker used to reach the target schema inside the resolution-root document we
 * hand to ref-parser, so local `#/...` pointers resolve into the root that carries the schema.
 */
const DEREFERENCED_SCHEMA_SLOT = '__ae_provider_schema'

/**
 * Maintained OpenAPI dereferencer used by the admission seam's server-side callers. External
 * references must already have been supplied by the guarded source loader; this boundary never
 * performs implicit network or filesystem access.
 */
export const dereferenceOpenApiSchema: SchemaDereferencer = async (schema, root) => {
  const document: Record<string, unknown> = isRecord(root)
    ? { ...root, [DEREFERENCED_SCHEMA_SLOT]: schema }
    : { [DEREFERENCED_SCHEMA_SLOT]: schema }
  const dereferenced = dereference(document)
  if ((dereferenced.errors ?? []).length > 0) throw new Error('admit_schema_reference_unresolvable')
  const slot = isRecord(dereferenced.schema)
    ? dereferenced.schema[DEREFERENCED_SCHEMA_SLOT]
    : undefined
  if (!isRecord(slot)) throw new Error('admit_schema_deref_target_missing')
  if (containsObjectCycle(slot)) throw new Error('admit_schema_circular_reference')
  return slot as Readonly<Record<string, JsonValue>>
}

function containsObjectCycle(value: unknown): boolean {
  const active = new Set<object>()
  const complete = new Set<object>()

  function visit(candidate: unknown): boolean {
    if (candidate === null || typeof candidate !== 'object') return false
    if (active.has(candidate)) return true
    if (complete.has(candidate)) return false
    active.add(candidate)
    const children = Array.isArray(candidate) ? candidate : Object.values(candidate)
    for (const child of children) {
      if (visit(child)) return true
    }
    active.delete(candidate)
    complete.add(candidate)
    return false
  }

  return visit(value)
}
