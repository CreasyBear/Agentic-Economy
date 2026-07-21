import {
  canonicalDigest,
  isCanonicalDigest,
} from "@/modules/common/canonical-digest";
import type { StableHashValue } from "@/modules/common/stable-hash";

export type HostedPaidOperationPaymentProposalMaterial = Readonly<{
  paymentIdentifier: string;
  providerId: string;
  operationKey: string;
  operationRevision: string;
  providerEndpoint: string;
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  challengeDigest: string;
  authorizationDigest: string;
  custodyRef: string;
  preparedAt: string;
}>;

export type HostedPaidOperationPaymentProposal =
  HostedPaidOperationPaymentProposalMaterial &
    Readonly<{ proposalDigest: string }>;

const MATERIAL_KEYS = [
  "amount",
  "asset",
  "authorizationDigest",
  "challengeDigest",
  "custodyRef",
  "network",
  "operationKey",
  "operationRevision",
  "payTo",
  "paymentIdentifier",
  "preparedAt",
  "providerEndpoint",
  "providerId",
  "scheme",
] as const;

export function createHostedPaidOperationPaymentProposal(
  input: HostedPaidOperationPaymentProposalMaterial,
): HostedPaidOperationPaymentProposal {
  const material = proposalMaterial(input);
  if (!paymentProposalMaterialValid(material)) {
    throw new Error("hosted_paid_operation_payment_proposal_invalid");
  }
  return Object.freeze({
    ...material,
    proposalDigest: canonicalDigest(material as unknown as StableHashValue),
  });
}

export function hostedPaidOperationPaymentProposalValid(
  value: unknown,
): value is HostedPaidOperationPaymentProposal {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const candidate = value as Partial<HostedPaidOperationPaymentProposal>;
  const keys = Object.keys(value).sort();
  const expected = [...MATERIAL_KEYS, "proposalDigest"].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    typeof candidate.proposalDigest !== "string"
  ) {
    return false;
  }
  const material = proposalMaterial(
    candidate as HostedPaidOperationPaymentProposal,
  );
  return (
    paymentProposalMaterialValid(material) &&
    isCanonicalDigest(candidate.proposalDigest) &&
    candidate.proposalDigest ===
      canonicalDigest(material as unknown as StableHashValue)
  );
}

export function hostedPaidOperationPaymentProposalMatches(
  proposal: HostedPaidOperationPaymentProposal,
  expected: Readonly<{
    paymentIdentifier: string;
    providerId: string;
    operationKey: string;
    operationRevision: string;
    payTo: string;
    amount: string;
    custodyRef: string;
    preparedAt: string;
  }>,
): boolean {
  return (
    hostedPaidOperationPaymentProposalValid(proposal) &&
    proposal.paymentIdentifier === expected.paymentIdentifier &&
    proposal.providerId === expected.providerId &&
    proposal.operationKey === expected.operationKey &&
    proposal.operationRevision === expected.operationRevision &&
    proposal.payTo === expected.payTo &&
    proposal.amount === expected.amount &&
    proposal.custodyRef === expected.custodyRef &&
    proposal.preparedAt === expected.preparedAt
  );
}

export function hostedPaidOperationAmountFromMinorUnits(
  amountMinor: number,
): string | undefined {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return undefined;
  const whole = Math.floor(amountMinor / 100);
  const fraction = String(amountMinor % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function proposalMaterial(
  value: HostedPaidOperationPaymentProposalMaterial,
): HostedPaidOperationPaymentProposalMaterial {
  return {
    paymentIdentifier: value.paymentIdentifier,
    providerId: value.providerId,
    operationKey: value.operationKey,
    operationRevision: value.operationRevision,
    providerEndpoint: value.providerEndpoint,
    scheme: value.scheme,
    network: value.network,
    asset: value.asset,
    payTo: value.payTo,
    amount: value.amount,
    challengeDigest: value.challengeDigest,
    authorizationDigest: value.authorizationDigest,
    custodyRef: value.custodyRef,
    preparedAt: value.preparedAt,
  };
}

function paymentProposalMaterialValid(
  value: HostedPaidOperationPaymentProposalMaterial,
): boolean {
  return (
    nonEmpty(value.paymentIdentifier) &&
    nonEmpty(value.providerId) &&
    nonEmpty(value.operationKey) &&
    nonEmpty(value.operationRevision) &&
    endpointValid(value.providerEndpoint) &&
    nonEmpty(value.scheme) &&
    nonEmpty(value.network) &&
    nonEmpty(value.asset) &&
    nonEmpty(value.payTo) &&
    /^(?:0|[1-9][0-9]*)\.[0-9]{2}$/u.test(value.amount) &&
    isCanonicalDigest(value.challengeDigest) &&
    isCanonicalDigest(value.authorizationDigest) &&
    isCanonicalDigest(value.custodyRef) &&
    canonicalIsoTimestamp(value.preparedAt)
  );
}

function nonEmpty(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 500
  );
}

function endpointValid(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const endpoint = new URL(value);
    return (
      endpoint.protocol === "https:" &&
      endpoint.username === "" &&
      endpoint.password === "" &&
      endpoint.search === "" &&
      endpoint.hash === ""
    );
  } catch {
    return false;
  }
}

function canonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}
