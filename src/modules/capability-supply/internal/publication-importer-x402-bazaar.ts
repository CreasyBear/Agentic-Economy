import {
  isBoundedJsonValue,
  type JsonValue,
} from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";
import {
  extractDiscoveryInfoFromExtension,
  validateAndExtract,
  type DiscoveryExtension,
} from "@x402/extensions/bazaar";

const JSON_SCHEMA = "https://json-schema.org/draft/2020-12/schema";
const BAZAAR_KEY = "bazaar";
const MAX_SCHEMA_PROPERTIES = 64;
const PROPERTY_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/u;

export type BazaarAdmissionQuery = readonly Readonly<{
  inputPointer: string;
  parameter: string;
  required?: boolean;
}>[];

export type BazaarAdmission =
  | Readonly<{ kind: "absent" }>
  | Readonly<{
      kind: "refused";
      reason:
        | "bazaar_discovery_invalid"
        | "schema_missing"
        | "selector_invalid"
        | "transport_unsupported";
    }>
  | Readonly<{
      kind: "admitted";
      method: "GET" | "POST";
      inputSchema: Readonly<Record<string, JsonValue>>;
      outputSchema: Readonly<Record<string, JsonValue>>;
      query: BazaarAdmissionQuery | undefined;
    }>;

export type BazaarDiscoveryInfo = Readonly<{
  input: Readonly<Record<string, unknown>>;
  output: unknown;
}>;

/**
 * Raw Bazaar extensions are admitted only by the Node discovery action. The
 * shared importer fails closed when it sees one so it cannot bypass that
 * runtime boundary.
 */
export function admitBazaarFromPaymentRequired(
  paymentRequired: unknown,
): BazaarAdmission {
  if (!isRecord(paymentRequired)) return { kind: "absent" };
  const extensions = paymentRequired.extensions;
  if (!isRecord(extensions) || !(BAZAAR_KEY in extensions)) {
    return { kind: "absent" };
  }
  const extension = extensions[BAZAAR_KEY];
  if (!isRecord(extension)) {
    return { kind: "refused", reason: "bazaar_discovery_invalid" };
  }
  const discoveryExtension = extension as DiscoveryExtension;
  try {
    const validation = validateAndExtract(discoveryExtension);
    if (!validation.valid) {
      return { kind: "refused", reason: "bazaar_discovery_invalid" };
    }
    const info = extractDiscoveryInfoFromExtension(discoveryExtension, false);
    return admitBazaarDiscoveryInfo(extension, {
      input: info.input as Readonly<Record<string, unknown>>,
      output: info.output,
    });
  } catch {
    return { kind: "refused", reason: "bazaar_discovery_invalid" };
  }
}

/**
 * Applies AE's bounded HTTP/schema profile to info already extracted by the
 * official Bazaar SDK in the Node discovery action.
 */
export function admitBazaarDiscoveryInfo(
  extension: Readonly<Record<string, unknown>>,
  info: BazaarDiscoveryInfo,
): BazaarAdmission {
  if (info.input.type !== "http") {
    return { kind: "refused", reason: "transport_unsupported" };
  }

  const input = info.input;
  const method = input.method;
  if (method !== "GET" && method !== "POST") {
    return { kind: "refused", reason: "selector_invalid" };
  }

  if (method === "GET") {
    if ("bodyType" in input) {
      return { kind: "refused", reason: "transport_unsupported" };
    }
    if (!isRecord(input.queryParams)) {
      return { kind: "refused", reason: "selector_invalid" };
    }
  } else {
    if (!("bodyType" in input) || input.bodyType !== "json") {
      return { kind: "refused", reason: "transport_unsupported" };
    }
    if (!isRecord(input.body)) {
      return { kind: "refused", reason: "selector_invalid" };
    }
  }

  const inputSchema = inputSchemaFromExtension(extension, method);
  const outputSchema = outputSchemaFromInfo(info.output);
  if (inputSchema === undefined || outputSchema === undefined) {
    return { kind: "refused", reason: "schema_missing" };
  }
  if (method === "GET") {
    const query = queryMappingFromInputSchema(inputSchema);
    if (query === undefined) {
      return { kind: "refused", reason: "selector_invalid" };
    }
    return { kind: "admitted", method, inputSchema, outputSchema, query };
  }
  return {
    kind: "admitted",
    method,
    inputSchema,
    outputSchema,
    query: undefined,
  };
}

function inputSchemaFromExtension(
  extension: Readonly<Record<string, unknown>>,
  method: "GET" | "POST",
): Readonly<Record<string, JsonValue>> | undefined {
  const schema = isRecord(extension.schema) ? extension.schema : undefined;
  const properties = isRecord(schema?.properties)
    ? schema.properties
    : undefined;
  const input = isRecord(properties?.input) ? properties.input : undefined;
  const inputProperties = isRecord(input?.properties)
    ? input.properties
    : undefined;
  const source = method === "GET"
    ? inputProperties?.queryParams
    : inputProperties?.body;
  return objectJsonSchema(source);
}

function outputSchemaFromInfo(
  output: unknown,
): Readonly<Record<string, JsonValue>> | undefined {
  if (!isRecord(output) || !isRecord(output.example)) return undefined;
  return isBoundedJsonValue(output.example)
    ? jsonSchemaFromExampleObject(output.example)
    : undefined;
}

function objectJsonSchema(
  value: unknown,
): Readonly<Record<string, JsonValue>> | undefined {
  if (
    !isRecord(value) ||
    value.type !== "object" ||
    !isRecord(value.properties) ||
    Object.keys(value.properties).length > MAX_SCHEMA_PROPERTIES ||
    !isBoundedJsonValue(value)
  ) {
    return undefined;
  }
  const properties: Record<string, JsonValue> = {};
  for (const [name, schema] of Object.entries(value.properties)) {
    if (!PROPERTY_NAME.test(name) || !isBoundedJsonValue(schema)) {
      return undefined;
    }
    properties[name] = schema;
  }
  const required = value.required;
  if (
    required !== undefined &&
    (!Array.isArray(required) ||
      required.length > Object.keys(properties).length ||
      required.some(
        (item) =>
          typeof item !== "string" ||
          !Object.hasOwn(properties, item),
      ) ||
      new Set(required).size !== required.length)
  ) {
    return undefined;
  }
  return {
    $schema: JSON_SCHEMA,
    type: "object",
    properties,
    ...(required === undefined || required.length === 0 ? {} : { required }),
    additionalProperties: false,
  };
}

function jsonSchemaFromExampleObject(
  example: Readonly<Record<string, unknown>>,
): Readonly<Record<string, JsonValue>> | undefined {
  const names = Object.keys(example);
  if (names.length < 1 || names.length > MAX_SCHEMA_PROPERTIES) {
    return undefined;
  }
  const properties: Record<string, JsonValue> = {};
  const required: string[] = [];
  for (const [name, value] of Object.entries(example)) {
    if (!PROPERTY_NAME.test(name)) return undefined;
    const schema = jsonSchemaFromExampleValue(value);
    if (schema === undefined) return undefined;
    properties[name] = schema;
    required.push(name);
  }
  return {
    $schema: JSON_SCHEMA,
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function jsonSchemaFromExampleValue(value: unknown): JsonValue | undefined {
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "number" };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  if (Array.isArray(value)) {
    const item = value[0];
    const items = jsonSchemaFromExampleValue(item ?? "");
    return items === undefined ? undefined : { type: "array", items };
  }
  if (isRecord(value)) {
    const nested = jsonSchemaFromExampleObject(value);
    if (nested === undefined) return undefined;
    const { $schema: _schema, ...rest } = nested;
    return rest;
  }
  return undefined;
}

function queryMappingFromInputSchema(
  inputSchema: Readonly<Record<string, JsonValue>>,
): BazaarAdmissionQuery | undefined {
  if (!isRecord(inputSchema.properties)) return undefined;
  const names = Object.keys(inputSchema.properties);
  if (names.length < 1) return undefined;
  const required = new Set(
    Array.isArray(inputSchema.required)
      ? inputSchema.required.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  );
  return names.map((name) => ({
    inputPointer: `/${name}`,
    parameter: name,
    required: required.has(name),
  }));
}
