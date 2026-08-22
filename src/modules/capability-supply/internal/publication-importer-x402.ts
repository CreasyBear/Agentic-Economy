import type { JsonValue } from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";
import {
  compareExactAmounts,
  exactAmountSchema,
  rescaleExactAmount,
} from "@/modules/money/public";

import {
  validateX402PaymentRequired,
  type X402ValidatedPaymentRequired,
} from "./x402-payment-signer";
import {
  admitProviderSchema,
  type SchemaDereferencer,
} from "./admit-provider-schema";
import { publicationMaterialContainsCredential } from "./publication/source";
import { validPublicHttpsEndpoint } from "./transport-adapters";
import {
  inspectSource,
  normalizedFromSchemas,
  validHttpsUrl,
  type CapabilityContractMetadata,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportResult,
} from "./publication-importer-types";
import { admitBazaarFromPaymentRequired } from "./publication-importer-x402-bazaar";

export async function importX402Capability(
  input: Extract<CapabilityPublicationImport, { kind: "x402" }>,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  // When the x402-kind submission carries a PaymentRequired (402 challenge) document, it must
  // validate against the canonical @x402/core schema and bind to the admitted payment terms.
  const resource = isRecord(input.resource) ? input.resource : undefined;
  if (resource === undefined || resource.paymentRequired === undefined) {
    return { kind: "refused", reason: "payment_required_invalid" };
  }
  let paymentRequired: X402ValidatedPaymentRequired;
  try {
    paymentRequired = validateX402PaymentRequired(resource.paymentRequired);
  } catch {
    return { kind: "refused", reason: "payment_required_invalid" };
  }
  if (paymentRequired.x402Version !== 2) {
    return { kind: "refused", reason: "payment_required_invalid" };
  }
  const bounded = inspectSource(input.resource);
  if (bounded.kind === "refused") return bounded;
  if (input.commercial.authority.kind !== "provider_connection") {
    return { kind: "refused", reason: "commercial_metadata_inconsistent" };
  }
  const resourceUrl = resource?.resourceUrl;
  if (typeof resourceUrl !== "string") {
    return { kind: "refused", reason: "source_invalid" };
  }
  if (publicationMaterialContainsCredential({ resourceUrl })) {
    return { kind: "refused", reason: "source_invalid" };
  }
  const endpoint = validHttpsUrl(resourceUrl);
  if (endpoint === undefined || resource === undefined) {
    return { kind: "refused", reason: "transport_unsupported" };
  }
  const bazaar = admitBazaarFromPaymentRequired(paymentRequired);
  if (bazaar.kind === "refused") {
    return { kind: "refused", reason: bazaar.reason };
  }
  const inputSchema =
    bazaar.kind === "admitted" ? bazaar.inputSchema : resource.inputSchema;
  const outputSchema =
    bazaar.kind === "admitted" ? bazaar.outputSchema : resource.outputSchema;
  if (!isRecord(inputSchema) || !isRecord(outputSchema)) {
    return { kind: "refused", reason: "schema_missing" };
  }
  const method: "GET" | "POST" | undefined =
    bazaar.kind === "admitted"
      ? bazaar.method
      : resource.method === undefined
        ? "POST"
        : resource.method === "GET" || resource.method === "POST"
          ? resource.method
          : undefined;
  const query =
    bazaar.kind === "admitted"
      ? bazaar.query
      : method === "GET"
        ? sourceQueryMapping(resource.query)
        : undefined;
  if (
    method === undefined ||
    (method === "GET" && query === undefined) ||
    (method === "POST" &&
      bazaar.kind !== "admitted" &&
      resource.query !== undefined)
  ) {
    return { kind: "refused", reason: "selector_invalid" };
  }
  const admit = await admitProviderSchema(
    {
      inputSchema: inputSchema as Readonly<Record<string, JsonValue>>,
      outputSchema: outputSchema as Readonly<Record<string, JsonValue>>,
      contract:
        bazaar.kind === "admitted"
          ? contractForBazaarSchemas(input.contract)
          : input.contract,
      authority: input.commercial.authority,
      credential: { kind: "keyless" },
      resolutionRoot: input.resource,
      credentialParameterNames: [],
    },
    derefSchema,
  );
  if (admit.kind === "refused")
    return { kind: "refused", reason: admit.reason };
  const resourcePrice = exactAmountSchema.safeParse(resource.price);
  if (!resourcePrice.success) {
    return { kind: "refused", reason: "commercial_metadata_inconsistent" };
  }
  const offeredPrice = input.commercial.offering.presentation.price;
  if (
    offeredPrice.kind !== "fixed" ||
    compareExactAmounts(offeredPrice.amount, resourcePrice.data) !== 0
  ) {
    return { kind: "refused", reason: "commercial_metadata_inconsistent" };
  }
  const scheme = resource.scheme;
  const network = resource.network;
  const asset = resource.asset;
  const payTo = resource.payTo;
  const routeAmountExponent = resource.routeAmountExponent;
  const assetAmountExponent = resource.assetAmountExponent;
  if (scheme !== "exact") {
    return { kind: "refused", reason: "payment_execution_unsupported" };
  }
  if (
    typeof network !== "string" ||
    !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(network) ||
    typeof asset !== "string" ||
    asset.trim().length === 0 ||
    typeof payTo !== "string" ||
    payTo.trim().length === 0 ||
    typeof routeAmountExponent !== "number" ||
    !Number.isSafeInteger(routeAmountExponent) ||
    typeof assetAmountExponent !== "number" ||
    !Number.isSafeInteger(assetAmountExponent) ||
    routeAmountExponent < 0 ||
    assetAmountExponent > 18 ||
    assetAmountExponent < routeAmountExponent
  ) {
    return { kind: "refused", reason: "transport_unsupported" };
  }
  const paymentAmount = rescaleExactAmount(
    resourcePrice.data,
    assetAmountExponent,
  );
  if (paymentAmount === undefined) {
    return { kind: "refused", reason: "transport_unsupported" };
  }
  const queryMapped = query !== undefined;
  const matches =
    x402ResourceUrlBindsEndpoint(
      paymentRequired.resource.url,
      endpoint,
      method,
      queryMapped,
    ) &&
    paymentRequired.accepts.some((candidate) => {
      if (
        candidate.scheme !== scheme ||
        candidate.network !== network ||
        candidate.asset.toLowerCase() !== asset.toLowerCase() ||
        candidate.payTo.toLowerCase() !== payTo.toLowerCase()
      )
        return false;
      const parsedAmount = exactAmountSchema.safeParse({
        currency: resourcePrice.data.currency,
        units: candidate.amount,
        exponent: assetAmountExponent,
      });
      return (
        parsedAmount.success &&
        compareExactAmounts(parsedAmount.data, paymentAmount) === 0
      );
    });
  if (!matches)
    return { kind: "refused", reason: "payment_required_invalid" };
  return normalizedFromSchemas({
    source: {
      kind: "x402",
      descriptorDigest: bounded.digest,
      selector: { resourceUrl: endpoint },
      evidenceRefs: input.evidenceRefs,
    },
    contract: admit.contract,
    inputSchema: admit.inputSchema,
    outputSchema: admit.outputSchema,
    commercial: input.commercial,
    endpointUrl: endpoint,
    adapter: {
      adapterId: "x402-fetch:v2",
      config: {
        method,
        ...(query === undefined ? {} : { query: [...query] }),
        requestTimeoutMs: input.commercial.requestTimeoutMs,
        scheme,
        network,
        currency: resourcePrice.data.currency,
        routeAmountExponent,
        assetAmountExponent,
        asset,
        payTo,
        paymentRequired: paymentRequired as unknown as JsonValue,
      },
    },
  });
}

/**
 * Bazaar schemas replace caller-authored pointers. Admit re-derives
 * annotations, data-use, and completion evidence from the extract.
 */
function contractForBazaarSchemas(
  contract: CapabilityContractMetadata,
): CapabilityContractMetadata {
  return {
    ...contract,
    customerAnnotations: [],
    dataUse: [],
    evidence: [],
    effects: contract.effects.filter((effect) => effect.class !== "data_release"),
  };
}

function sourceQueryMapping(value: unknown):
  | readonly Readonly<{
      inputPointer: string;
      parameter: string;
    }>[]
  | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64)
    return undefined;
  const seenPointers = new Set<string>();
  const seenParameters = new Set<string>();
  const result: { inputPointer: string; parameter: string }[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.inputPointer !== "string" ||
      typeof item.parameter !== "string" ||
      !/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/.test(item.inputPointer) ||
      !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(item.parameter) ||
      seenPointers.has(item.inputPointer) ||
      seenParameters.has(item.parameter)
    )
      return undefined;
    seenPointers.add(item.inputPointer);
    seenParameters.add(item.parameter);
    result.push({ inputPointer: item.inputPointer, parameter: item.parameter });
  }
  return result;
}

/**
 * GET x402 challenges bind the full request URL, including one example query.
 * Admission identity is origin+pathname when the operation maps query inputs;
 * invoke-time matching still uses the concrete request URL.
 */
function x402ResourceUrlBindsEndpoint(
  resourceUrl: string,
  endpoint: string,
  method: "GET" | "POST",
  queryMapped: boolean,
): boolean {
  const resource = validPublicHttpsEndpoint(resourceUrl);
  const admitted = validPublicHttpsEndpoint(endpoint);
  if (
    resource === undefined ||
    admitted === undefined ||
    resource.hash !== "" ||
    admitted.hash !== "" ||
    resource.origin !== admitted.origin ||
    resource.pathname !== admitted.pathname
  ) {
    return false;
  }
  if (method === "GET" && queryMapped) return true;
  return resource.href === admitted.href;
}
