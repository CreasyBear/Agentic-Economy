import { isRecord } from "@/modules/common/is-record";

import type { SchemaRecord } from "./admit-provider-schema";

const MAX_DEREFERENCED_NODES = 10_000;

/**
 * Resolve local JSON pointers used by OpenAPI documents without crossing a
 * file, network, or process boundary. This is the Convex-safe equivalent of
 * the Node-side ref-parser adapter; unresolved or external references fail
 * closed and circular references remain as `$ref` markers.
 */
export async function dereferenceLocalSchema(
  schema: SchemaRecord,
  root: unknown,
): Promise<SchemaRecord> {
  const document = isRecord(root) ? root : {};
  const resolvedReferences = new Map<string, unknown>();
  const resolvedReferenceCosts = new Map<string, number>();
  const activeReferences = new Set<string>();
  let expandedNodes = 0;
  const consumeNodes = (count = 1) => {
    expandedNodes += count;
    if (expandedNodes > MAX_DEREFERENCED_NODES)
      throw new Error("admit_schema_too_deep");
  };
  const resolvePointer = (reference: string): unknown => {
    if (reference === "#") return document;
    if (!reference.startsWith("#/"))
      throw new Error("admit_schema_reference_external");
    const segments = reference
      .slice(2)
      .split("/")
      .map((segment) =>
        decodeURIComponent(segment.replace(/~1/gu, "/").replace(/~0/gu, "~")),
      );
    let current: unknown = document;
    for (const segment of segments) {
      if (!isRecord(current) || !Object.hasOwn(current, segment))
        throw new Error("admit_schema_reference_unresolvable");
      current = current[segment];
    }
    return current;
  };
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      consumeNodes();
      return value.map(visit);
    }
    if (!isRecord(value)) return value;
    consumeNodes();
    const reference = value.$ref;
    if (typeof reference === "string") {
      if (activeReferences.has(reference)) return value;
      let resolved = resolvedReferences.get(reference);
      if (resolved === undefined) {
        const startNodes = expandedNodes;
        activeReferences.add(reference);
        try {
          resolved = visit(resolvePointer(reference));
          resolvedReferences.set(reference, resolved);
          resolvedReferenceCosts.set(reference, expandedNodes - startNodes);
        } finally {
          activeReferences.delete(reference);
        }
      } else {
        consumeNodes(resolvedReferenceCosts.get(reference) ?? 1);
      }
      const remainder = Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "$ref"),
      );
      const visitedRemainder = visit(remainder);
      if (isRecord(resolved)) {
        return {
          ...resolved,
          ...(isRecord(visitedRemainder) ? visitedRemainder : {}),
        };
      }
      return Object.keys(remainder).length === 0
        ? resolved
        : { ...remainder, value: resolved };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, visit(entry)]),
    );
  };
  const dereferenced = visit(schema);
  if (!isRecord(dereferenced))
    throw new Error("admit_schema_deref_target_missing");
  return dereferenced as SchemaRecord;
}
