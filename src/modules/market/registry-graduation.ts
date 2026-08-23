import type { FacilitatorDiscoveryAdmittedDraft } from "@/modules/capability-supply/convex";
import {
  admitRegistryPaymentRequiredItem,
  decodeX402PaymentRequiredHeader,
} from "@/modules/capability-supply/server";

import type { RegistryProbeRequest } from "./registry-source-contracts";

export type RegistryAdmissionCandidate = Readonly<{
  documentId: string;
  sourceDigest: string;
  probeRequest: RegistryProbeRequest;
}>;

export type RegistryGraduationResult =
  | Readonly<{
      kind: "admitted";
      documentId: string;
      sourceDigest: string;
      draft: FacilitatorDiscoveryAdmittedDraft;
    }>
  | Readonly<{
      kind: "refused";
      documentId: string;
      reason:
        | "target_invalid"
        | "request_failed"
        | "payment_required_missing"
        | "payment_required_invalid"
        | "admission_refused";
    }>;

type ProbeDependencies = Readonly<{
  send: (request: Request) => Promise<Response>;
  validateTarget?: (url: URL) => Promise<boolean>;
}>;

export async function probeRegistryEntryForAdmission(
  candidate: RegistryAdmissionCandidate,
  dependencies: ProbeDependencies,
): Promise<RegistryGraduationResult> {
  const request = requestFromCandidate(candidate.probeRequest);
  if (request === undefined) return refused(candidate, "target_invalid");
  if (
    dependencies.validateTarget !== undefined &&
    !(await dependencies.validateTarget(new URL(request.url)))
  ) {
    return refused(candidate, "target_invalid");
  }
  let response: Response;
  try {
    response = await dependencies.send(request);
  } catch {
    return refused(candidate, "request_failed");
  }
  if (response.status !== 402) return refused(candidate, "payment_required_missing");
  const header = response.headers.get("payment-required");
  if (header === null || header.length === 0 || header.length > 131_072) {
    return refused(candidate, "payment_required_invalid");
  }
  let paymentRequired: unknown;
  try {
    paymentRequired = decodeX402PaymentRequiredHeader(header);
  } catch {
    return refused(candidate, "payment_required_invalid");
  }
  const admission = await admitRegistryPaymentRequiredItem(paymentRequired);
  const draft = admission.admitted[0];
  if (draft === undefined || admission.admitted.length !== 1) {
    return refused(candidate, "admission_refused");
  }
  return {
    kind: "admitted",
    documentId: candidate.documentId,
    sourceDigest: candidate.sourceDigest,
    draft,
  };
}

function requestFromCandidate(input: RegistryProbeRequest): Request | undefined {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return undefined;
  }
  const headers = new Headers({ accept: "application/json" });
  for (const header of input.headers) headers.set(header.name, header.value);
  if (input.bodyJson !== undefined) headers.set("content-type", "application/json");
  return new Request(url, {
    method: input.method,
    headers,
    redirect: "error",
    ...(input.bodyJson === undefined ? {} : { body: input.bodyJson }),
  });
}

function refused(
  candidate: RegistryAdmissionCandidate,
  reason: Extract<RegistryGraduationResult, { kind: "refused" }>["reason"],
): RegistryGraduationResult {
  return { kind: "refused", documentId: candidate.documentId, reason };
}
