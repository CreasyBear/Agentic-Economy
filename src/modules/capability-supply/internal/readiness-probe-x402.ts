import {
  compareExactAmounts,
  exactAmountSchema,
  rescaleExactAmount,
  type ExactAmount,
} from "@/modules/money/public";
import {
  cancelResponseBody,
  readBoundedRequestText,
} from "@/lib/server/bounded-request-body";
import { isRecord } from "@/modules/common/is-record";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  decodeX402PaymentRequiredHeader,
  validateX402PaymentRequired,
} from "./x402-payment-signer";
import {
  parseX402FetchTransportConfiguration,
  type X402FetchTransportConfiguration,
} from "./transport-adapters";
import {
  executeHttpJsonProbe,
  interpretJsonSuccess,
  parseJsonTransportConfig,
} from "./readiness-probe-http";
import {
  MAX_RESPONSE_BYTES,
  healthy,
  parseJson,
  unhealthy,
  type CapabilityProbeObservation,
  type CapabilityProbeTarget,
  type ProbeCommand,
  type ProbeObservationBase,
  type ResponseMetadata,
} from "./readiness-probe-shared";

export const x402ProbeCommand: ProbeCommand = {
  parse(target) {
    const value = parseJsonTransportConfig(target);
    if (value === undefined) {
      return { kind: "invalid", evidence: "probe:request_unrepresentable" };
    }
    const x402 = parseX402FetchTransportConfiguration(value);
    return x402 === undefined
      ? { kind: "invalid", evidence: "probe:request_unrepresentable" }
      : { kind: "valid", transport: "x402", x402 };
  },
  credentialPlacement() {
    return { kind: "none" };
  },
  execute(context) {
    return executeHttpJsonProbe(context, interpretJsonSuccess, {
      onPaymentRequired: probeX402Challenge,
    });
  },
};

type ExpectedX402Payment = Readonly<{
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  currency: string;
  routeAmountExponent: number;
  assetAmountExponent: number;
  paidAmount: ExactAmount;
}>;

async function probeX402Challenge(
  target: CapabilityProbeTarget,
  endpoint: URL,
  targetUrl: URL,
  configuration: X402FetchTransportConfiguration | undefined,
  response: Response,
  now: number,
  base: ProbeObservationBase,
  evidence: readonly string[],
  metadata: ResponseMetadata,
): Promise<CapabilityProbeObservation> {
  if (configuration === undefined) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_invalid"],
      metadata,
    );
  }
  let decoded: unknown;
  try {
    decoded = decodeX402PaymentRequiredHeader(
      response.headers.get("payment-required") ?? "",
    );
    decoded = validateX402PaymentRequired(decoded);
  } catch {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_invalid"],
      metadata,
    );
  }
  if (
    !isRecord(decoded) ||
    decoded.x402Version !== 2 ||
    !isRecord(decoded.resource) ||
    decoded.resource.url !== targetUrl.href ||
    !Array.isArray(decoded.accepts)
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_mismatch"],
      metadata,
    );
  }
  const expected = parseExpectedPayment(target.expectedPaymentJson);
  const requirement = decoded.accepts.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.scheme === configuration.scheme &&
      candidate.network === configuration.network &&
      typeof candidate.asset === "string" &&
      candidate.asset.toLowerCase() === configuration.asset.toLowerCase() &&
      typeof candidate.payTo === "string" &&
      candidate.payTo.toLowerCase() === configuration.payTo.toLowerCase(),
  );
  if (
    expected === undefined ||
    requirement === undefined ||
    !isRecord(requirement) ||
    expected.scheme !== configuration.scheme ||
    expected.network !== configuration.network ||
    expected.asset.toLowerCase() !== configuration.asset.toLowerCase() ||
    expected.payTo.toLowerCase() !== configuration.payTo.toLowerCase() ||
    expected.paidAmount.currency !== configuration.currency ||
    expected.paidAmount.exponent !== configuration.routeAmountExponent ||
    !/^(?:0|[1-9]\d{0,77})$/.test(String(requirement.amount))
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_mismatch"],
      metadata,
    );
  }
  const expectedAsset = rescaleExactAmount(
    expected.paidAmount,
    configuration.assetAmountExponent,
  );
  const received = exactAmountSchema.safeParse({
    currency: expected.paidAmount.currency,
    units: requirement.amount,
    exponent: configuration.assetAmountExponent,
  });
  if (
    expectedAsset === undefined ||
    !received.success ||
    compareExactAmounts(expectedAsset, received.data) !== 0
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_amount_mismatch"],
      metadata,
    );
  }
  const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES);
  const observedMetadata = bounded.ok
    ? { ...metadata, responseDigest: canonicalDigest(bounded.text) }
    : metadata;
  return healthy(
    now,
    base,
    [...evidence, "probe:x402_payment_required_valid"],
    observedMetadata,
  );
}

function parseExpectedPayment(
  value: string | undefined,
): ExpectedX402Payment | undefined {
  const parsed = parseJson(value ?? "");
  if (
    !isRecord(parsed) ||
    parsed.scheme !== "exact" ||
    typeof parsed.network !== "string" ||
    typeof parsed.asset !== "string" ||
    typeof parsed.payTo !== "string" ||
    typeof parsed.currency !== "string" ||
    typeof parsed.routeAmountExponent !== "number" ||
    typeof parsed.assetAmountExponent !== "number"
  )
    return undefined;
  const paidAmount = exactAmountSchema.safeParse(parsed.paidAmount);
  return paidAmount.success
    ? {
        scheme: "exact",
        network: parsed.network,
        asset: parsed.asset,
        payTo: parsed.payTo,
        currency: parsed.currency,
        routeAmountExponent: parsed.routeAmountExponent,
        assetAmountExponent: parsed.assetAmountExponent,
        paidAmount: paidAmount.data,
      }
    : undefined;
}
