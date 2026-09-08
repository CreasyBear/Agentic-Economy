import {
  isBoundedJsonValue,
  validateJsonSchema,
  type JsonValue,
} from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";

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
      inputExample?: Readonly<Record<string, JsonValue>>;
      bodyPointer?: "/body";
      queryObjectPointer?: "/query";
      outputSchema: Readonly<Record<string, JsonValue>>;
      query?: BazaarAdmissionQuery;
      path?: BazaarAdmissionQuery;
      pathTemplate?: string;
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
  return { kind: "refused", reason: "bazaar_discovery_invalid" };
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
  if ("headers" in input) {
    return { kind: "refused", reason: "transport_unsupported" };
  }

  if (method === "GET") {
    if ("bodyType" in input || "body" in input) {
      return { kind: "refused", reason: "transport_unsupported" };
    }
  } else {
    if ("queryParams" in input) {
      return { kind: "refused", reason: "transport_unsupported" };
    }
    if (!("bodyType" in input) || input.bodyType !== "json") {
      return { kind: "refused", reason: "transport_unsupported" };
    }
  }

  const declared = inputSchemaFromExtension(extension, method);
  const schema = isRecord(extension.schema) ? extension.schema : undefined;
  const properties = isRecord(schema?.properties) ? schema.properties : undefined;
  const inputDeclaration = isRecord(properties?.input) ? properties.input : undefined;
  const inputProperties = isRecord(inputDeclaration?.properties) ? inputDeclaration.properties : undefined;
  const declaredRequest = inputProperties?.[method === "GET" ? "queryParams" : "body"];
  if (declared === undefined && isRecord(declaredRequest) && Object.hasOwn(declaredRequest, "properties")) {
    return { kind: "refused", reason: "schema_missing" };
  }
  const noInput = method === "GET" && isRecord(input.queryParams) && Object.keys(input.queryParams).length === 0;
  const baseInputSchema: Readonly<Record<string, JsonValue>> = declared ?? (noInput
    ? { $schema: JSON_SCHEMA, type: "object", properties: {}, additionalProperties: false }
    : requestEnvelope(method, method === "POST" && isRecord(declaredRequest) && declaredRequest.type !== "object" && isBoundedJsonValue(declaredRequest) ? declaredRequest as Readonly<Record<string, JsonValue>> : undefined));
  const outputSchema = outputSchemaFromExtension(extension, info.output);
  if (outputSchema === undefined) return { kind: "refused", reason: "schema_missing" };
  const pathNames = typeof extension.routeTemplate === "string"
    ? [...extension.routeTemplate.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].flatMap(match => match[1] === undefined ? [] : [match[1]]) : [];
  if (pathNames.length > 32 || new Set(pathNames).size !== pathNames.length
    || (isRecord(input.pathParams) && Object.keys(input.pathParams).some(name => !pathNames.includes(name)))) {
    return { kind: "refused", reason: "transport_unsupported" };
  }
  const pathDeclaration = isRecord(inputProperties?.pathParams) ? inputProperties.pathParams : undefined;
  const declaredPathProperties = isRecord(pathDeclaration?.properties) ? pathDeclaration.properties : {};
  const pathProperties: Record<string, JsonValue> = {};
  for (const name of pathNames) {
    const field = declaredPathProperties[name] ?? { type: "string" };
    if (!isBoundedJsonValue(field)) return { kind: "refused", reason: "schema_missing" };
    pathProperties[name] = field;
  }
  if (pathNames.length > 0 && isRecord(baseInputSchema.properties) && Object.hasOwn(baseInputSchema.properties, "pathParams")) {
    return { kind: "refused", reason: "selector_invalid" };
  }
  const inputSchema: Readonly<Record<string, JsonValue>> = pathNames.length === 0 ? baseInputSchema : {
    ...baseInputSchema,
    properties: { ...(isRecord(baseInputSchema.properties) ? baseInputSchema.properties as Record<string, JsonValue> : {}),
      pathParams: { type: "object", properties: pathProperties, required: pathNames, additionalProperties: false } },
    required: [...(Array.isArray(baseInputSchema.required) ? baseInputSchema.required : []), "pathParams"],
  };
  const baseExample = declared === undefined ? undefined : inputExampleFromInfo(input, method, baseInputSchema);
  const example = pathNames.length === 0 ? baseExample
    : isRecord(input.pathParams) && isBoundedJsonValue(input.pathParams) && baseExample !== undefined
      ? { ...baseExample, pathParams: input.pathParams } : undefined;
  const inputExample = example !== undefined && validateJsonSchema(inputSchema, example) ? example : undefined;
  const transport = method === "POST"
    ? (declared === undefined ? { bodyPointer: "/body" as const } : {})
    : declared === undefined && !noInput
      ? { queryObjectPointer: "/query" as const }
      : { query: queryMappingFromInputSchema(baseInputSchema) ?? [] };
  return { kind: "admitted", method, inputSchema, outputSchema,
    ...(pathNames.length === 0 ? {} : {
      path: pathNames.map(parameter => ({ inputPointer: `/pathParams/${parameter}`, parameter, required: true })),
      pathTemplate: (extension.routeTemplate as string).replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}'),
    }),
    ...(inputExample === undefined ? {} : { inputExample }), ...transport };
}

const JSON_VALUE_SCHEMA: Readonly<Record<string, JsonValue>> = {
  type: ["object", "array", "string", "number", "boolean", "null"],
};
function requestEnvelope(method: "GET" | "POST", declaredBody?: Readonly<Record<string, JsonValue>>): Readonly<Record<string, JsonValue>> {
  const name = method === "POST" ? "body" : "query";
  const primitive = { type: ["string", "number", "boolean"] };
  return {
    $schema: JSON_SCHEMA, type: "object", required: [name], additionalProperties: false,
    properties: { [name]: method === "POST" ? (declaredBody ?? JSON_VALUE_SCHEMA) : {
      type: "object", maxProperties: 64,
      propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9_.-]{0,99}$" },
      additionalProperties: { anyOf: [primitive, { type: "array", items: primitive }] },
    } },
  };
}

function inputExampleFromInfo(
  input: Readonly<Record<string, unknown>>,
  method: "GET" | "POST",
  inputSchema: Readonly<Record<string, JsonValue>> | undefined,
): Readonly<Record<string, JsonValue>> | undefined {
  const candidate = method === "GET" ? input.queryParams : input.body;
  if (
    inputSchema === undefined ||
    !isRecord(candidate) ||
    !isBoundedJsonValue(candidate)
  ) {
    return undefined;
  }
  // `next_token` is a public pagination input in the admitted transport, but
  // persisting a concrete cursor would be indistinguishable from fixed token
  // material to the publication credential guard. A provider example does not
  // need the optional cursor to teach or probe the first page, so omit it and
  // then prove the remaining source example still conforms to the exact schema.
  const sanitized = Object.fromEntries(
    Object.entries(candidate).filter(([name]) => name !== "next_token"),
  );
  if (
    !isBoundedJsonValue(sanitized) ||
    !validateJsonSchema(inputSchema, sanitized)
  ) {
    return undefined;
  }
  return sanitized as Readonly<Record<string, JsonValue>>;
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

function outputSchemaFromExtension(
  extension: Readonly<Record<string, unknown>>,
  output: unknown,
): Readonly<Record<string, JsonValue>> | undefined {
  if (output !== undefined && (!isRecord(output) || output.type !== "json")) return undefined;
  const schema = isRecord(extension.schema) ? extension.schema : undefined;
  const properties = isRecord(schema?.properties) ? schema.properties : undefined;
  const outputDeclaration = isRecord(properties?.output) ? properties.output : undefined;
  const outputProperties = isRecord(outputDeclaration?.properties) ? outputDeclaration.properties : undefined;
  const declared = outputProperties?.example;
  if (isRecord(declared) && isBoundedJsonValue(declared) && Object.keys(declared).length > 0) {
    return declared as Readonly<Record<string, JsonValue>>;
  }
  return { $schema: JSON_SCHEMA, ...JSON_VALUE_SCHEMA };
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
    ...value,
    $schema: JSON_SCHEMA,
    type: "object",
    properties,
    ...(required === undefined || required.length === 0 ? {} : { required }),
    additionalProperties: false,
  };
}

function queryMappingFromInputSchema(
  inputSchema: Readonly<Record<string, JsonValue>>,
): BazaarAdmissionQuery | undefined {
  if (!isRecord(inputSchema.properties)) return undefined;
  const names = Object.keys(inputSchema.properties);

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
