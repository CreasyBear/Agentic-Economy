import { describe, expect, it } from "vitest";

import { publicationSourceDescriptorJson } from "@/modules/capability-supply/internal/publication/source";

import {
  admitRegisteredTransport,
  importAgentPluginMcpCapability,
  importMcpCapability,
  importOpenApiHttpCapability,
  importX402Capability,
  normalizeCapabilityPublication,
  preflightOpenApiHttpDocument,
  type CapabilityTransportAuthority,
} from "@/modules/capability-supply/public";
import type { SchemaDereferencer } from "@/modules/capability-supply/internal/admit-provider-schema";

const JSON_SCHEMA = "https://json-schema.org/draft/2020-12/schema";
const providerAuthority = {
  kind: "provider_connection",
  connectionRef: "connection:independent",
  providerRef: "provider:reference",
} as const;
const keylessAuthority = { kind: "keyless" } as const;

describe("capability publication importers", () => {
  it("normalizes OpenAPI 3.1 POST JSON through the canonical publication draft", async () => {
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document: openApiDocument(),
      operation: { path: "/lookup", method: "post" },
      contract: contractMetadata("independent.lookup"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        source: {
          kind: "openapi_http",
          selector: { path: "/lookup", method: "post" },
        },
        binding: {
          endpointUrl: "https://api.example.test/lookup",
          adapter: {
            adapterId: "http-json:v1",
            config: { method: "POST", requestTimeoutMs: 5_000 },
          },
        },
      },
    });
    if (result.kind === "normalized") {
      expect(JSON.parse(result.draft.documentJson)).toMatchObject({
        capabilityId: "independent.lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
      });
      expect(result.draft.source.descriptorDigest).toMatch(
        /^sha256:[0-9a-f]{64}$/,
      );
    }
  });

  it("normalizes and admits OpenAPI 3.1 GET with an exact query mapping", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      get: {
        parameters: [
          {
            in: "query",
            name: "query",
            required: true,
            schema: { type: "string", minLength: 1 },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "get" },
      contract: contractMetadata("independent.lookup-get"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:get"],
    });
    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        source: { selector: { path: "/lookup", method: "get" } },
        binding: {
          adapter: {
            adapterId: "http-json:v1",
            config: {
              method: "GET",
              query: [{ inputPointer: "/query", parameter: "query" }],
            },
          },
        },
      },
    });
    if (result.kind === "normalized") {
      expect(
        admitRegisteredTransport({
          adapterId: result.draft.binding.adapter.adapterId,
          endpointUrl: result.draft.binding.endpointUrl,
          authority: result.draft.binding.authority,
          continuation: result.draft.binding.continuation,
          cancellation: result.draft.binding.cancellation,
          config: result.draft.binding.adapter.config,
        }),
      ).toMatchObject({
        kind: "admitted",
        transport: { adapterId: "http-json:v1" },
      });
    }
  });
  it("preserves OpenAPI query names, pointers, required flags, and form serialization metadata", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      get: {
        parameters: [
          {
            in: "query",
            name: "required_value",
            required: true,
            style: "form",
            explode: false,
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "optional_value",
            required: false,
            style: "form",
            explode: true,
            schema: { type: "number" },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "get" },
      contract: contractMetadata(
        "independent.lookup-query-metadata",
        "/required_value",
      ),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:query-metadata"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          adapter: {
            config: {
              query: [
                {
                  inputPointer: "/required_value",
                  parameter: "required_value",
                  required: true,
                  style: "form",
                  explode: false,
                },
                {
                  inputPointer: "/optional_value",
                  parameter: "optional_value",
                  required: false,
                  style: "form",
                  explode: true,
                },
              ],
            },
          },
        },
      },
    });
  });

  it.each([
    [
      "unsupported style",
      { style: "spaceDelimited" },
      "openapi_query_parameter_serialization_unsupported",
    ],
    [
      "unsupported explode type",
      { explode: "true" },
      "openapi_query_parameter_serialization_unsupported",
    ],
    [
      "reserved query encoding",
      { allowReserved: true },
      "openapi_query_parameter_serialization_unsupported",
    ],
    [
      "parameter content",
      { content: { "application/json": { schema: { type: "string" } } } },
      "openapi_query_parameter_definition_unsupported",
    ],
    [
      "object schema",
      { schema: { type: "object", properties: { value: { type: "string" } } } },
      "openapi_query_parameter_schema_unsupported",
    ],
  ] as const)(
    "refuses %s OpenAPI query serialization at admission",
    async (_label, override, expectedReason) => {
      const document = openApiDocument();
      document.paths["/lookup"] = {
        get: {
          parameters: [
            {
              in: "query",
              name: "query",
              required: true,
              schema: { type: "string" },
              ...override,
            },
          ],
          responses: {
            "200": {
              content: { "application/json": { schema: outputSchema() } },
            },
          },
        },
      } as never;

      await expect(
        importOpenApiHttpCapability({
          kind: "openapi_http",
          document,
          operation: { path: "/lookup", method: "get" },
          contract: contractMetadata("independent.lookup-unsupported-query"),
          commercial: commercialInput(),
          evidenceRefs: ["source:openapi:unsupported-query"],
        }),
      ).resolves.toEqual({ kind: "refused", reason: expectedReason });
    },
  );
  it("admits an optional OpenAPI array query with form serialization metadata", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      get: {
        parameters: [
          {
            in: "query",
            name: "symbols",
            required: false,
            style: "form",
            explode: true,
            schema: { type: "array", items: { type: "string" } },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "get" },
      contract: contractMetadata("independent.lookup-array", "/symbols"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:array"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          adapter: {
            config: {
              query: [
                {
                  inputPointer: "/symbols",
                  parameter: "symbols",
                  required: false,
                  style: "form",
                  explode: true,
                },
              ],
            },
          },
        },
      },
    });
  });
  it("normalizes parameterized JSON media types to their base media type", async () => {
    const document = openApiDocument();
    const post = lookupPost(document) as {
      requestBody: { content: Record<string, unknown> };
      responses: Record<string, unknown>;
    };
    post.requestBody.content = {
      "application/json; charset=utf-8": { schema: inputSchema() },
    };
    post.responses = {
      "200": {
        content: {
          "application/vnd.reference+json; charset=utf-8": {
            schema: outputSchema(),
          },
        },
      },
    };
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "post" },
      contract: contractMetadata("independent.lookup-media-params"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:media-params"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          adapter: {
            config: {
              requestContentType: "application/json",
              responseContentType: "application/vnd.reference+json",
            },
          },
        },
      },
    });
  });

  it("refuses a JSON request body mixed with query, path, or header mappings", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      post: {
        requestBody: {
          content: { "application/json": { schema: inputSchema() } },
        },
        parameters: [
          { in: "query", name: "format", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;

    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.lookup-mixed-body"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:mixed-body"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "openapi_request_body_parameter_mix_unsupported",
    });
  });
  it("preserves a POST with query parameters and no request body", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      post: {
        parameters: [
          {
            in: "query",
            name: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "post" },
      contract: contractMetadata("independent.lookup-post-query"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:post-query"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          adapter: {
            config: {
              method: "POST",
              query: [{ parameter: "query" }],
            },
          },
        },
      },
    });
    if (result.kind === "normalized") {
      expect(result.draft.binding.adapter.config).not.toHaveProperty(
        "requestContentType",
      );
    }
  });

  it("refuses multiple explicit successful OpenAPI response statuses", async () => {
    const document = openApiDocument();
    const post = lookupPost(document) as { responses: Record<string, unknown> };
    post.responses = {
      "200": { content: { "application/json": { schema: outputSchema() } } },
      "201": { content: { "application/json": { schema: outputSchema() } } },
    };

    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.lookup-multiple-success"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:multiple-success"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "openapi_response_status_unsupported",
    });
  });
  it("carries the exact selected 2xx response status into the HTTP descriptor", async () => {
    const document = openApiDocument();
    const post = lookupPost(document) as { responses: Record<string, unknown> };
    post.responses = {
      "201": {
        content: {
          "application/json; charset=utf-8": { schema: outputSchema() },
        },
      },
    };

    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "post" },
      contract: contractMetadata("independent.lookup-response-status"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:response-status"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          adapter: {
            config: {
              responseStatus: 201,
              responseContentType: "application/json",
            },
          },
        },
      },
    });
  });

  it("rejects a response media type that only starts with application/json", async () => {
    const document = openApiDocument();
    const post = lookupPost(document) as { responses: Record<string, unknown> };
    post.responses = {
      "200": {
        content: { "application/json-invalid": { schema: outputSchema() } },
      },
    };

    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.lookup-invalid-media"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:invalid-media"],
      }),
    ).resolves.toEqual({ kind: "refused", reason: "schema_missing" });
  });

  it.each([
    "Host",
    "Content-Length",
    "Transfer-Encoding",
    "Proxy-Authenticate",
    "Proxy-Authorization",
    "Connection",
    "Keep-Alive",
    "TE",
    "Trailer",
    "Upgrade",
    "X-API-Key",
  ])("refuses unsafe OpenAPI header %s", async (name) => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      get: {
        parameters: [{ in: "header", name, schema: { type: "string" } }],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;

    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document,
        operation: { path: "/lookup", method: "get" },
        contract: contractMetadata(
          `independent.unsafe-header-${name.toLowerCase()}`,
        ),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:unsafe-header"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "openapi_header_parameter_unsafe",
    });
  });

  it("excludes credential parameters by location semantics", async () => {
    const headerDocument = openApiDocument();
    headerDocument.components = {
      securitySchemes: {
        ProviderKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
    };
    headerDocument.paths["/lookup"] = {
      get: {
        security: [{ ProviderKey: [] }],
        parameters: [
          { in: "header", name: "x-api-key", schema: { type: "string" } },
          {
            in: "query",
            name: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const headerResult = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document: headerDocument,
      operation: { path: "/lookup", method: "get" },
      contract: contractMetadata("independent.header-exclusion"),
      commercial: commercialInput({ authority: providerAuthority }),
      evidenceRefs: ["source:openapi:header-exclusion"],
    });
    expect(headerResult).toMatchObject({
      kind: "normalized",
      draft: {
        binding: { adapter: { config: { query: [{ parameter: "query" }] } } },
      },
    });
    if (headerResult.kind === "normalized") {
      expect(headerResult.draft.binding.adapter.config).not.toHaveProperty(
        "headers",
      );
    }

    const queryDocument = openApiDocument();
    queryDocument.components = {
      securitySchemes: {
        ProviderKey: { type: "apiKey", in: "query", name: "ApiKey" },
      },
    };
    queryDocument.paths["/lookup"] = {
      get: {
        security: [{ ProviderKey: [] }],
        parameters: [
          {
            in: "query",
            name: "apikey",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const queryResult = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document: queryDocument,
      operation: { path: "/lookup", method: "get" },
      contract: contractMetadata("independent.query-case-exclusion", "/apikey"),
      commercial: commercialInput({ authority: providerAuthority }),
      evidenceRefs: ["source:openapi:query-case-exclusion"],
    });
    expect(queryResult).toMatchObject({
      kind: "normalized",
      draft: {
        binding: { adapter: { config: { query: [{ parameter: "apikey" }] } } },
      },
    });
  });

  it("keeps preflight outcomes aligned with selected-operation import refusals", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      post: {
        requestBody: {
          content: { "application/json": { schema: inputSchema() } },
        },
        parameters: [
          { in: "query", name: "format", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const [preflight, imported] = await Promise.all([
      preflightOpenApiHttpDocument(document),
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.preflight-parity"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:preflight-parity"],
      }),
    ]);
    expect(imported).toEqual({
      kind: "refused",
      reason: "openapi_request_body_parameter_mix_unsupported",
    });
    expect(preflight).toMatchObject({
      kind: "preflighted",
      outcomes: [
        {
          selector: { path: "/lookup", method: "post" },
          kind: "unsupported_shape",
          reason: "openapi_request_body_parameter_mix_unsupported",
        },
      ],
    });
  });
  it("refuses an OpenAPI path placeholder without a required path mapping during import and preflight", async () => {
    const document = openApiDocument();
    document.paths = {
      "/users/{id}": {
        get: {
          responses: {
            "200": {
              content: { "application/json": { schema: outputSchema() } },
            },
          },
        },
      },
    } as never;

    const imported = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/users/{id}", method: "get" },
      contract: contractMetadata("independent.users-path-missing", "/id"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:users-path-missing"],
    });
    expect(imported).toEqual({
      kind: "refused",
      reason: "openapi_path_parameter_required",
    });

    const preflight = await preflightOpenApiHttpDocument(document);
    expect(preflight).toMatchObject({
      kind: "preflighted",
      outcomes: [
        {
          selector: { path: "/users/{id}", method: "get" },
          kind: "unsupported_shape",
          reason: "openapi_path_parameter_required",
        },
      ],
    });
  });

  it("maps every OpenAPI path placeholder from a required in:path parameter", async () => {
    const document = openApiDocument();
    document.paths = {
      "/users/{id}": {
        get: {
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": {
              content: { "application/json": { schema: outputSchema() } },
            },
          },
        },
      },
    } as never;

    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/users/{id}", method: "get" },
      contract: contractMetadata("independent.users-path-mapped", "/id"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:users-path-mapped"],
    });
    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          adapter: {
            config: {
              path: [
                {
                  inputPointer: "/id",
                  parameter: "id",
                  required: true,
                  style: "simple",
                  explode: false,
                },
              ],
            },
          },
        },
      },
    });
  });

  it("binds a declared OpenAPI credential to provider authority without storing a value", async () => {
    const document = securedOpenApiDocument();
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "post" },
      contract: contractMetadata("independent.lookup-keyed"),
      commercial: commercialInput({ authority: providerAuthority }),
      evidenceRefs: ["source:openapi:keyed"],
    });
    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          authority: providerAuthority,
          adapter: {
            config: {
              credential: {
                kind: "api_key",
                location: "header",
                name: "X-Provider-Key",
              },
            },
          },
        },
      },
    });
  });

  it("refuses mismatched OpenAPI authority and credential-like fixed query values", async () => {
    const secured = securedOpenApiDocument();
    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document: secured,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.lookup-keyless-mismatch"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:keyless-mismatch"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "commercial_metadata_inconsistent",
    });

    const fixed = openApiDocument();
    fixed.paths["/lookup"] = {
      get: {
        parameters: [
          {
            in: "query",
            name: "query",
            required: true,
            schema: { type: "string", minLength: 1 },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document: fixed,
        operation: { path: "/lookup", method: "get" },
        fixedQuery: [{ parameter: "api_token", value: "sk_live_not_allowed" }],
        contract: contractMetadata("independent.lookup-fixed-secret"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:fixed-secret"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "commercial_metadata_inconsistent",
    });
    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document: fixed,
        operation: { path: "/lookup", method: "get" },
        fixedQuery: [{ parameter: "sig", value: "opaque-signature" }],
        contract: contractMetadata("independent.lookup-fixed-signature"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:fixed-signature"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "commercial_metadata_inconsistent",
    });
    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document: fixed,
        operation: { path: "/lookup", method: "get" },
        fixedQuery: [{ parameter: "KeY", value: "secret" }],
        contract: contractMetadata("independent.lookup-fixed-key-alias"),
        commercial: commercialInput(),
        evidenceRefs: ["source:openapi:fixed-key-alias"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "commercial_metadata_inconsistent",
    });
  });
  it("accepts benign fixed query values without treating them as credential material", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      get: {
        parameters: [
          {
            in: "query",
            name: "query",
            required: true,
            schema: { type: "string", minLength: 1 },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const fixedQuery = [
      { parameter: "format", value: "json" },
      { parameter: "providers", value: "ECB" },
      { parameter: "ids", value: "bitcoin" },
    ] as const;
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document,
      operation: { path: "/lookup", method: "get" },
      fixedQuery,
      contract: contractMetadata("independent.lookup-fixed-benign"),
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:fixed-benign"],
    });
    expect(result).toMatchObject({
      kind: "normalized",
      draft: { binding: { adapter: { config: { fixedQuery } } } },
    });
  });

  it("maps an admitted OpenAPI query name to a distinct contract input name", async () => {
    const document = openApiDocument();
    document.paths["/lookup"] = {
      get: {
        parameters: [
          {
            in: "query",
            name: "quotes",
            "x-ae-input-name": "quote",
            required: true,
            schema: { type: "string", pattern: "^[A-Z]{3}$" },
          },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: outputSchema() } },
          },
        },
      },
    } as never;
    const result = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document: structuredClone(document) as unknown,
      contract: {
        ...contractMetadata("independent.lookup-query-alias"),
        customerAnnotations: [
          {
            annotationId: "request",
            document: "input",
            pointer: "/quote",
            label: "Quote",
            role: "request",
          },
          {
            annotationId: "result",
            document: "output",
            pointer: "/result",
            label: "Result",
            role: "completion_evidence",
          },
        ] as const,
        dataUse: [
          {
            effectId: "release-query",
            inputPointer: "/quote",
            classification: "public",
            phase: "execution",
            recipient: { kind: "selected_binding" },
            purposes: ["lookup"],
          },
        ] as const,
      },
      operation: { path: "/lookup", method: "get" },
      commercial: commercialInput(),
      evidenceRefs: ["source:openapi:query-alias"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        binding: {
          adapter: {
            config: {
              query: [{ inputPointer: "/quote", parameter: "quotes" }],
            },
          },
        },
      },
    });
    if (result.kind === "normalized") {
      expect(JSON.parse(result.draft.documentJson)).toMatchObject({
        inputSchema: {
          properties: { quote: { type: "string", pattern: "^[A-Z]{3}$" } },
          required: ["quote"],
        },
      });
    }
  });

  it("normalizes one MCP tool with a distinct admitted JSON-RPC transport", async () => {
    const result = await importMcpCapability({
      kind: "mcp",
      serverUrl: "https://tools.example.test/mcp",
      protocolVersion: "2025-06-18",
      tool: {
        name: "reference_lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
      },
      contract: contractMetadata("independent.mcp-lookup"),
      commercial: commercialInput({ authority: providerAuthority }),
      evidenceRefs: ["source:mcp"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        source: {
          kind: "mcp",
          selector: {
            toolName: "reference_lookup",
            protocolVersion: "2025-06-18",
          },
        },
        binding: {
          endpointUrl: "https://tools.example.test/mcp",
          adapter: {
            adapterId: "mcp-jsonrpc:v1",
            config: {
              protocolVersion: "2025-06-18",
              toolName: "reference_lookup",
              requestTimeoutMs: 5_000,
              credential: { kind: "bearer" },
            },
          },
        },
      },
    });
    if (result.kind === "normalized") {
      expect(
        admitRegisteredTransport({
          adapterId: result.draft.binding.adapter.adapterId,
          endpointUrl: result.draft.binding.endpointUrl,
          authority: result.draft.binding.authority,
          continuation: result.draft.binding.continuation,
          cancellation: result.draft.binding.cancellation,
          config: result.draft.binding.adapter.config,
        }),
      ).toMatchObject({
        kind: "admitted",
        transport: { adapterId: "mcp-jsonrpc:v1" },
      });
    }
  });

  it("normalizes an Agent Plugin MCP server through the canonical MCP importer", async () => {
    const source = {
      kind: "agent_plugin_mcp" as const,
      manifest: {
        name: "Reference Plugin",
        mcpServers: {
          reference: { type: "http", url: "https://tools.example.test/mcp" },
          local: { type: "stdio", command: "node" },
          legacy: { type: "sse", url: "https://tools.example.test/sse" },
        },
      },
      serverName: "reference",
      protocolVersion: "2025-06-18",
      tool: {
        name: "reference_lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
      },
      contract: contractMetadata("independent.agent-plugin-mcp"),
      commercial: commercialInput(),
      evidenceRefs: ["source:agent-plugin"],
    };
    const result = await importAgentPluginMcpCapability(source);

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        source: {
          kind: "agent_plugin_mcp",
          selector: {
            serverName: "reference",
            toolName: "reference_lookup",
            protocolVersion: "2025-06-18",
          },
        },
        binding: {
          endpointUrl: "https://tools.example.test/mcp",
          adapter: { adapterId: "mcp-jsonrpc:v1" },
        },
      },
    });
    expect(JSON.parse(publicationSourceDescriptorJson(source))).toEqual({
      manifest: {
        name: "Reference Plugin",
        mcpServers: {
          reference: { type: "http", url: "https://tools.example.test/mcp" },
        },
      },
      serverName: "reference",
      tool: {
        name: "reference_lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
      },
    });
  });

  it.each([
    [
      {
        name: "",
        mcpServers: {
          reference: { type: "http", url: "https://tools.example.test/mcp" },
        },
      },
      "source_invalid",
    ],
    [{ name: "Reference Plugin" }, "source_invalid"],
    [
      {
        name: "Reference Plugin",
        mcpServers: { reference: "https://tools.example.test/mcp" },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: {
          reference: {
            type: "http",
            url: "https://tools.example.test/mcp",
            headers: { Authorization: "opaque-provider-credential" },
          },
        },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: { reference: { type: "stdio", command: "node" } },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: {
          reference: { type: "sse", url: "https://tools.example.test/sse" },
        },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: {
          reference: {
            type: "http",
            url: "https://tools.example.test/mcp",
            command: "node",
          },
        },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: { reference: { type: "http", url: "/local/mcp" } },
      },
      "transport_unsupported",
    ],
  ] as const)(
    "rejects unresolved or local Agent Plugin MCP server manifests",
    async (manifest, reason) => {
      await expect(
        importAgentPluginMcpCapability({
          kind: "agent_plugin_mcp",
          manifest,
          serverName: "reference",
          protocolVersion: "2025-06-18",
          tool: {
            name: "reference_lookup",
            inputSchema: inputSchema(),
            outputSchema: outputSchema(),
          },
          contract: contractMetadata("independent.agent-plugin-invalid"),
          commercial: commercialInput(),
          evidenceRefs: ["source:agent-plugin:invalid"],
        }),
      ).resolves.toEqual({ kind: "refused", reason });
    },
  );

  it("normalizes x402 metadata into its registered bounded transport", async () => {
    const result = await importX402Capability({
      kind: "x402",
      resource: {
        resourceUrl: "https://api.example.test/lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
        price: { currency: "AUD", units: "1200", exponent: 2 },
        scheme: "exact",
        network: "eip155:84532",
        asset: "0x0000000000000000000000000000000000000001",
        payTo: "0x0000000000000000000000000000000000000002",
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      },
      contract: contractMetadata("independent.x402-lookup"),
      commercial: commercialInput({
        price: {
          kind: "fixed",
          amount: { currency: "AUD", units: "1200", exponent: 2 },
        },
        authority: providerAuthority,
      }),
      evidenceRefs: ["source:x402"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        source: {
          kind: "x402",
          selector: { resourceUrl: "https://api.example.test/lookup" },
        },
        offering: {
          presentation: {
            price: {
              kind: "fixed",
              amount: { currency: "AUD", units: "1200", exponent: 2 },
            },
          },
        },
        binding: { adapter: { adapterId: "x402-fetch:v2" } },
      },
    });
    if (result.kind === "normalized") {
      expect(result.draft.documentJson).not.toMatch(
        /payment|settlement|wallet/i,
      );
      expect(result.draft.binding.adapter.config).toMatchObject({
        scheme: "exact",
        network: "eip155:84532",
        currency: "AUD",
      });
    }
  });

  it.each(["GET", "POST"] as const)(
    "normalizes and admits x402 %s without widening payment material",
    async (method) => {
      const result = await importX402Capability({
        kind: "x402",
        resource: {
          resourceUrl: "https://api.example.test/lookup",
          method,
          ...(method === "GET"
            ? { query: [{ inputPointer: "/query", parameter: "query" }] }
            : {}),
          inputSchema: inputSchema(),
          outputSchema: outputSchema(),
          price: { currency: "AUD", units: "1200", exponent: 2 },
          scheme: "exact",
          network: "eip155:84532",
          asset: "0x0000000000000000000000000000000000000001",
          payTo: "0x0000000000000000000000000000000000000002",
          routeAmountExponent: 2,
          assetAmountExponent: 6,
        },
        contract: contractMetadata(`independent.x402-${method.toLowerCase()}`),
        commercial: commercialInput({
          price: {
            kind: "fixed",
            amount: { currency: "AUD", units: "1200", exponent: 2 },
          },
          authority: providerAuthority,
        }),
        evidenceRefs: [`source:x402:${method}`],
      });
      expect(result).toMatchObject({
        kind: "normalized",
        draft: { binding: { adapter: { config: { method } } } },
      });
      if (result.kind === "normalized") {
        expect(
          admitRegisteredTransport({
            adapterId: result.draft.binding.adapter.adapterId,
            endpointUrl: result.draft.binding.endpointUrl,
            authority: result.draft.binding.authority,
            continuation: result.draft.binding.continuation,
            cancellation: result.draft.binding.cancellation,
            config: result.draft.binding.adapter.config,
          }),
        ).toMatchObject({
          kind: "admitted",
          transport: { adapterId: "x402-fetch:v2" },
        });
      }
    },
  );
  it("names an unsupported x402 payment execution scheme instead of generic transport refusal", async () => {
    const base = matchingX402Import();
    await expect(
      importX402Capability({
        ...base,
        resource: { ...base.resource, scheme: "upto" },
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "payment_execution_unsupported",
    });
  });

  it("admits a matching sub-cent x402 PaymentRequired claim after exact rescaling", async () => {
    const result = await importX402Capability(matchingX402Import());

    expect(result).toMatchObject({
      kind: "normalized",
      draft: { binding: { adapter: { adapterId: "x402-fetch:v2" } } },
    });
  });

  it("admits a fully matching V1 claim as publication evidence", async () => {
    const base = matchingX402Import();
    const result = await importX402Capability({
      ...base,
      resource: {
        ...base.resource,
        paymentRequired: {
          x402Version: 1 as const,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:84532",
              maxAmountRequired: "1234500",
              resource: "https://api.example.test/lookup",
              description: "Reference lookup",
              mimeType: "application/json",
              outputSchema: {},
              payTo: "0x0000000000000000000000000000000000000002",
              maxTimeoutSeconds: 60,
              asset: "0x0000000000000000000000000000000000000001",
              extra: {},
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({ kind: "normalized" });
  });

  it.each([
    ["URL", { resourceUrl: "https://other.example.test/lookup" }],
    ["network", { network: "eip155:8453" }],
    ["asset", { asset: "0x0000000000000000000000000000000000000003" }],
    ["payTo", { payTo: "0x0000000000000000000000000000000000000004" }],
    ["amount", { amount: "1234501" }],
  ] as const)(
    "refuses an x402 PaymentRequired claim with a mismatched %s",
    async (_label, override) => {
      const result = await importX402Capability(matchingX402Import(override));

      expect(result).toEqual({
        kind: "refused",
        reason: "payment_required_invalid",
      });
    },
  );

  it("accepts one matching x402 PaymentRequired requirement among other syntactically valid entries", async () => {
    const input = matchingX402Import();
    input.resource.paymentRequired.accepts.unshift({
      scheme: "exact",
      network: "eip155:8453",
      amount: "1234500",
      asset: "0x0000000000000000000000000000000000000001",
      payTo: "0x0000000000000000000000000000000000000002",
      maxTimeoutSeconds: 60,
      extra: {},
    });

    expect(await importX402Capability(input)).toMatchObject({
      kind: "normalized",
    });
  });

  it("dispatches direct envelopes without changing their canonical material", async () => {
    const documentJson = JSON.stringify({
      contractFormat: "ae.capability-contract:v2",
      ...contractMetadata("independent.direct"),
      inputSchema: inputSchema(),
      outputSchema: outputSchema(),
    });
    const result = await normalizeCapabilityPublication({
      kind: "ae_envelope",
      documentJson,
      offering: commercialInput().offering,
      binding: directBinding(),
      evidenceRefs: ["source:direct"],
    });
    expect(result).toMatchObject({
      kind: "normalized",
      draft: { source: { kind: "ae_envelope" } },
    });
  });

  it("fails closed on remote refs, insecure endpoints, ambiguous OpenAPI servers, and inconsistent x402 price", async () => {
    const remote = openApiDocument();
    const remoteSchema = lookupPost(remote).requestBody.content[
      "application/json"
    ] as {
      schema: Record<string, unknown>;
    };
    remoteSchema.schema = { $ref: "https://evil.test/schema" };
    expect(
      await importOpenApiHttpCapability({
        kind: "openapi_http",
        document: remote,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.remote"),
        commercial: commercialInput(),
        evidenceRefs: ["source:test"],
      }),
    ).toEqual({ kind: "refused", reason: "admit_schema_deref_unavailable" });

    expect(
      await importMcpCapability({
        kind: "mcp",
        serverUrl: "http://tools.example.test/mcp",
        protocolVersion: "2025-06-18",
        tool: {
          name: "lookup",
          inputSchema: inputSchema(),
          outputSchema: outputSchema(),
        },
        contract: contractMetadata("independent.insecure"),
        commercial: commercialInput(),
        evidenceRefs: ["source:test"],
      }),
    ).toEqual({ kind: "refused", reason: "transport_unsupported" });

    const ambiguous = openApiDocument();
    ambiguous.servers.push({ url: "https://other.example.test" });
    expect(
      await importOpenApiHttpCapability({
        kind: "openapi_http",
        document: ambiguous,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.ambiguous"),
        commercial: commercialInput(),
        evidenceRefs: ["source:test"],
      }),
    ).toEqual({ kind: "refused", reason: "transport_unsupported" });

    expect(
      await importX402Capability({
        kind: "x402",
        resource: {
          resourceUrl: "https://api.example.test/lookup",
          inputSchema: inputSchema(),
          outputSchema: outputSchema(),
          price: { currency: "USD", units: "1200", exponent: 2 },
        },
        contract: contractMetadata("independent.price-conflict"),
        commercial: commercialInput({ authority: keylessAuthority }),
        evidenceRefs: ["source:test"],
      }),
    ).toEqual({ kind: "refused", reason: "commercial_metadata_inconsistent" });
  });
  it("names unsupported nested input schema profiles instead of source_invalid", async () => {
    const document = openApiDocument();
    const request = lookupPost(document).requestBody.content[
      "application/json"
    ] as {
      schema: Record<string, unknown>;
    };
    request.schema = {
      $schema: JSON_SCHEMA,
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
      },
      required: ["nested"],
      additionalProperties: false,
    };
    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document,
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.profile-refusal"),
        commercial: commercialInput(),
        evidenceRefs: ["source:profile-refusal"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "schema_profile_unsupported",
    });
  });

  it("preserves circular-ref refusal for OpenAPI path records", async () => {
    const document = openApiDocument();
    (document.paths as Record<string, unknown>)["/lookup"] = {
      $ref: "#/components/x/A",
    };
    const leaveCircularRef: SchemaDereferencer = async (schema) => schema;

    await expect(
      importOpenApiHttpCapability(
        {
          kind: "openapi_http",
          document,
          operation: { path: "/lookup", method: "post" },
          contract: contractMetadata("independent.circular-path-refusal"),
          commercial: commercialInput(),
          evidenceRefs: ["source:circular-path-refusal"],
        },
        leaveCircularRef,
      ),
    ).resolves.toEqual({
      kind: "refused",
      reason: "admit_schema_circular_reference",
    });
  });

  it("routes remote refs through admission for named refusal and resolution outcomes", async () => {
    const remoteRef = { $ref: "https://schemas.example.test/input" };
    const remoteOpenApi = () => {
      const document = openApiDocument();
      const request = lookupPost(document).requestBody.content[
        "application/json"
      ] as {
        schema: Record<string, unknown>;
      };
      request.schema = remoteRef;
      return document;
    };
    const rejectRemote: SchemaDereferencer = async () => {
      throw new Error("remote_schema_not_resolvable");
    };
    const resolveRemote: SchemaDereferencer = async (schema) => {
      if (schema.$ref === remoteRef.$ref) return inputSchema();
      throw new Error("unexpected_schema_reference");
    };

    await expect(
      importOpenApiHttpCapability({
        kind: "openapi_http",
        document: remoteOpenApi(),
        operation: { path: "/lookup", method: "post" },
        contract: contractMetadata("independent.remote-openapi-unavailable"),
        commercial: commercialInput(),
        evidenceRefs: ["source:test"],
      }),
    ).resolves.toEqual({
      kind: "refused",
      reason: "admit_schema_deref_unavailable",
    });
    await expect(
      importOpenApiHttpCapability(
        {
          kind: "openapi_http",
          document: remoteOpenApi(),
          operation: { path: "/lookup", method: "post" },
          contract: contractMetadata("independent.remote-openapi-unresolvable"),
          commercial: commercialInput(),
          evidenceRefs: ["source:test"],
        },
        rejectRemote,
      ),
    ).resolves.toEqual({
      kind: "refused",
      reason: "admit_schema_reference_unresolvable",
    });
    await expect(
      importOpenApiHttpCapability(
        {
          kind: "openapi_http",
          document: remoteOpenApi(),
          operation: { path: "/lookup", method: "post" },
          contract: contractMetadata("independent.remote-openapi-resolved"),
          commercial: commercialInput(),
          evidenceRefs: ["source:test"],
        },
        resolveRemote,
      ),
    ).resolves.toMatchObject({ kind: "normalized" });

    const remoteMcp = {
      kind: "mcp" as const,
      serverUrl: "https://tools.example.test/mcp",
      protocolVersion: "2025-06-18",
      tool: {
        name: "lookup",
        inputSchema: remoteRef,
        outputSchema: outputSchema(),
      },
      contract: contractMetadata("independent.remote-mcp"),
      commercial: commercialInput(),
      evidenceRefs: ["source:test"],
    };
    await expect(importMcpCapability(remoteMcp)).resolves.toEqual({
      kind: "refused",
      reason: "admit_schema_deref_unavailable",
    });
    await expect(importMcpCapability(remoteMcp, rejectRemote)).resolves.toEqual(
      {
        kind: "refused",
        reason: "admit_schema_reference_unresolvable",
      },
    );
    await expect(
      importMcpCapability(remoteMcp, resolveRemote),
    ).resolves.toMatchObject({ kind: "normalized" });

    const remoteX402Base = matchingX402Import();
    const remoteX402 = {
      ...remoteX402Base,
      resource: { ...remoteX402Base.resource, inputSchema: remoteRef },
    };
    await expect(importX402Capability(remoteX402)).resolves.toEqual({
      kind: "refused",
      reason: "admit_schema_deref_unavailable",
    });
    await expect(
      importX402Capability(remoteX402, rejectRemote),
    ).resolves.toEqual({
      kind: "refused",
      reason: "admit_schema_reference_unresolvable",
    });
    await expect(
      importX402Capability(remoteX402, resolveRemote),
    ).resolves.toMatchObject({ kind: "normalized" });
  });

  it("refuses x402 prices that the payment asset cannot represent exactly", async () => {
    const result = await importX402Capability({
      kind: "x402",
      resource: {
        resourceUrl: "https://api.example.test/lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
        price: { currency: "USD", units: "7", exponent: 3 },
        scheme: "exact",
        network: "eip155:84532",
        asset: "0x0000000000000000000000000000000000000001",
        payTo: "0x0000000000000000000000000000000000000002",
        routeAmountExponent: 2,
        assetAmountExponent: 2,
      },
      contract: contractMetadata("independent.x402-unrepresentable"),
      commercial: commercialInput({
        price: {
          kind: "fixed",
          amount: { currency: "USD", units: "7", exponent: 3 },
        },
        authority: providerAuthority,
      }),
      evidenceRefs: ["source:x402"],
    });

    expect(result).toEqual({
      kind: "refused",
      reason: "transport_unsupported",
    });
  });

  it("produces stable descriptor identity regardless of object key order", async () => {
    const first = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document: openApiDocument(),
      operation: { path: "/lookup", method: "post" },
      contract: contractMetadata("independent.stable"),
      commercial: commercialInput(),
      evidenceRefs: ["source:test"],
    });
    const document = openApiDocument();
    const reordered = {
      paths: document.paths,
      servers: document.servers,
      info: document.info,
      openapi: document.openapi,
    };
    const second = await importOpenApiHttpCapability({
      kind: "openapi_http",
      document: reordered,
      operation: { path: "/lookup", method: "post" },
      contract: contractMetadata("independent.stable"),
      commercial: commercialInput(),
      evidenceRefs: ["source:test"],
    });
    expect(first.kind).toBe("normalized");
    expect(second.kind).toBe("normalized");
    if (first.kind === "normalized" && second.kind === "normalized") {
      expect(first.draft.source.descriptorDigest).toBe(
        second.draft.source.descriptorDigest,
      );
      expect(first.draft.documentJson).toBe(second.draft.documentJson);
    }
  });

  it.each([
    "https://localhost/lookup",
    "https://127.0.0.1/lookup",
    "https://[::1]/lookup",
    "https://10.0.0.1/lookup",
    "https://172.16.0.1/lookup",
    "https://192.168.1.1/lookup",
    "https://169.254.169.254/latest/meta-data",
    "https://2130706433/lookup",
    "https://0x7f000001/lookup",
  ])(
    "rejects statically private transport target %s at import and admission",
    async (endpointUrl) => {
      expect(
        await importMcpCapability({
          kind: "mcp",
          serverUrl: endpointUrl,
          protocolVersion: "2025-06-18",
          tool: {
            name: "lookup",
            inputSchema: inputSchema(),
            outputSchema: outputSchema(),
          },
          contract: contractMetadata("independent.private-target"),
          commercial: commercialInput(),
          evidenceRefs: ["source:test"],
        }),
      ).toEqual({ kind: "refused", reason: "transport_unsupported" });

      expect(
        admitRegisteredTransport({
          adapterId: "http-json:v1",
          endpointUrl,
          authority: providerAuthority,
          continuation: {
            kind: "single_response",
            evidenceRefs: ["transport:response"],
          },
          cancellation: {
            kind: "unsupported",
            evidenceRefs: ["transport:no-cancellation"],
          },
          config: { method: "POST", requestTimeoutMs: 5_000 },
        }),
      ).toEqual({ kind: "refused", reason: "adapter_config_invalid" });
    },
  );
});

function contractMetadata(capabilityId: string, inputPointer = "/query") {
  return {
    capabilityId,
    version: 1,
    name: "Reference lookup",
    description: "Looks up one reference.",
    customerAnnotations: [
      {
        annotationId: "request",
        document: "input" as const,
        pointer: inputPointer,
        label: "Query",
        role: "request" as const,
      },
      {
        annotationId: "result",
        document: "output" as const,
        pointer: "/result",
        label: "Result",
        role: "completion_evidence" as const,
      },
    ],
    dataUse: [
      {
        effectId: "release-query",
        inputPointer,
        classification: "public" as const,
        phase: "execution" as const,
        recipient: { kind: "selected_binding" as const },
        purposes: ["lookup"],
      },
    ],
    effects: [
      {
        effectId: "release-query",
        class: "data_release" as const,
        authority: "explicit" as const,
        reversibility: "irreversible" as const,
      },
    ],
    evidence: [
      {
        evidenceId: "result",
        outputPointer: "/result",
        purpose: "completion" as const,
      },
    ],
    lifecycle: {
      idempotency: "required" as const,
      recovery: "reconcile_required" as const,
    },
  };
}

function inputSchema() {
  return {
    $schema: JSON_SCHEMA,
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  };
}

function outputSchema() {
  return {
    $schema: JSON_SCHEMA,
    type: "object",
    properties: { result: { type: "string" } },
    required: ["result"],
    additionalProperties: false,
  };
}

type MatchingX402Overrides = Readonly<{
  resourceUrl?: string;
  network?: string;
  asset?: string;
  payTo?: string;
  amount?: string;
}>;

function matchingX402Import(overrides: MatchingX402Overrides = {}) {
  const price = { currency: "USD", units: "12345", exponent: 4 };
  const network = "eip155:84532";
  const asset = "0x0000000000000000000000000000000000000001";
  const payTo = "0x0000000000000000000000000000000000000002";
  return {
    kind: "x402" as const,
    resource: {
      resourceUrl: "https://api.example.test/lookup",
      inputSchema: inputSchema(),
      outputSchema: outputSchema(),
      price,
      scheme: "exact",
      network,
      asset,
      payTo,
      routeAmountExponent: 4,
      assetAmountExponent: 6,
      paymentRequired: {
        x402Version: 2 as const,
        resource: {
          url: overrides.resourceUrl ?? "https://api.example.test/lookup",
        },
        accepts: [
          {
            scheme: "exact",
            network: overrides.network ?? network,
            amount: overrides.amount ?? "1234500",
            asset: overrides.asset ?? asset,
            payTo: overrides.payTo ?? payTo,
            maxTimeoutSeconds: 60,
            extra: {},
          },
        ],
      },
    },
    contract: contractMetadata("independent.x402-payment-required"),
    commercial: commercialInput({
      price: { kind: "fixed" as const, amount: price },
      authority: providerAuthority,
    }),
    evidenceRefs: ["source:x402:payment-required"],
  };
}

function commercialInput(
  overrides: {
    price?: {
      kind: "fixed";
      amount: { currency: string; units: string; exponent: number };
    };
    authority?: CapabilityTransportAuthority;
  } = {},
) {
  return {
    offering: {
      offeringId: "offering:independent:lookup",
      networkId: "ae:public",
      presentation: {
        label: "Reference lookup",
        summary: "Returns one structured result.",
        price: overrides.price ?? {
          kind: "fixed" as const,
          amount: { currency: "AUD", units: "1200", exponent: 2 },
        },
        materialTerms: [],
        commercialRelationship: {
          kind: "none" as const,
          summary: "No commercial influence.",
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ["commercial:none"],
        },
      },
      searchTerms: ["reference"],
      registrationEvidenceRefs: ["registration:offering"],
    },
    bindingId: "binding:independent:lookup",
    authority: overrides.authority ?? keylessAuthority,
    registrationEvidenceRefs: ["registration:binding"],
    requestTimeoutMs: 5_000,
  };
}

function directBinding() {
  return {
    bindingId: "binding:independent:lookup",
    endpointUrl: "https://api.example.test/lookup",
    authority: providerAuthority,
    continuation: {
      kind: "single_response" as const,
      evidenceRefs: ["transport:response"],
    },
    cancellation: {
      kind: "unsupported" as const,
      evidenceRefs: ["transport:no-cancellation"],
    },
    adapter: {
      adapterId: "http-json:v1",
      config: { method: "POST", requestTimeoutMs: 5_000 },
    },
    registrationEvidenceRefs: ["registration:binding"],
  };
}

type OpenApiFixtureDocument = {
  openapi: string;
  info: { title: string; version: string };
  servers: Array<{ url: string }>;
  components?: {
    securitySchemes?: Record<string, Record<string, unknown>>;
  };
  paths: Record<
    string,
    {
      post: {
        requestBody: {
          content: Record<string, { schema: unknown }>;
        };
        responses: Record<string, unknown>;
      };
    }
  >;
};

function lookupPost(document: OpenApiFixtureDocument) {
  const lookupPath = document.paths["/lookup"];
  if (lookupPath === undefined) throw new Error("fixture missing /lookup POST");
  return lookupPath.post;
}

function openApiDocument(): OpenApiFixtureDocument {
  return {
    openapi: "3.1.0",
    info: { title: "Reference API", version: "1" },
    servers: [{ url: "https://api.example.test" }],
    paths: {
      "/lookup": {
        post: {
          requestBody: {
            content: { "application/json": { schema: inputSchema() } },
          },
          responses: {
            "200": {
              content: { "application/json": { schema: outputSchema() } },
            },
          },
        },
      },
    },
  };
}

function securedOpenApiDocument() {
  const document = openApiDocument();
  return {
    ...document,
    components: {
      securitySchemes: {
        ProviderKey: { type: "apiKey", in: "header", name: "X-Provider-Key" },
      },
    },
    paths: {
      ...document.paths,
      "/lookup": {
        post: {
          ...lookupPost(document),
          security: [{ ProviderKey: [] }],
        },
      },
    },
  };
}
