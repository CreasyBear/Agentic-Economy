import {
  jsonValueSchema,
  type JsonValue,
} from "@/modules/capability-contract/public";
import { degradeBackend } from "@/lib/observability/degrade-backend";
import { isRecord } from "@/modules/common/is-record";

const MAX_SCHEMA_BYTES = 131_072;
const MAX_SCHEMA_DEPTH = 64;
const MAX_SCHEMA_REFS = 64;
const SCHEMA_KEYS = new Set([
  "$defs",
  "$ref",
  "$schema",
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "contains",
  "default",
  "definitions",
  "dependentRequired",
  "dependentSchemas",
  "deprecated",
  "description",
  "enum",
  "examples",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "if",
  "items",
  "maxContains",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minContains",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "multipleOf",
  "not",
  "oneOf",
  "pattern",
  "patternProperties",
  "prefixItems",
  "properties",
  "propertyNames",
  "readOnly",
  "required",
  "then",
  "title",
  "type",
  "unevaluatedItems",
  "unevaluatedProperties",
  "uniqueItems",
  "writeOnly",
]);

export function decodePublicSchema(
  serialized: string,
): Readonly<Record<string, JsonValue>> {
  if (new TextEncoder().encode(serialized).byteLength > MAX_SCHEMA_BYTES) {
    throw new Error("tool_public_schema_wire_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (cause) {
    degradeBackend(cause, undefined, {
      site: "decodePublicSchema", reason: "invalid_response",
    });
    throw new Error("tool_public_schema_wire_invalid", { cause });
  }
  const checked = jsonValueSchema.safeParse(parsed);
  if (!checked.success || !isRecord(checked.data)) {
    throw new Error("tool_public_schema_wire_invalid");
  }
  return projectPublicSchema(
    checked.data as Readonly<Record<string, JsonValue>>,
  );
}

export function projectPublicSchema(
  schema: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  const state = { depth: 0, refs: 0 };
  const projected = projectSchemaValue(schema, state);
  if (
    new TextEncoder().encode(JSON.stringify(projected)).byteLength >
    MAX_SCHEMA_BYTES
  )
    throw new Error("tool_public_schema_too_large");
  return projected as Readonly<Record<string, JsonValue>>;
}
function projectSchemaValue(
  value: JsonValue,
  state: { depth: number; refs: number },
): JsonValue {
  if (state.depth > MAX_SCHEMA_DEPTH)
    throw new Error("tool_public_schema_too_deep");
  if (Array.isArray(value)) {
    state.depth += 1;
    const result = value.map((item) => projectSchemaValue(item, state));
    state.depth -= 1;
    return result;
  }
  if (!isRecord(value)) return value;
  state.depth += 1;
  const object = value as Readonly<Record<string, JsonValue>>;
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(object)) {
    if (!SCHEMA_KEYS.has(key))
      throw new Error("tool_public_schema_keyword_unsupported");
    // These values are JSON data, not nested schemas with schema-key names.
    if (key === "const" || key === "enum" || key === "default" || key === "examples") {
      result[key] = child;
      continue;
    }
    if (key === "$ref") {
      state.refs += 1;
      if (
        state.refs > MAX_SCHEMA_REFS ||
        typeof child !== "string" ||
        !child.startsWith("#/")
      ) {
        throw new Error("tool_public_schema_ref_invalid");
      }
    }
    if (
      key === "properties" ||
      key === "$defs" ||
      key === "definitions" ||
      key === "patternProperties"
    ) {
      if (!isRecord(child))
        throw new Error("tool_public_schema_properties_invalid");
      const childObject = child as Readonly<Record<string, JsonValue>>;
      result[key] = Object.fromEntries(
        Object.entries(childObject).map(([childKey, childValue]) => [
          childKey,
          projectSchemaValue(childValue, state),
        ]),
      );
    } else {
      result[key] = projectSchemaValue(child, state);
    }
  }
  state.depth -= 1;
  return result;
}
