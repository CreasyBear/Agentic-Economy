import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";

import { importX402Capability, type CapabilityPublicationImport } from "../public";
import { admitOfficialBazaarFromPaymentRequired } from "./facilitator-discovery-client";
import { dereferenceOpenApiSchema } from "./schema-deref";
import type { BazaarAdmission } from "./publication-importer-x402-bazaar";
import {
  FACILITATOR_DISCOVERY_MAX_PAGE_SIZE,
  admittedFacilitatorDiscoveryDraft,
  decideFacilitatorDiscoveryItem,
  mapFacilitatorDiscoveryImporterRefusal,
  paymentRequiredFromDiscoveryItem,
  type FacilitatorDiscoveryAdmittedDraft,
  type FacilitatorDiscoveryAdmissionResult,
  type FacilitatorDiscoverySkip,
} from "./facilitator-discovery-ingest";
import { degradeBackend } from "@/lib/observability/degrade-backend";

export async function admitFacilitatorDiscoveryItems(
  items: readonly unknown[],
): Promise<FacilitatorDiscoveryAdmissionResult> {
  return admitItems(items);
}

async function admitItems(
  items: readonly unknown[],
): Promise<FacilitatorDiscoveryAdmissionResult> {
  const admitted: FacilitatorDiscoveryAdmittedDraft[] = [];
  const skipped: FacilitatorDiscoverySkip[] = [];
  for (const item of items.slice(0, FACILITATOR_DISCOVERY_MAX_PAGE_SIZE)) {
    const paymentRequired = paymentRequiredFromDiscoveryItem(item);
    if (paymentRequired === undefined) {
      skipped.push({ kind: "skip", reason: "resource_invalid" });
      continue;
    }
    const decision = decideFacilitatorDiscoveryItem(
      item,
      admitOfficialBazaarFromPaymentRequired(paymentRequired),
    );
    if (decision.kind === "skip") {
      skipped.push(decision);
      continue;
    }
    const sourceRevision = `facilitator-discovery:v1:${canonicalDigest({
      route: {
        method: decision.identity.method,
        resourceUrl: decision.identity.resourceUrl,
      },
      source: JSON.stringify(decision.import),
    }).slice(7)}`;
    const materialized = materializeOfficialBazaarX402Import(decision.import);
    if (materialized.kind === "refused") {
      skipped.push({ kind: "skip", reason: "source_invalid" });
      continue;
    }
    const sourceImport = materialized.source;
    let result;
    try {
      result = await importX402Capability(sourceImport, dereferenceOpenApiSchema);
    } catch (cause) {
      degradeBackend(cause, undefined, { site: "admitItems", reason: "source_unavailable" })
      skipped.push({ kind: "skip", reason: "source_invalid" });
      continue;
    }
    if (result.kind !== "normalized") {
      skipped.push({
        kind: "skip",
        reason: mapFacilitatorDiscoveryImporterRefusal(result.reason),
      });
      continue;
    }
    admitted.push(
      admittedFacilitatorDiscoveryDraft(
        result.draft,
        { ...decision, import: sourceImport },
        sourceRevision,
      ),
    );
  }
  if (items.length > FACILITATOR_DISCOVERY_MAX_PAGE_SIZE) {
    skipped.push({ kind: "skip", reason: "resource_invalid" });
  }
  return { admitted, skipped };
}

export type OfficialBazaarX402Materialization =
  | Readonly<{
      kind: "admitted";
      discovery: Extract<BazaarAdmission, { kind: "admitted" }>;
      source: Extract<CapabilityPublicationImport, { kind: "x402" }>;
    }>
  | Readonly<{
      kind: "refused";
      discovery: Exclude<BazaarAdmission, { kind: "admitted" }>;
    }>;

/**
 * Materializes an x402 import only after the raw Bazaar declaration embedded
 * in that exact source passes the official SDK validator and AE admission.
 * Callers cannot use a detached prior admission to authorize stripping.
 */
export function materializeOfficialBazaarX402Import(
  input: Extract<CapabilityPublicationImport, { kind: "x402" }>,
): OfficialBazaarX402Materialization {
  const paymentRequired = isRecord(input.resource)
    ? input.resource.paymentRequired
    : undefined;
  const discovery = isRecord(paymentRequired)
    ? admitOfficialBazaarFromPaymentRequired(paymentRequired)
    : { kind: "absent" as const };
  if (discovery.kind !== "admitted") return { kind: "refused", discovery };
  return {
    kind: "admitted",
    discovery,
    source: stripRawBazaarPaymentRequired(input),
  };
}

function stripRawBazaarPaymentRequired(
  input: Extract<CapabilityPublicationImport, { kind: "x402" }>,
): Extract<CapabilityPublicationImport, { kind: "x402" }> {
  if (!isRecord(input.resource) || !Object.hasOwn(input.resource, "paymentRequired")) {
    return input;
  }
  const paymentRequired = input.resource.paymentRequired;
  if (!isRecord(paymentRequired) || !isRecord(paymentRequired.extensions)) return input;
  if (!Object.hasOwn(paymentRequired.extensions, "bazaar")) return input;
  const { bazaar: _bazaar, ...extensions } = paymentRequired.extensions;
  const sanitizedPaymentRequired = Object.keys(extensions).length === 0
    ? (() => {
        const { extensions: _extensions, ...withoutExtensions } = paymentRequired;
        return withoutExtensions;
      })()
    : { ...paymentRequired, extensions };
  return {
    ...input,
    resource: { ...input.resource, paymentRequired: sanitizedPaymentRequired },
  };
}
