import type { CapabilityTransportAuthority } from "@/modules/capability-supply/public";
import type { JsonValue } from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";

import type { CapabilityContractMetadata } from "./publication-importers";

const MAX_ADMIT_SCHEMA_DEPTH = 64;

// Deterministic schema-adapter normalizer for AE's capability admission seam.
//
// Mirrors the settled OpenAPI normalization conventions the design doc cites:
//   - Apicurio Registry `references=DEREFERENCE`: inline every local `$ref`
//     into a self-contained schema; refuse (named) on circular/unresolvable
//     references rather than looping.
//   - OpenAPI Generator normalizer rules (`NORMALIZE_31SPEC`,
//     `SIMPLIFY_ONEOF_ANYOF`, `REFACTOR_ALLOF_WITH_PROPERTIES_ONLY`):
//     flatten allOf/oneOf/anyOf into the canonical bounded shape and extract
//     security-scheme credentials out of the input surface.
//
// The normalizer is purely ADDITIVE: for an already-conformant (hand-curated)
// publication it returns the exact same input/output schemas and metadata, so
// existing normalized drafts stay byte-identical. Every rule only fills a gap
// or normalizes a construct the canonical contract would otherwise refuse.

export type AdmitCredentialSpec =
  | Readonly<{ kind: "keyless" }>
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

export type AdmitProviderSchemaInput = Readonly<{
  inputSchema: Readonly<Record<string, JsonValue>>;
  outputSchema: Readonly<Record<string, JsonValue>>;
  contract: CapabilityContractMetadata;
  authority: CapabilityTransportAuthority;
  credential: AdmitCredentialSpec;
  /** Resolution root for local `#/...` references (the OpenAPI document, or the MCP tool). */
  resolutionRoot: unknown;
  /** Parameter/body names that carry a credential and must never be dynamic inputs. */
  credentialParameterNames: readonly string[];
}>;

export type AdmitProviderSchemaNormalized = Readonly<{
  inputSchema: Readonly<Record<string, JsonValue>>;
  outputSchema: Readonly<Record<string, JsonValue>>;
  contract: CapabilityContractMetadata;
  authority: CapabilityTransportAuthority;
  strippedParameters: readonly string[];
}>;

export type AdmitProviderSchemaResult =
  | (AdmitProviderSchemaNormalized & Readonly<{ kind: "normalized" }>)
  | Readonly<{ kind: "refused"; reason: AdmitProviderSchemaRefusal }>;

export type SchemaRecord = Readonly<Record<string, JsonValue>>;
type InlineResult =
  | Readonly<{ kind: "ok"; schema: SchemaRecord }>
  | Readonly<{ kind: "refused"; reason: AdmitProviderSchemaRefusal }>;

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

export async function admitProviderSchema(
  input: AdmitProviderSchemaInput,
  derefSchema?: SchemaDereferencer,
): Promise<AdmitProviderSchemaResult> {
  const strippedParameters = input.credentialParameterNames.filter((name) =>
    input.credential.kind === "api_key" && input.credential.location === "query"
      ? recordHasKey(input.inputSchema.properties, name)
      : false,
  );
  const inlineInput = await inlineSchemaReferences(
    input.inputSchema,
    input.resolutionRoot,
    derefSchema,
  );
  if (inlineInput.kind === "refused") return inlineInput;
  const inlineOutput = await inlineSchemaReferences(
    input.outputSchema,
    input.resolutionRoot,
    derefSchema,
  );
  if (inlineOutput.kind === "refused") return inlineOutput;
  if (
    schemaDepth(inlineInput.schema) > MAX_ADMIT_SCHEMA_DEPTH ||
    schemaDepth(inlineOutput.schema) > MAX_ADMIT_SCHEMA_DEPTH
  ) {
    return { kind: "refused", reason: "admit_schema_too_deep" };
  }

  const boundedInput = imposeRequiredInputClosure(inlineInput.schema);
  const outputPlan = planOutputEvidence(inlineOutput.schema);
  if (outputPlan.kind === "refused") return outputPlan;

  const contract = deriveAdmissionMetadata(
    boundedInput,
    input.contract,
    outputPlan.evidencePointer,
  );

  return {
    kind: "normalized",
    inputSchema: boundedInput,
    outputSchema: outputPlan.outputSchema,
    contract,
    authority: input.authority,
    strippedParameters,
  };
}

// --- $ref / allOf / oneOf / anyOf dereferencing (@apidevtools/json-schema-ref-parser) ---------

async function inlineSchemaReferences(
  schema: SchemaRecord,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<InlineResult> {
  // Already-conformant (hand-curated) schemas contain no $ref and no combinator: keep them
  // byte-identical so contract digests and seed idempotency are preserved with no deref run.
  if (!schemaNeedsExpansion(schema)) return { kind: "ok", schema };
  // The Convex isolate runtime (seed mutation) has no dereferencer and no Node built-ins; an
  // expansion it cannot perform is refused by name rather than looped or guessed.
  if (derefSchema === undefined)
    return { kind: "refused", reason: "admit_schema_deref_unavailable" };
  let dereferenced: SchemaRecord;
  try {
    dereferenced = await derefSchema(schema, root);
  } catch (error) {
    return { kind: "refused", reason: schemaDereferenceRefusal(error) };
  }
  const residual = residualSchemaReferenceRefusal(dereferenced as JsonValue);
  if (residual !== undefined) return { kind: "refused", reason: residual };
  return { kind: "ok", schema: dereferenced };
}

function schemaDereferenceRefusal(error: unknown): AdmitProviderSchemaRefusal {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("too_deep")) return "admit_schema_too_deep";
  if (message.includes("circular")) return "admit_schema_circular_reference";
  if (message.includes("deref_unavailable"))
    return "admit_schema_deref_unavailable";
  return "admit_schema_reference_unresolvable";
}

function schemaDepth(schema: SchemaRecord): number {
  let maximum = 0;
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: schema, depth: 0 },
  ];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    maximum = Math.max(maximum, current.depth);
    if (current.value === null || typeof current.value !== "object") continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    for (const child of children)
      pending.push({ value: child, depth: current.depth + 1 });
  }
  return maximum;
}

function schemaNeedsExpansion(
  schema: Readonly<Record<string, JsonValue>>,
): boolean {
  const pending: JsonValue[] = [schema];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (isRecord(current)) {
      if (
        "$ref" in current ||
        "allOf" in current ||
        "oneOf" in current ||
        "anyOf" in current
      )
        return true;
      pending.push(...(Object.values(current) as JsonValue[]));
    }
  }
  return false;
}

export function residualSchemaReferenceRefusal(
  schema: JsonValue,
): AdmitProviderSchemaRefusal | undefined {
  const pending: JsonValue[] = [schema];
  let hasLocal = false;
  let hasRemote = false;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (isRecord(current)) {
      const reference = current.$ref;
      if (typeof reference === "string") {
        if (reference.startsWith("#/")) hasLocal = true;
        else hasRemote = true;
      }
      pending.push(...(Object.values(current) as JsonValue[]));
    }
  }
  // A remote/absolute reference that could not be resolved (external resolution is disabled).
  if (hasRemote) return "admit_schema_reference_unresolvable";
  // A residual local pointer is an unresolved cycle left by `circular: 'ignore'`.
  if (hasLocal) return "admit_schema_circular_reference";
  return undefined;
}

// --- Input closure (only what the canonical contract already requires) --------

function imposeRequiredInputClosure(schema: SchemaRecord): SchemaRecord {
  if (
    schema.type !== "object" ||
    schema.additionalProperties === false ||
    !isRecord(schema.properties)
  ) {
    return schema;
  }
  return { ...schema, additionalProperties: false };
}

// --- Output evidence mapping + dynamic-keyed restructure ----------------------

type OutputPlan =
  | Readonly<{
      kind: "ok";
      outputSchema: SchemaRecord;
      evidencePointer: string | undefined;
    }>
  | Readonly<{ kind: "refused"; reason: AdmitProviderSchemaRefusal }>;

function planOutputEvidence(outputSchema: SchemaRecord): OutputPlan {
  const firstGuaranteed = firstGuaranteedOutputPointer(outputSchema);
  if (firstGuaranteed !== undefined) {
    return { kind: "ok", outputSchema, evidencePointer: firstGuaranteed };
  }
  if (outputSchema.type !== "object") {
    return { kind: "refused", reason: "admit_output_no_guaranteed_field" };
  }
  // RFC 6901 names the whole document with the empty pointer. Preserve the
  // provider's raw dynamic-keyed object and ground completion in that root;
  // wrapping it would make the admitted schema diverge from the HTTP response.
  return { kind: "ok", outputSchema, evidencePointer: "" };
}

function firstGuaranteedOutputPointer(
  schema: SchemaRecord,
): string | undefined {
  const isArray = Array.isArray(schema.type)
    ? schema.type.includes("array")
    : schema.type === "array";
  if (isArray) {
    if (typeof schema.minItems === "number" && schema.minItems > 0) return "/0";
  }
  if (isRecord(schema.properties) && Array.isArray(schema.required)) {
    const required = new Set(
      schema.required.filter(
        (value): value is string => typeof value === "string",
      ),
    );
    for (const name of Object.keys(schema.properties)) {
      const child = schema.properties[name];
      if (required.has(name) && (child === true || isRecord(child))) {
        return `/${escapePointerSegment(name)}`;
      }
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const candidate of schema.allOf) {
      if (isRecord(candidate)) {
        const pointer = firstGuaranteedOutputPointer(candidate as SchemaRecord);
        if (pointer !== undefined) return pointer;
      }
    }
  }
  return undefined;
}

// --- Metadata derivation (dataUse / customerAnnotations / effects / evidence) -

function deriveAdmissionMetadata(
  inputSchema: SchemaRecord,
  contract: CapabilityContractMetadata,
  evidencePointer: string | undefined,
): CapabilityContractMetadata {
  const dataUse = [...contract.dataUse];
  const effects = [...contract.effects];
  const customerAnnotations = [...contract.customerAnnotations];
  const evidence = [...contract.evidence];

  const annotatedInputPointers = new Set<string>();
  const annotationIds = new Set<string>();
  for (const annotation of contract.customerAnnotations) {
    if (annotation.document === "input")
      annotatedInputPointers.add(annotation.pointer);
    annotationIds.add(annotation.annotationId);
  }
  const coveredByDataUse = new Set<string>();
  for (const declaration of contract.dataUse)
    coveredByDataUse.add(declaration.inputPointer);

  let dataReleaseEffect = effects.find(
    (effect) => effect.class === "data_release",
  );

  const properties = inputSchema.properties;
  const requiredInputs = new Set(
    (Array.isArray(inputSchema.required) ? inputSchema.required : []).filter(
      (value): value is string => typeof value === "string",
    ),
  );
  if (isRecord(properties)) {
    for (const name of Object.keys(properties)) {
      const pointer = `/${escapePointerSegment(name)}`;
      const covered = [...coveredByDataUse].some((declaration) =>
        pointerCovers(declaration, pointer),
      );
      if (!covered) {
        if (dataReleaseEffect === undefined) {
          dataReleaseEffect = {
            effectId: uniqueIdentifier(
              "provider_data_use",
              new Set(effects.map((effect) => effect.effectId)),
            ),
            class: "data_release",
            authority: "explicit",
            reversibility: "not_applicable",
          };
          effects.push(dataReleaseEffect);
        }
        coveredByDataUse.add(pointer);
        dataUse.push({
          effectId: dataReleaseEffect.effectId,
          inputPointer: pointer,
          classification: "public",
          phase: "execution",
          recipient: { kind: "selected_binding" },
          purposes: [purposeForProperty(name, properties[name])],
        });
      }
      if (requiredInputs.has(name)) {
        const annotated = [...annotatedInputPointers].some((candidate) =>
          pointerCovers(candidate, pointer),
        );
        if (!annotated) {
          const annotationId = uniqueIdentifier(
            annotationIdFor(name),
            annotationIds,
          );
          annotationIds.add(annotationId);
          customerAnnotations.push({
            annotationId,
            document: "input",
            pointer,
            label: labelFor(name, properties[name]),
            role: "request",
            inference: "customer_required",
          });
          annotatedInputPointers.add(pointer);
        }
      }
    }
  }

  if (
    evidencePointer !== undefined &&
    !evidence.some((requirement) => requirement.purpose === "completion")
  ) {
    const annotationId = uniqueIdentifier("completion_evidence", annotationIds);
    annotationIds.add(annotationId);
    customerAnnotations.push({
      annotationId,
      document: "output",
      pointer: evidencePointer,
      label: "Result",
      role: "completion_evidence",
    });
    evidence.push({
      evidenceId: uniqueIdentifier(
        "completion",
        new Set(evidence.map((requirement) => requirement.evidenceId)),
      ),
      outputPointer: evidencePointer,
      purpose: "completion",
    });
  }

  return { ...contract, customerAnnotations, dataUse, effects, evidence };
}

// --- Small deterministic helpers ----------------------------------------------

function pointerCovers(parent: string, child: string): boolean {
  return parent === child || child.startsWith(`${parent}/`);
}

function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function recordHasKey(value: unknown, key: string): boolean {
  return isRecord(value) && Object.hasOwn(value, key);
}

function slugToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueIdentifier(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function annotationIdFor(name: string): string {
  return (
    slugToken(name)
      .toLowerCase()
      .replace(/^_+|_+$/g, "") || "input"
  );
}

function descriptionOf(schema: JsonValue | undefined): string | undefined {
  if (schema !== null && typeof schema === "object" && !Array.isArray(schema)) {
    const description = (schema as Readonly<{ description?: unknown }>)
      .description;
    if (typeof description === "string") return description;
  }
  return undefined;
}

function purposeForProperty(
  name: string,
  schema: JsonValue | undefined,
): string {
  const description = descriptionOf(schema);
  if (description !== undefined && description.trim().length > 0) {
    return slugToken(description).toLowerCase();
  }
  return `provide_${annotationIdFor(name)}`;
}

function labelFor(name: string, schema: JsonValue | undefined): string {
  return descriptionOf(schema) ?? name;
}
