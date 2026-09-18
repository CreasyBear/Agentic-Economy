import type { JsonValue } from "@/modules/capability-contract/public";

export type AdmitCredentialSpec =
  | Readonly<{ kind: "public_upstream" }>
  | Readonly<{
      kind: "api_key";
      location: "query" | "header";
      name: string;
      schemeName: string;
    }>
  | Readonly<{ kind: "http_bearer"; schemeName: string }>;

export type AdmitProviderSchemaRefusal =
  | "admit_schema_circular_reference"
  | "admit_schema_reference_unresolvable"
  | "admit_schema_too_deep"
  | "admit_schema_deref_unavailable"
  | "admit_output_no_guaranteed_field";

export type SchemaRecord = Readonly<Record<string, JsonValue>>;

/**
 * A JSON-Schema dereferencer: resolves local `#/...` pointers (and combinator expansion) within a
 * schema against a resolution root (the OpenAPI document or MCP tool). Callers inject the
 * runtime-appropriate implementation: `dereferenceLocalSchema` for Convex-safe local expansion,
 * or `dereferenceOpenApiSchema` for Node-side callers that need the same local-only contract.
 */
export type SchemaDereferencer = (
  schema: SchemaRecord,
  root: unknown,
) => Promise<SchemaRecord>;
