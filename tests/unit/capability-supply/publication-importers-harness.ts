import type { CapabilityTransportAuthority } from "@/modules/capability-supply/public";

export const JSON_SCHEMA = "https://json-schema.org/draft/2020-12/schema";
export const providerAuthority = {
  kind: "provider_connection",
  connectionRef: "connection:independent",
  providerRef: "provider:reference",
} as const;
export const keylessAuthority = { kind: "keyless" } as const;

export function contractMetadata(capabilityId: string, inputPointer = "/query") {
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

export function inputSchema() {
  return {
    $schema: JSON_SCHEMA,
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  };
}

export function outputSchema() {
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

export function matchingX402Import(overrides: MatchingX402Overrides = {}) {
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

export function commercialInput(
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

export function directBinding() {
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

export type OpenApiFixtureDocument = {
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

export function lookupPost(document: OpenApiFixtureDocument) {
  const lookupPath = document.paths["/lookup"];
  if (lookupPath === undefined) throw new Error("fixture missing /lookup POST");
  return lookupPath.post;
}

export function openApiDocument(): OpenApiFixtureDocument {
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

export function securedOpenApiDocument() {
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
