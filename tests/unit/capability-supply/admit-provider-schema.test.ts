import { describe, expect, it } from "vitest";

import {
  admitProviderSchema,
  importOpenApiHttpCapability,
  type CapabilityContractMetadata,
  type CapabilityTransportAuthority,
} from "@/modules/capability-supply/public";
import type { JsonValue } from "@/modules/capability-contract/public";
import { dereferenceOpenApiSchema } from "@/modules/capability-supply/internal/schema-deref";
import { dereferenceLocalSchema } from "@/modules/capability-supply/convex";

const JSON_SCHEMA = "https://json-schema.org/draft/2020-12/schema";

function minimalContract(capabilityId: string): CapabilityContractMetadata {
  return {
    capabilityId,
    version: 1,
    name: "Admitted reference",
    description:
      "A provider operation admitted through the deterministic normalizer.",
    customerAnnotations: [],
    dataUse: [],
    effects: [],
    evidence: [],
    lifecycle: { idempotency: "required", recovery: "reconcile_required" },
  };
}

function commercial(authority: CapabilityTransportAuthority) {
  return {
    offering: {
      offeringId: "offering:test:op:v1",
      networkId: "ae:public",
      presentation: {
        label: "Test op",
        summary: "A test operation.",
        price: {
          kind: "fixed" as const,
          amount: { currency: "USD", units: "0", exponent: 2 },
        },
        materialTerms: [],
        commercialRelationship: {
          kind: "none" as const,
          summary: "None.",
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ["commercial:none"],
        },
      },
      searchTerms: ["test"],
      registrationEvidenceRefs: ["registration:offering"],
    },
    bindingId: "binding:test:op:v1",
    authority,
    registrationEvidenceRefs: ["registration:binding"],
    requestTimeoutMs: 5_000,
  };
}

describe("admitProviderSchema deterministic normalizer", () => {
  it("uses the Convex-safe dereferencer for local refs and names over-deep schemas", async () => {
    const document = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: { q: { type: "string" } },
            required: ["q"],
          },
        },
      },
    };
    const local = await admitProviderSchema(
      {
        inputSchema: { $ref: "#/components/schemas/Input" },
        outputSchema: {
          type: "object",
          properties: { result: { type: "string" } },
          required: ["result"],
        },
        contract: minimalContract("norm.shared-deref"),
        authority: { kind: "keyless" },
        credential: { kind: "keyless" },
        resolutionRoot: document,
        credentialParameterNames: [],
      },
      dereferenceLocalSchema,
    );
    expect(local.kind).toBe("normalized");

    let deep: Record<string, JsonValue> = { type: "string" };
    for (let index = 0; index < 64; index += 1) {
      deep = { type: "array", items: deep };
    }
    await expect(
      admitProviderSchema({
        inputSchema: deep,
        outputSchema: {
          type: "object",
          properties: { result: { type: "string" } },
          required: ["result"],
        },
        contract: minimalContract("norm.too-deep"),
        authority: { kind: "keyless" },
        credential: { kind: "keyless" },
        resolutionRoot: {},
        credentialParameterNames: [],
      }),
    ).resolves.toEqual({ kind: "refused", reason: "admit_schema_too_deep" });
  });

  it("bounds duplicated local-reference DAG expansion before materializing exponential output", async () => {
    const schemas: Record<string, JsonValue> = {
      A0: { type: "object", properties: { value: { type: "string" } } },
    };
    for (let index = 1; index <= 60; index += 1) {
      schemas[`A${index}`] = {
        allOf: [
          { $ref: `#/components/schemas/A${index - 1}` },
          { $ref: `#/components/schemas/A${index - 1}` },
        ],
      };
    }
    await expect(
      admitProviderSchema(
        {
          inputSchema: { $ref: "#/components/schemas/A60" },
          outputSchema: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
          contract: minimalContract("norm.duplicated-dag"),
          authority: { kind: "keyless" },
          credential: { kind: "keyless" },
          resolutionRoot: { components: { schemas } },
          credentialParameterNames: [],
        },
        dereferenceLocalSchema,
      ),
    ).resolves.toEqual({
      kind: "refused",
      reason: "admit_schema_too_deep",
    });
  });
  it("inlines local references and derives dataUse, required-input annotations and completion evidence", async () => {
    const document = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: { q: { type: "string", minLength: 1 } },
            required: ["q"],
          },
          Output: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
      },
    };
    const result = await admitProviderSchema(
      {
        inputSchema: { $ref: "#/components/schemas/Input" },
        outputSchema: { $ref: "#/components/schemas/Output" },
        contract: minimalContract("norm.ref"),
        authority: { kind: "keyless" },
        credential: { kind: "keyless" },
        resolutionRoot: document,
        credentialParameterNames: [],
      },
      dereferenceOpenApiSchema,
    );

    expect(result.kind).toBe("normalized");
    if (result.kind === "refused") return;
    expect(result.inputSchema).toMatchObject({
      type: "object",
      properties: { q: { type: "string", minLength: 1 } },
      required: ["q"],
      additionalProperties: false,
    });
    expect(result.outputSchema).not.toHaveProperty("$ref");
    expect(result.contract.dataUse.map((entry) => entry.inputPointer)).toEqual([
      "/q",
    ]);
    expect(result.contract.customerAnnotations).toContainEqual(
      expect.objectContaining({
        document: "input",
        pointer: "/q",
        role: "request",
        inference: "customer_required",
      }),
    );
    expect(result.contract.evidence).toEqual([
      expect.objectContaining({
        outputPointer: "/result",
        purpose: "completion",
      }),
    ]);
    // completion evidence carries a matching output annotation
    expect(result.contract.customerAnnotations).toContainEqual(
      expect.objectContaining({
        document: "output",
        pointer: "/result",
        role: "completion_evidence",
      }),
    );
  });

  it("strips a query api-key out of the input surface and preserves binding authority via the openapi import", async () => {
    const document = {
      openapi: "3.1.0",
      info: { title: "Keyed API", version: "1" },
      servers: [{ url: "https://api.example.test" }],
      security: [{ apiKey: [] }],
      components: {
        securitySchemes: {
          apiKey: { type: "apiKey", in: "query", name: "appid" },
        },
      },
      paths: {
        "/search": {
          get: {
            parameters: [
              {
                name: "q",
                in: "query",
                required: true,
                schema: { type: "string", minLength: 1 },
              },
              {
                name: "appid",
                in: "query",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      $schema: JSON_SCHEMA,
                      type: "object",
                      properties: { result: { type: "string" } },
                      required: ["result"],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = await importOpenApiHttpCapability(
      {
        kind: "openapi_http",
        document,
        operation: { path: "/search", method: "get" },
        contract: minimalContract("norm.keyed-get"),
        commercial: commercial({
          kind: "provider_connection",
          connectionRef: "connection:appid",
          providerRef: "provider:keyed-api",
        }),
        evidenceRefs: ["source:keyed"],
      },
      dereferenceOpenApiSchema,
    );

    expect(result).toMatchObject({ kind: "normalized" });
    if (result.kind !== "normalized") return;
    expect(result.draft.binding.authority).toEqual({
      kind: "provider_connection",
      connectionRef: "connection:appid",
      providerRef: "provider:keyed-api",
    });
    expect(result.draft.binding.adapter.config).toMatchObject({
      method: "GET",
      query: [{ inputPointer: "/q", parameter: "q" }],
    });
    const documentJson = JSON.parse(result.draft.documentJson) as {
      inputSchema: { properties: Record<string, unknown>; required: string[] };
    };
    expect(documentJson.inputSchema.properties).not.toHaveProperty("appid");
    expect(documentJson.inputSchema.required).toEqual(["q"]);
  });

  it("preserves a dynamic-keyed output and grounds completion at its RFC 6901 root", async () => {
    const outputSchema = {
      type: "object",
      additionalProperties: { type: "number" },
    } as const;
    const result = await admitProviderSchema(
      {
        inputSchema: {
          type: "object",
          properties: { ids: { type: "string" } },
          required: ["ids"],
        },
        outputSchema,
        contract: minimalContract("norm.dynamic"),
        authority: { kind: "keyless" },
        credential: { kind: "keyless" },
        resolutionRoot: {},
        credentialParameterNames: [],
      },
      dereferenceOpenApiSchema,
    );

    expect(result.kind).toBe("normalized");
    if (result.kind === "refused") return;
    expect(result.outputSchema).toEqual(outputSchema);
    expect(result.contract.evidence).toEqual([
      expect.objectContaining({
        outputPointer: "",
        purpose: "completion",
      }),
    ]);
  });

  it("returns a named refusal for a circular local reference", async () => {
    const result = await admitProviderSchema(
      {
        inputSchema: { $ref: "#/components/schemas/Node" },
        outputSchema: {
          type: "object",
          properties: { result: { type: "string" } },
          required: ["result"],
        },
        contract: minimalContract("norm.circular"),
        authority: { kind: "keyless" },
        credential: { kind: "keyless" },
        resolutionRoot: {
          components: {
            schemas: {
              Node: {
                type: "object",
                properties: { next: { $ref: "#/components/schemas/Node" } },
              },
            },
          },
        },
        credentialParameterNames: [],
      },
      dereferenceOpenApiSchema,
    );

    expect(result).toEqual({
      kind: "refused",
      reason: "admit_schema_circular_reference",
    });
  });

  it("returns a named refusal for a non-local (remote) reference", async () => {
    const result = await admitProviderSchema(
      {
        inputSchema: { $ref: "https://evil.test/schema" },
        outputSchema: {
          type: "object",
          properties: { result: { type: "string" } },
          required: ["result"],
        },
        contract: minimalContract("norm.remote"),
        authority: { kind: "keyless" },
        credential: { kind: "keyless" },
        resolutionRoot: {},
        credentialParameterNames: [],
      },
      dereferenceOpenApiSchema,
    );

    expect(result).toEqual({
      kind: "refused",
      reason: "admit_schema_reference_unresolvable",
    });
  });

  it("returns a named refusal when a non-object output has no guaranteed field", async () => {
    const result = await admitProviderSchema(
      {
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        outputSchema: { type: "array", items: { type: "number" } },
        contract: minimalContract("norm.no-field"),
        authority: { kind: "keyless" },
        credential: { kind: "keyless" },
        resolutionRoot: {},
        credentialParameterNames: [],
      },
      dereferenceOpenApiSchema,
    );

    expect(result).toEqual({
      kind: "refused",
      reason: "admit_output_no_guaranteed_field",
    });
  });
});
