import {
  jsonValueSchema,
  type JsonValue,
} from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";

const MAX_SCHEMA_BYTES = 65_536;
const MAX_SCHEMA_DEPTH = 24;
const MAX_SCHEMA_PROPERTIES = 128;
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
    throw new Error("operation_public_schema_wire_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("operation_public_schema_wire_invalid");
  }
  const checked = jsonValueSchema.safeParse(parsed);
  if (!checked.success || !isRecord(checked.data)) {
    throw new Error("operation_public_schema_wire_invalid");
  }
  return projectPublicSchema(
    checked.data as Readonly<Record<string, JsonValue>>,
  );
}

export function projectPublicSchema(
  schema: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  const state = { depth: 0, properties: 0, refs: 0 };
  const projected = projectSchemaValue(schema, state);
  if (
    new TextEncoder().encode(JSON.stringify(projected)).byteLength >
    MAX_SCHEMA_BYTES
  )
    throw new Error("operation_public_schema_too_large");
  return projected as Readonly<Record<string, JsonValue>>;
}
function projectSchemaValue(
  value: JsonValue,
  state: { depth: number; properties: number; refs: number },
): JsonValue {
  if (state.depth > MAX_SCHEMA_DEPTH)
    throw new Error("operation_public_schema_too_deep");
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
      throw new Error("operation_public_schema_keyword_unsupported");
    if (key === "$ref") {
      state.refs += 1;
      if (
        state.refs > MAX_SCHEMA_REFS ||
        typeof child !== "string" ||
        !child.startsWith("#/")
      ) {
        throw new Error("operation_public_schema_ref_invalid");
      }
    }
    if (
      key === "properties" ||
      key === "$defs" ||
      key === "patternProperties"
    ) {
      if (!isRecord(child))
        throw new Error("operation_public_schema_properties_invalid");
      const childObject = child as Readonly<Record<string, JsonValue>>;
      state.properties += Object.keys(childObject).length;
      if (state.properties > MAX_SCHEMA_PROPERTIES)
        throw new Error("operation_public_schema_properties_exceeded");
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
