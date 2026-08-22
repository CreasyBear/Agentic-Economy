import { describe, expect, it } from "vitest";
import { validatePaymentRequired } from "@x402/core/schemas";

import { admitFacilitatorDiscoveryItems } from "../../../convex/facilitatorDiscoveryAction";
import timezoneFixture from "../../../src/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json";

import type { SchemaDereferencer } from "@/modules/capability-supply/internal/admit-provider-schema";
import { isRecord } from "@/modules/common/is-record";
import {
  admitRegisteredTransport,
  importMcpCapability,
  importOpenApiHttpCapability,
  importX402Capability,
  normalizeCapabilityPublication,
} from "@/modules/capability-supply/public";

import {
  JSON_SCHEMA,
  commercialInput,
  contractMetadata,
  directBinding,
  inputSchema,
  keylessAuthority,
  lookupPost,
  matchingX402Import,
  openApiDocument,
  outputSchema,
  providerAuthority,
} from "./publication-importers-harness";

describe("capability publication importers", () => {
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
        paymentRequired: {
          x402Version: 2 as const,
          resource: { url: "https://api.example.test/lookup" },
          accepts: [
            {
              scheme: "exact",
              network: "eip155:84532",
              amount: "12000000",
              asset: "0x0000000000000000000000000000000000000001",
              payTo: "0x0000000000000000000000000000000000000002",
              maxTimeoutSeconds: 60,
              extra: {},
            },
          ],
        },
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
      const config = result.draft.binding.adapter.config;
      if (!isRecord(config) || typeof config.paymentRequiredJson !== "string") {
        throw new Error("expected persisted x402 payment terms");
      }
      const paymentRequiredJson = config.paymentRequiredJson;
      expect(validatePaymentRequired(JSON.parse(paymentRequiredJson))).toEqual(
        expect.objectContaining({ x402Version: 2 }),
      );
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
          paymentRequired: {
            x402Version: 2 as const,
            resource: { url: "https://api.example.test/lookup" },
            accepts: [
              {
                scheme: "exact",
                network: "eip155:84532",
                amount: "12000000",
                asset: "0x0000000000000000000000000000000000000001",
                payTo: "0x0000000000000000000000000000000000000002",
                maxTimeoutSeconds: 60,
                extra: {},
              },
            ],
          },
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

  it("rejects a V1 claim as an invalid PaymentRequired document", async () => {
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

    expect(result).toEqual({
      kind: "refused",
      reason: "payment_required_invalid",
    });
  });

  it("requires PaymentRequired and strips only Bazaar from discovery source material", async () => {
    const base = matchingX402Import();
    const { paymentRequired: _paymentRequired, ...withoutPaymentRequired } = base.resource;
    await expect(
      importX402Capability({ ...base, resource: withoutPaymentRequired }),
    ).resolves.toEqual({ kind: "refused", reason: "payment_required_invalid" });

    const discovery = await admitFacilitatorDiscoveryItems([{
      ...timezoneFixture.paymentRequired,
      extensions: {
        ...timezoneFixture.paymentRequired.extensions,
        retained: { info: { source: "test" } },
      },
    }]);
    expect(discovery.admitted).toHaveLength(1);
    const source = JSON.parse(discovery.admitted[0]!.sourceImportJson) as {
      resource: { paymentRequired: { extensions?: Record<string, unknown> } };
    };
    expect(source.resource.paymentRequired.extensions).toEqual({
      "builder-code": timezoneFixture.paymentRequired.extensions["builder-code"],
      retained: { info: { source: "test" } },
    });
    expect(source.resource.paymentRequired.extensions).not.toHaveProperty("bazaar");
    const paymentRequiredJson = discovery.admitted[0]!.binding.adapter.config.paymentRequiredJson;
    const persistedPaymentRequired = validatePaymentRequired(JSON.parse(paymentRequiredJson));
    expect(persistedPaymentRequired.x402Version).toBe(2);
    if (persistedPaymentRequired.x402Version !== 2) {
      throw new Error("expected persisted x402 v2 payment terms");
    }
    expect(persistedPaymentRequired.extensions).toEqual({
      "builder-code": timezoneFixture.paymentRequired.extensions["builder-code"],
      retained: { info: { source: "test" } },
    });
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
          paymentRequired: {
            x402Version: 2 as const,
            resource: { url: "https://api.example.test/lookup" },
            accepts: [{
              scheme: "exact",
              network: "eip155:84532",
              amount: "12000000",
              asset: "0x0000000000000000000000000000000000000001",
              payTo: "0x0000000000000000000000000000000000000002",
              maxTimeoutSeconds: 60,
              extra: {},
            }],
          },
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
        paymentRequired: {
          x402Version: 2 as const,
          resource: { url: "https://api.example.test/lookup" },
          accepts: [{
            scheme: "exact",
            network: "eip155:84532",
            amount: "7",
            asset: "0x0000000000000000000000000000000000000001",
            payTo: "0x0000000000000000000000000000000000000002",
            maxTimeoutSeconds: 60,
            extra: {},
          }],
        },
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
    "https://198.18.0.1/lookup",
    "https://[fec0::1]/lookup",
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
