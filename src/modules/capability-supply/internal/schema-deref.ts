import $RefParser from '@apidevtools/json-schema-ref-parser'

import type { JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'

import type { SchemaDereferencer } from './admit-provider-schema'

/**
 * Short-circuit marker used to reach the target schema inside the resolution-root document we
 * hand to ref-parser, so local `#/...` pointers resolve into the root that carries the schema.
 */
const DEREFERENCED_SCHEMA_SLOT = '__ae_provider_schema'

/**
 * Node-runtime JSON-Schema dereferencer used by the admission seam's NODE-side callers (owner
 * supply funnel, CLI, tests). This module is deliberately NOT imported by the convex-reachable
 * admission chain: the Convex seed mutation runs in the isolate runtime, which has no Node
 * built-ins and no way to bundle `path`/`util`. Convex callers short-circuit conformant schemas
 * or refuse with `admit_schema_deref_unavailable`; only Node callers pass this function.
 */
export const dereferenceOpenApiSchema: SchemaDereferencer = async (schema, root) => {
  const document: Record<string, unknown> = isRecord(root)
    ? { ...root, [DEREFERENCED_SCHEMA_SLOT]: schema }
    : { [DEREFERENCED_SCHEMA_SLOT]: schema }
  const dereferenced = await $RefParser.dereference(document, {
    dereference: { circular: 'ignore' },
    // Never reach across process/network boundaries: local `#/...` pointers only.
    resolve: { external: false, file: false, http: false },
  })
  const slot = isRecord(dereferenced) ? dereferenced[DEREFERENCED_SCHEMA_SLOT] : undefined
  if (!isRecord(slot)) throw new Error('admit_schema_deref_target_missing')
  return slot as Readonly<Record<string, JsonValue>>
}
