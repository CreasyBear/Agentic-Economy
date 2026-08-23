import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";

import { importX402Capability, type CapabilityPublicationImport } from "../public";
import { admitOfficialBazaarFromPaymentRequired } from "./facilitator-discovery-client";
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

export async function admitFacilitatorDiscoveryItems(
  items: readonly unknown[],
): Promise<FacilitatorDiscoveryAdmissionResult> {
  return admitItems(items, "facilitator-discovery");
}

export async function admitRegistryPaymentRequiredItem(
  item: unknown,
): Promise<FacilitatorDiscoveryAdmissionResult> {
  return admitItems([item], "registry-graduation");
}

async function admitItems(
  items: readonly unknown[],
  revisionNamespace: "facilitator-discovery" | "registry-graduation",
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
    const sourceRevision = `${revisionNamespace}:v1:${canonicalDigest({
      route: {
        method: decision.identity.method,
        resourceUrl: decision.identity.origin + decision.identity.path,
      },
      source: JSON.stringify(decision.import),
    }).slice(7)}`;
    const sourceImport = withoutRawBazaarPaymentRequired(decision.import);
    let result;
    try {
      result = await importX402Capability(sourceImport);
    } catch {
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

function withoutRawBazaarPaymentRequired(
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
