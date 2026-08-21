import { describe, expect, it } from "vitest";

import {
  admitRegisteredTransport,
  importOpenApiHttpCapability,
  preflightOpenApiHttpDocument,
} from "@/modules/capability-supply/public";

import {
  commercialInput,
  contractMetadata,
  inputSchema,
  lookupPost,
  openApiDocument,
  outputSchema,
  providerAuthority,
  securedOpenApiDocument,
} from "./publication-importers-harness";

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
});
