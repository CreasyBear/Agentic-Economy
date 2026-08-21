import type { JsonValue } from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";

import {
  admitProviderSchema,
  residualSchemaReferenceRefusal,
  type AdmitCredentialSpec,
  type AdmitProviderSchemaRefusal,
  type SchemaDereferencer,
} from "./admit-provider-schema";
import { publicationMaterialContainsCredential } from "./publication/source";
import {
  MAX_TOOL_NAME_LENGTH,
  boundedTrimmed,
  inspectSource,
  normalizedFromSchemas,
  validHttpsUrl,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportRefusal,
  type CapabilityPublicationImportResult,
  type OpenApiDocumentPreflightResult,
  type OpenApiOperationPreflightOutcome,
} from "./publication-importer-types";
import {
  type HttpJsonHeaderParameterMapping,
  type HttpJsonPathParameterMapping,
  type HttpJsonQueryParameterMapping,
} from "./transport-adapters";

const OPENAPI_PREFLIGHT_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
] as const;
const MAX_OPENAPI_PREFLIGHT_OPERATIONS = 128;

export async function importOpenApiHttpCapability(
  input: Extract<CapabilityPublicationImport, { kind: "openapi_http" }>,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  const bounded = inspectSource(input.document);
  if (bounded.kind === "refused") return bounded;
  if (publicationMaterialContainsCredential(input.document)) {
    return { kind: "refused", reason: "source_invalid" };
  }
  if (!isRecord(input.document)) {
    return { kind: "refused", reason: "source_invalid" };
  }
  if (
    typeof input.document.openapi !== "string" ||
    !input.document.openapi.startsWith("3.1.")
  ) {
    return { kind: "refused", reason: "source_version_unsupported" };
  }
  if (!validPath(input.operation.path)) {
    return { kind: "refused", reason: "selector_invalid" };
  }
  const servers = input.document.servers;
  if (
    !Array.isArray(servers) ||
    servers.length !== 1 ||
    !isRecord(servers[0]) ||
    typeof servers[0].url !== "string"
  ) {
    return { kind: "refused", reason: "transport_unsupported" };
  }
  const baseUrl = validHttpsUrl(servers[0].url);
  if (baseUrl === undefined)
    return { kind: "refused", reason: "transport_unsupported" };
  const paths = input.document.paths;
  const rawPathItem = isRecord(paths) ? paths[input.operation.path] : undefined;
  const pathItemResult = await resolveOpenApiRecord(
    rawPathItem,
    input.document,
    derefSchema,
  );
  if (pathItemResult.kind === "refused") return pathItemResult;
  if (pathItemResult.value === undefined)
    return { kind: "refused", reason: "operation_not_found" };
  const operationResult = await resolveOpenApiRecord(
    pathItemResult.value[input.operation.method],
    input.document,
    derefSchema,
  );
  if (operationResult.kind === "refused") return operationResult;
  if (operationResult.value === undefined)
    return { kind: "refused", reason: "operation_not_found" };
  const operation = operationResult.value;
  const credential = resolveOpenApiCredential(input.document, operation);
  if (credential.kind === "refused")
    return { kind: "refused", reason: "transport_unsupported" };
  const credentialRequired = credential.spec.kind !== "keyless";
  if (
    credentialRequired !==
    (input.commercial.authority.kind === "provider_connection")
  ) {
    return { kind: "refused", reason: "commercial_metadata_inconsistent" };
  }
  if (
    fixedQueryContainsCredential(input.fixedQuery, credential.parameterNames)
  ) {
    return { kind: "refused", reason: "commercial_metadata_inconsistent" };
  }
  const fixedParameterNames = new Set(
    (input.fixedQuery ?? []).map(({ parameter }) => parameter),
  );
  const excludedParameters = openApiParameterExclusions(
    credential,
    fixedParameterNames,
  );
  const analysis = await analyzeOpenApiOperation(
    operation,
    pathItemResult.value.parameters,
    input.operation.path,
    input.operation.method,
    excludedParameters,
    input.document,
    derefSchema,
  );
  if (analysis.kind === "refused") return analysis;
  const fixedQuery = fixedQueryMapping(
    input.fixedQuery,
    analysis.analysis.parameters.query,
  );
  if (fixedQuery === undefined)
    return { kind: "refused", reason: "selector_invalid" };
  const admit = await admitProviderSchema(
    {
      inputSchema: analysis.analysis.inputSchema,
      outputSchema: analysis.analysis.outputContent.schema,
      contract: input.contract,
      authority: input.commercial.authority,
      credential: analysis.analysis.credential.spec,
      resolutionRoot: input.document,
      credentialParameterNames: analysis.analysis.credential.parameterNames,
    },
    derefSchema,
  );
  if (admit.kind === "refused")
    return { kind: "refused", reason: admit.reason };
  const endpoint = new URL(
    input.operation.path.replace(/^\/+/, ""),
    ensureTrailingSlash(baseUrl),
  ).toString();
  const credentialConfig: JsonValue =
    analysis.analysis.credential.spec.kind === "keyless"
      ? { kind: "none" as const }
      : analysis.analysis.credential.spec.kind === "api_key"
        ? {
            kind: "api_key" as const,
            location: analysis.analysis.credential.spec.location,
            name: analysis.analysis.credential.spec.name,
          }
        : { kind: "bearer" as const };
  return normalizedFromSchemas({
    source: {
      kind: "openapi_http",
      descriptorDigest: bounded.digest,
      selector: input.operation,
      evidenceRefs: input.evidenceRefs,
    },
    contract: admit.contract,
    inputSchema: admit.inputSchema,
    outputSchema: admit.outputSchema,
    commercial: input.commercial,
    endpointUrl: endpoint,
    adapter: {
      adapterId: "http-json:v1",
      config: {
        method:
          input.operation.method === "get"
            ? ("GET" as const)
            : ("POST" as const),
        ...(analysis.analysis.parameters.query.length === 0
          ? {}
          : { query: analysis.analysis.parameters.query }),
        ...(analysis.analysis.parameters.path.length === 0
          ? {}
          : { path: analysis.analysis.parameters.path }),
        ...(analysis.analysis.parameters.headers.length === 0
          ? {}
          : { headers: analysis.analysis.parameters.headers }),
        ...(fixedQuery.length === 0 ? {} : { fixedQuery }),
        ...(analysis.analysis.requestContent === undefined
          ? {}
          : { requestContentType: analysis.analysis.requestContent.mediaType }),
        responseContentType: analysis.analysis.outputContent.mediaType,
        responseStatus: analysis.analysis.responseStatus,
        requestTimeoutMs: input.commercial.requestTimeoutMs,
        credential: credentialConfig,
      },
    },
  });
}

export async function preflightOpenApiHttpDocument(
  document: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiDocumentPreflightResult> {
  const bounded = inspectSource(document);
  if (bounded.kind === "refused") return bounded;
  if (!isRecord(document)) return { kind: "refused", reason: "source_invalid" };
  if (
    typeof document.openapi !== "string" ||
    !document.openapi.startsWith("3.1.")
  ) {
    return { kind: "refused", reason: "source_version_unsupported" };
  }
  if (!isRecord(document.paths))
    return { kind: "refused", reason: "schema_missing" };
  const server =
    Array.isArray(document.servers) &&
    document.servers.length === 1 &&
    isRecord(document.servers[0]) &&
    typeof document.servers[0].url === "string"
      ? validHttpsUrl(document.servers[0].url)
      : undefined;
  const globalUnsafeReason: CapabilityPublicationImportRefusal | undefined =
    publicationMaterialContainsCredential(document)
      ? "source_invalid"
      : server === undefined
        ? "transport_unsupported"
        : undefined;
  const outcomes: OpenApiOperationPreflightOutcome[] = [];
  let truncated = false;
  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    const pathItemResult = await resolveOpenApiRecord(
      rawPathItem,
      document,
      derefSchema,
    );
    const pathItem =
      pathItemResult.kind === "resolved" ? pathItemResult.value : undefined;
    const methods =
      pathItem === undefined
        ? OPENAPI_PREFLIGHT_METHODS.filter(
            (method) => isRecord(rawPathItem) && method in rawPathItem,
          )
        : OPENAPI_PREFLIGHT_METHODS.filter((method) => method in pathItem);
    for (const method of methods) {
      if (outcomes.length >= MAX_OPENAPI_PREFLIGHT_OPERATIONS) {
        truncated = true;
        break;
      }
      const selector = { path, method };
      if (globalUnsafeReason !== undefined) {
        outcomes.push({ selector, kind: "unsafe", reason: globalUnsafeReason });
        continue;
      }
      if (pathItemResult.kind === "refused") {
        outcomes.push({
          selector,
          kind: "unsupported_shape",
          reason: pathItemResult.reason,
        });
        continue;
      }
      if (
        !validPath(path) ||
        pathItem === undefined ||
        !isRecord(pathItem[method])
      ) {
        outcomes.push({
          selector,
          kind: "unsupported_shape",
          reason: "openapi_operation_unsupported",
        });
        continue;
      }
      const operationResult = await resolveOpenApiRecord(
        pathItem[method],
        document,
        derefSchema,
      );
      if (
        operationResult.kind === "refused" ||
        operationResult.value === undefined
      ) {
        outcomes.push({
          selector,
          kind: "unsupported_shape",
          reason:
            operationResult.kind === "refused"
              ? operationResult.reason
              : "openapi_operation_unsupported",
        });
        continue;
      }
      const credential = resolveOpenApiCredential(
        document,
        operationResult.value,
      );
      if (credential.kind === "refused") {
        outcomes.push({
          selector,
          kind: "unsafe",
          reason: "transport_unsupported",
        });
        continue;
      }
      const analysis = await analyzeOpenApiOperation(
        operationResult.value,
        pathItem.parameters,
        path,
        method,
        openApiParameterExclusions(credential, new Set()),
        document,
        derefSchema,
      );
      if (analysis.kind === "refused") {
        outcomes.push({
          selector,
          kind:
            analysis.reason === "transport_unsupported"
              ? "unsafe"
              : "unsupported_shape",
          reason: analysis.reason,
        });
        continue;
      }
      if (analysis.analysis.credential.spec.kind !== "keyless") {
        outcomes.push({
          selector,
          kind: "credential_required",
          credential:
            analysis.analysis.credential.spec.kind === "api_key"
              ? {
                  kind: "api_key",
                  location: analysis.analysis.credential.spec.location,
                  name: analysis.analysis.credential.spec.name,
                }
              : { kind: "http_bearer" },
        });
      } else {
        outcomes.push({ selector, kind: "executable" });
      }
    }
    if (truncated) break;
  }
  return {
    kind: "preflighted",
    sourceDigest: bounded.digest,
    outcomes,
    truncated,
  };
}

type OpenApiParameterMappingsResult =
  | Readonly<{
      kind: "mapped";
      schema: Readonly<Record<string, JsonValue>>;
      query: readonly HttpJsonQueryParameterMapping[];
      path: readonly HttpJsonPathParameterMapping[];
      headers: readonly HttpJsonHeaderParameterMapping[];
    }>
  | Readonly<{
      kind: "refused";
      reason: CapabilityPublicationImportRefusal;
    }>;

function openApiParameterMappingsRefusal(
  reason: CapabilityPublicationImportRefusal,
): OpenApiParameterMappingsResult {
  return { kind: "refused", reason };
}

type OpenApiRecordResolution =
  | Readonly<{
      kind: "resolved";
      value: Readonly<Record<string, unknown>> | undefined;
    }>
  | Readonly<{ kind: "refused"; reason: CapabilityPublicationImportRefusal }>;

type OpenApiJsonContent = Readonly<{
  schema: Readonly<Record<string, JsonValue>>;
  mediaType: string;
}>;

type OpenApiParameterExclusions = Readonly<{
  query: ReadonlySet<string>;
  header: ReadonlySet<string>;
}>;

type OpenApiCredentialResolution =
  | Readonly<{
      kind: "resolved";
      spec: AdmitCredentialSpec;
      parameterNames: readonly string[];
    }>
  | Readonly<{ kind: "refused" }>;

type OpenApiOperationAnalysis = Readonly<{
  credential: Extract<OpenApiCredentialResolution, { kind: "resolved" }>;
  parameters: Extract<OpenApiParameterMappingsResult, { kind: "mapped" }>;
  inputSchema: Readonly<Record<string, JsonValue>>;
  requestContent?: OpenApiJsonContent;
  responseStatus: number;
  outputContent: OpenApiJsonContent;
}>;

type OpenApiOperationAnalysisResult =
  | Readonly<{ kind: "analyzed"; analysis: OpenApiOperationAnalysis }>
  | Readonly<{ kind: "refused"; reason: CapabilityPublicationImportRefusal }>;

async function resolveOpenApiRecord(
  value: unknown,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiRecordResolution> {
  if (value === undefined) return { kind: "resolved", value: undefined };
  if (!isRecord(value)) {
    return { kind: "refused", reason: "source_invalid" };
  }
  if (typeof value.$ref !== "string") return { kind: "resolved", value };
  if (derefSchema === undefined)
    return { kind: "refused", reason: "admit_schema_deref_unavailable" };
  try {
    const resolved = await derefSchema(
      value as Readonly<Record<string, JsonValue>>,
      root,
    );
    const residual = residualSchemaReferenceRefusal(resolved as JsonValue);
    if (residual !== undefined) return { kind: "refused", reason: residual };
    return {
      kind: "resolved",
      value: resolved as Readonly<Record<string, unknown>>,
    };
  } catch (error) {
    return { kind: "refused", reason: schemaDereferenceRefusal(error) };
  }
}

function schemaDereferenceRefusal(error: unknown): AdmitProviderSchemaRefusal {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("too_deep")) return "admit_schema_too_deep";
  if (message.includes("circular")) return "admit_schema_circular_reference";
  if (message.includes("deref_unavailable"))
    return "admit_schema_deref_unavailable";
  return "admit_schema_reference_unresolvable";
}

function jsonContentDocument(content: unknown): OpenApiJsonContent | undefined {
  if (!isRecord(content)) return undefined;
  const candidates = Object.entries(content)
    .map(([mediaType, value]) => ({
      mediaType,
      baseMediaType: mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "",
      value,
    }))
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        value: Readonly<Record<string, JsonValue>>;
      } =>
        (entry.baseMediaType === "application/json" ||
          entry.baseMediaType.endsWith("+json")) &&
        isRecord(entry.value) &&
        isRecord(entry.value.schema),
    )
    .sort((left, right) => {
      const leftExact = left.baseMediaType === "application/json" ? 0 : 1;
      const rightExact = right.baseMediaType === "application/json" ? 0 : 1;
      return (
        leftExact - rightExact || left.mediaType.localeCompare(right.mediaType)
      );
    });
  const first = candidates[0];
  return first === undefined
    ? undefined
    : {
        schema: first.value.schema as Readonly<Record<string, JsonValue>>,
        mediaType: first.baseMediaType,
      };
}

function openApiParameterExclusions(
  credential: Extract<OpenApiCredentialResolution, { kind: "resolved" }>,
  fixedQueryNames: ReadonlySet<string>,
): OpenApiParameterExclusions {
  const query = new Set(fixedQueryNames);
  const header = new Set<string>();
  if (credential.spec.kind === "api_key") {
    if (credential.spec.location === "query") query.add(credential.spec.name);
    else header.add(credential.spec.name.toLowerCase());
  }
  return { query, header };
}

async function openApiParameterMappings(
  inherited: unknown,
  operationParameters: unknown,
  path: string,
  excludedParameters: OpenApiParameterExclusions,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiParameterMappingsResult> {
  const pathParameters = inherited === undefined ? [] : inherited;
  const directParameters =
    operationParameters === undefined ? [] : operationParameters;
  if (!Array.isArray(pathParameters) || !Array.isArray(directParameters)) {
    return { kind: "refused", reason: "selector_invalid" };
  }
  const selected = new Map<string, Readonly<Record<string, unknown>>>();
  for (const candidate of [...pathParameters, ...directParameters]) {
    const resolved = await resolveOpenApiRecord(candidate, root, derefSchema);
    if (resolved.kind === "refused")
      return openApiParameterMappingsRefusal(resolved.reason);
    if (resolved.value === undefined)
      return { kind: "refused", reason: "selector_invalid" };
    if (
      typeof resolved.value.in !== "string" ||
      typeof resolved.value.name !== "string"
    ) {
      return { kind: "refused", reason: "selector_invalid" };
    }
    const location = resolved.value.in;
    const name = resolved.value.name;
    const key = `${location}:${location === "header" ? name.toLowerCase() : name}`;
    selected.set(key, resolved.value);
  }
  for (const match of path.matchAll(/\{([A-Za-z][A-Za-z0-9_.-]{0,99})\}/g)) {
    const name = match[1];
    const parameter = selected.get(`path:${name}`);
    if (parameter === undefined || parameter.required !== true) {
      return { kind: "refused", reason: "openapi_path_parameter_required" };
    }
  }
  const properties: Record<string, JsonValue> = {};
  const required: string[] = [];
  const query: HttpJsonQueryParameterMapping[] = [];
  const pathMappings: HttpJsonPathParameterMapping[] = [];
  const headers: HttpJsonHeaderParameterMapping[] = [];
  const seenInputNames = new Set<string>();
  for (const parameter of selected.values()) {
    const location = parameter.in;
    const name = parameter.name;
    if (typeof location !== "string" || typeof name !== "string") {
      return { kind: "refused", reason: "selector_invalid" };
    }
    if (location !== "query" && location !== "path" && location !== "header") {
      return { kind: "refused", reason: "openapi_operation_unsupported" };
    }
    const excluded =
      location === "query"
        ? excludedParameters.query.has(name)
        : location === "header"
          ? excludedParameters.header.has(name.toLowerCase())
          : false;
    if (excluded) continue;
    if (location === "header" && isUnsafeOpenApiHeader(name)) {
      return { kind: "refused", reason: "openapi_header_parameter_unsafe" };
    }
    if (Object.hasOwn(parameter, "content")) {
      return {
        kind: "refused",
        reason:
          location === "query"
            ? "openapi_query_parameter_definition_unsupported"
            : location === "path"
              ? "openapi_path_parameter_serialization_unsupported"
              : "openapi_header_parameter_serialization_unsupported",
      };
    }
    const schemaResult = await resolveOpenApiRecord(
      parameter.schema,
      root,
      derefSchema,
    );
    if (schemaResult.kind === "refused")
      return openApiParameterMappingsRefusal(schemaResult.reason);
    const schema = schemaResult.value;
    if (schema === undefined || !supportedOpenApiParameterSchema(schema)) {
      return {
        kind: "refused",
        reason:
          location === "query"
            ? "openapi_query_parameter_schema_unsupported"
            : location === "path"
              ? "openapi_path_parameter_serialization_unsupported"
              : "openapi_header_parameter_serialization_unsupported",
      };
    }
    if (
      parameter.required !== undefined &&
      typeof parameter.required !== "boolean"
    ) {
      return {
        kind: "refused",
        reason: "openapi_query_parameter_definition_unsupported",
      };
    }
    if (
      parameter.allowReserved !== undefined &&
      parameter.allowReserved !== false
    ) {
      return {
        kind: "refused",
        reason:
          location === "query"
            ? "openapi_query_parameter_serialization_unsupported"
            : location === "path"
              ? "openapi_path_parameter_serialization_unsupported"
              : "openapi_header_parameter_serialization_unsupported",
      };
    }
    const expectedStyle = location === "query" ? "form" : "simple";
    const style =
      parameter.style === undefined ? expectedStyle : parameter.style;
    const defaultExplode = location === "query" && expectedStyle === "form";
    const explode =
      parameter.explode === undefined ? defaultExplode : parameter.explode;
    if (
      typeof explode !== "boolean" ||
      style !== expectedStyle ||
      (location === "path" && !path.includes(`{${name}}`))
    ) {
      return {
        kind: "refused",
        reason:
          location === "query"
            ? "openapi_query_parameter_serialization_unsupported"
            : location === "path"
              ? path.includes(`{${name}}`)
                ? "openapi_path_parameter_serialization_unsupported"
                : "openapi_path_parameter_required"
              : "openapi_header_parameter_serialization_unsupported",
      };
    }
    if (location === "path" && parameter.required !== true) {
      return { kind: "refused", reason: "openapi_path_parameter_required" };
    }
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(name) && location !== "header")
      return { kind: "refused", reason: "selector_invalid" };
    if (
      location === "header" &&
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,100}$/.test(name)
    ) {
      return { kind: "refused", reason: "selector_invalid" };
    }
    const inputName =
      parameter["x-ae-input-name"] === undefined
        ? name
        : parameter["x-ae-input-name"];
    if (
      typeof inputName !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(inputName) ||
      seenInputNames.has(inputName)
    ) {
      return { kind: "refused", reason: "selector_invalid" };
    }
    seenInputNames.add(inputName);
    properties[inputName] = schema as Readonly<Record<string, JsonValue>>;
    if (parameter.required === true) required.push(inputName);
    const inputPointer = `/${inputName.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    if (location === "query") {
      query.push({
        inputPointer,
        parameter: name,
        required: parameter.required === true,
        style: "form",
        explode,
      });
    } else if (location === "path") {
      pathMappings.push({
        inputPointer,
        parameter: name,
        required: true,
        style: "simple",
        explode,
      });
    } else {
      headers.push({
        inputPointer,
        parameter: name,
        required: parameter.required === true,
        style: "simple",
        explode,
      });
    }
  }
  return {
    kind: "mapped",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    query,
    path: pathMappings,
    headers,
  };
}

async function analyzeOpenApiOperation(
  operation: Readonly<Record<string, unknown>>,
  inheritedParameters: unknown,
  path: string,
  method: string,
  excludedParameters: OpenApiParameterExclusions,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiOperationAnalysisResult> {
  if (method !== "get" && method !== "post") {
    return { kind: "refused", reason: "openapi_operation_unsupported" };
  }
  const credential = resolveOpenApiCredential(root, operation);
  if (credential.kind === "refused") {
    return { kind: "refused", reason: "transport_unsupported" };
  }
  const parameters = await openApiParameterMappings(
    inheritedParameters,
    operation.parameters,
    path,
    excludedParameters,
    root,
    derefSchema,
  );
  if (parameters.kind === "refused") return parameters;

  let requestContent: OpenApiJsonContent | undefined;
  if (method === "post") {
    const requestBody = await resolveOpenApiRecord(
      operation.requestBody,
      root,
      derefSchema,
    );
    if (requestBody.kind === "refused") return requestBody;
    requestContent =
      requestBody.value === undefined
        ? undefined
        : jsonContentDocument(requestBody.value.content);
    if (requestBody.value !== undefined && requestContent === undefined) {
      return { kind: "refused", reason: "openapi_media_type_unsupported" };
    }
    if (
      requestContent !== undefined &&
      requestBody.value?.required !== undefined &&
      typeof requestBody.value.required !== "boolean"
    ) {
      return { kind: "refused", reason: "schema_missing" };
    }
  } else if (operation.requestBody !== undefined) {
    return { kind: "refused", reason: "openapi_operation_unsupported" };
  }
  if (
    requestContent !== undefined &&
    (parameters.query.length > 0 ||
      parameters.path.length > 0 ||
      parameters.headers.length > 0)
  ) {
    return {
      kind: "refused",
      reason: "openapi_request_body_parameter_mix_unsupported",
    };
  }

  const inputSchema =
    method === "get"
      ? parameters.schema
      : (requestContent?.schema ?? parameters.schema);
  const responses = operation.responses;
  const successful = isRecord(responses)
    ? Object.entries(responses).filter(([status]) => /^2\d\d$/.test(status))
    : [];
  if (successful.length > 1) {
    return { kind: "refused", reason: "openapi_response_status_unsupported" };
  }
  if (successful.length === 0 || !isRecord(successful[0]?.[1])) {
    return { kind: "refused", reason: "schema_missing" };
  }
  const responseStatus = Number(successful[0][0]);
  const responseResult = await resolveOpenApiRecord(
    successful[0][1],
    root,
    derefSchema,
  );
  if (responseResult.kind === "refused") return responseResult;
  const outputContent =
    responseResult.value === undefined
      ? undefined
      : jsonContentDocument(responseResult.value.content);
  if (outputContent === undefined) {
    return { kind: "refused", reason: "schema_missing" };
  }
  return {
    kind: "analyzed",
    analysis: {
      credential,
      parameters,
      inputSchema,
      ...(requestContent === undefined ? {} : { requestContent }),
      responseStatus,
      outputContent,
    },
  };
}

function supportedOpenApiParameterSchema(
  schema: Readonly<Record<string, unknown>>,
): boolean {
  const type = schema.type;
  if (
    type === "string" ||
    type === "number" ||
    type === "integer" ||
    type === "boolean"
  )
    return true;
  if (type !== "array" || !isRecord(schema.items)) return false;
  const itemType = schema.items.type;
  return (
    itemType === "string" ||
    itemType === "number" ||
    itemType === "integer" ||
    itemType === "boolean"
  );
}

function isUnsafeOpenApiHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "authorization" ||
    lower === "cookie" ||
    lower === "set-cookie" ||
    lower === "content-type" ||
    lower === "accept" ||
    lower.startsWith("ae-") ||
    lower === "x-api-key" ||
    lower === "api-key" ||
    lower === "host" ||
    lower === "content-length" ||
    lower === "transfer-encoding" ||
    lower === "connection" ||
    lower === "keep-alive" ||
    lower === "proxy-authenticate" ||
    lower === "proxy-authorization" ||
    lower === "te" ||
    lower === "trailer" ||
    lower === "upgrade"
  );
}

function fixedQueryContainsCredential(
  value: readonly Readonly<{ parameter: string; value: string }>[] | undefined,
  declaredCredentialParameters: readonly string[],
): boolean {
  const declared = new Set(
    declaredCredentialParameters.map((parameter) => parameter.toLowerCase()),
  );
  return (
    value?.some(
      (item) =>
        declared.has(item.parameter.toLowerCase()) ||
        publicationMaterialContainsCredential(item),
    ) ?? false
  );
}

function fixedQueryMapping(
  value: readonly Readonly<{ parameter: string; value: string }>[] | undefined,
  dynamic: readonly Readonly<{ parameter: string }>[] | undefined,
): readonly Readonly<{ parameter: string; value: string }>[] | undefined {
  if (value === undefined) return [];
  if (value.length > 64) return undefined;
  const dynamicNames = new Set(
    (dynamic ?? []).map(({ parameter }) => parameter),
  );
  const seen = new Set<string>();
  const result: Array<{ parameter: string; value: string }> = [];
  for (const item of value) {
    if (
      !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(item.parameter) ||
      typeof item.value !== "string" ||
      item.value.length === 0 ||
      item.value.length > 200 ||
      seen.has(item.parameter) ||
      dynamicNames.has(item.parameter)
    ) {
      return undefined;
    }
    seen.add(item.parameter);
    result.push({ parameter: item.parameter, value: item.value });
  }
  return result;
}

function resolveOpenApiCredential(
  document: unknown,
  operation: Readonly<Record<string, unknown>>,
): OpenApiCredentialResolution {
  const securitySchemes =
    isRecord(document) &&
    isRecord(document.components) &&
    isRecord(document.components.securitySchemes)
      ? document.components.securitySchemes
      : undefined;
  const operationSecurity = operation.security;
  const documentSecurity =
    isRecord(document) && document.security !== undefined
      ? Array.isArray(document.security)
        ? document.security
        : null
      : undefined;
  const security =
    operationSecurity === undefined
      ? documentSecurity
      : Array.isArray(operationSecurity)
        ? operationSecurity
        : null;
  if (security === null) return { kind: "refused" };
  if (security === undefined || security.length === 0) {
    return { kind: "resolved", spec: { kind: "keyless" }, parameterNames: [] };
  }
  if (securitySchemes === undefined || security.length !== 1)
    return { kind: "refused" };
  const entry = security[0];
  if (!isRecord(entry)) return { kind: "refused" };
  const schemes = Object.entries(entry);
  if (schemes.length !== 1 || schemes[0] === undefined)
    return { kind: "refused" };
  const [schemeName, scope] = schemes[0];
  if (
    !Array.isArray(scope) ||
    !scope.every((value) => typeof value === "string")
  ) {
    return { kind: "refused" };
  }
  const scheme = securitySchemes[schemeName];
  if (!isRecord(scheme) || !boundedTrimmed(schemeName, MAX_TOOL_NAME_LENGTH)) {
    return { kind: "refused" };
  }
  if (
    scheme.type === "apiKey" &&
    (scheme.in === "query" || scheme.in === "header") &&
    typeof scheme.name === "string" &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(scheme.name)
  ) {
    return {
      kind: "resolved",
      spec: {
        kind: "api_key",
        location: scheme.in,
        name: scheme.name,
        schemeName,
      },
      parameterNames: [scheme.name],
    };
  }
  if (
    scheme.type === "http" &&
    typeof scheme.scheme === "string" &&
    scheme.scheme.toLowerCase() === "bearer"
  ) {
    return {
      kind: "resolved",
      spec: { kind: "http_bearer", schemeName },
      parameterNames: [],
    };
  }
  return { kind: "refused" };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function validPath(value: string): boolean {
  return /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]|\{[A-Za-z][A-Za-z0-9_.-]{0,99}\}){1,1000}$/.test(
    value,
  );
}
