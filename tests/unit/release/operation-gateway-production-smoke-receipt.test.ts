import {
  digest,
  strictReceipt,
} from "./operation-gateway-production-smoke-harness";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../src/modules/common/canonical-digest";

import {
  GatewayProductionSmokeReceiptSchema,
  parseGatewayProductionSmokeReceiptText,
  resolveGatewayReceiptPath,
  type GatewayProductionSmokeReceipt,
} from "../../../tools/release/operation-gateway-production-smoke";

describe("hosted Operation gateway smoke receipt", () => {
  it("rejects same-business owner and paid control operations", () => {
    const { receiptDigest: _receiptDigest, ...material } = strictReceipt();
    const sameBusiness = {
      ...material,
      discovery: {
        ...material.discovery,
        controlBusinessId: material.smokeOwnership.businessId,
      },
    };
    expect(() =>
      GatewayProductionSmokeReceiptSchema.parse({
        ...sameBusiness,
        receiptDigest: canonicalDigest(sameBusiness),
      }),
    ).toThrow("identities collide");
  });

  it("still rejects identical owner and control operation references", () => {
    const { receiptDigest: _receiptDigest, ...material } = strictReceipt();
    const collided = {
      ...material,
      discovery: {
        ...material.discovery,
        controlOperationRef: material.discovery.ownerOperationRef,
      },
      calls: {
        ...material.calls,
        controlHttp: {
          ...material.calls.controlHttp,
          operationRef: material.discovery.ownerOperationRef,
        },
      },
      usage: {
        ...material.usage,
        controlActivity: {
          ...material.usage.controlActivity,
          operationKey: material.discovery.ownerOperationRef,
        },
      },
    };
    expect(() =>
      GatewayProductionSmokeReceiptSchema.parse({
        ...collided,
        receiptDigest: canonicalDigest(collided),
      }),
    ).toThrow("identities collide");
  });

  it("keeps the strict receipt digest-bound and release-path safe", () => {
    const receipt = strictReceipt();
    expect(() =>
      GatewayProductionSmokeReceiptSchema.parse({ ...receipt, extra: true }),
    ).toThrow();
    expect(
      parseGatewayProductionSmokeReceiptText(`${JSON.stringify(receipt)}\n \t`),
    ).toEqual(receipt);
    expect(() =>
      resolveGatewayReceiptPath("../receipt.json", "/tmp/release-test"),
    ).toThrow("outside_release_directory");
  });

  it("rejects recomputed receipts whose cross-boundary evidence does not join", () => {
    const { receiptDigest: _receiptDigest, ...material } = strictReceipt();
    const parse = (candidate: typeof material) =>
      GatewayProductionSmokeReceiptSchema.parse({
        ...candidate,
        receiptDigest: canonicalDigest(candidate),
      });
    const differentAmount = { currency: "USD", units: "1", exponent: 2 };

    const wrongPrincipal = {
      ...material,
      calls: {
        ...material.calls,
        controlHttp: {
          ...material.calls.controlHttp,
          principalDigest: digest("e"),
        },
      },
    };
    expect(() => parse(wrongPrincipal)).toThrow("principal identity mismatch");
    const wrongBuyerIdentity = {
      ...material,
      usage: {
        ...material.usage,
        buyer: {
          ...material.usage.buyer,
          baseline: {
            ...material.usage.buyer.baseline,
            principalId: "principal:other",
          },
        },
      },
    };
    expect(() => parse(wrongBuyerIdentity)).toThrow(
      "buyer principal digest mismatch",
    );

    const wrongOwnerMarker = {
      ...material,
      discovery: {
        ...material.discovery,
        ownerAuthority: {
          ...material.discovery.ownerAuthority,
          offeringName: "ae-release-smoke:wrong",
        },
      },
    };
    expect(() => parse(wrongOwnerMarker)).toThrow(
      "owner fixture marker mismatch",
    );

    const wrongActivity = {
      ...material,
      usage: {
        ...material.usage,
        controlActivity: {
          ...material.usage.controlActivity,
          transactionRef: "transaction:wrong",
        },
      },
    };
    expect(() => parse(wrongActivity)).toThrow(
      "control activity binding mismatch",
    );

    const wrongTopup = {
      ...material,
      money: {
        ...material.money,
        topup: { ...material.money.topup, buyerBalanceBefore: differentAmount },
      },
    };
    expect(() => parse(wrongTopup)).toThrow("top-up balance binding mismatch");
    const wrongTopupFee = {
      ...material,
      money: {
        ...material.money,
        topup: { ...material.money.topup, processingFee: differentAmount },
      },
    };
    expect(() => parse(wrongTopupFee)).toThrow("top-up financials mismatch");
    const wrongProviderEventIdentity = {
      ...material,
      money: {
        ...material.money,
        topup: {
          ...material.money.topup,
          providerEvent: {
            ...material.money.topup.providerEvent,
            stripeEventId: "evt:other",
          },
        },
      },
    };
    expect(() => parse(wrongProviderEventIdentity)).toThrow(
      "top-up provider event identity mismatch",
    );
    const wrongProviderEventAmount = {
      ...material,
      money: {
        ...material.money,
        topup: {
          ...material.money.topup,
          providerEvent: {
            ...material.money.topup.providerEvent,
            amount: differentAmount,
          },
        },
      },
    };
    expect(() => parse(wrongProviderEventAmount)).toThrow(
      "top-up provider event identity mismatch",
    );

    const wrongUsage = {
      ...material,
      usage: { ...material.usage, final: material.usage.afterReplay },
    };
    expect(() => parse(wrongUsage)).toThrow(
      "control or replay usage delta mismatch",
    );
    const wrongGrossSpend = {
      ...material,
      usage: {
        ...material.usage,
        final: {
          ...material.usage.final,
          grossSpend: material.usage.afterReplay.grossSpend,
        },
      },
    };
    expect(() => parse(wrongGrossSpend)).toThrow(
      "usage gross-spend delta mismatch",
    );

    const wrongSupplier = {
      ...material,
      money: {
        ...material.money,
        payout: {
          ...material.money.payout,
          supplierBusinessId: "business:wrong",
        },
      },
    };
    expect(() => parse(wrongSupplier)).toThrow("supplier identity mismatch");

    const wrongConservation = {
      ...material,
      money: {
        ...material.money,
        conservation: {
          ...material.money.conservation,
          providerNet: differentAmount,
        },
      },
    };
    expect(() => parse(wrongConservation)).toThrow(
      "money conservation mismatch",
    );
    const wrongRevocation = {
      ...material,
      refusals: { ...material.refusals, revokedCredentialDigest: digest("4") },
    };
    expect(() => parse(wrongRevocation)).toThrow(
      "revoked credential identity mismatch",
    );
  });
  it("requires keyless owner access and credential-backed control access", () => {
    const { receiptDigest: _receiptDigest, ...material } = strictReceipt();
    const parseWithAuthentication = (
      controlAuthentication: GatewayProductionSmokeReceipt["discovery"]["controlAuthentication"],
    ) => {
      const updatedMaterial = {
        ...material,
        discovery: { ...material.discovery, controlAuthentication },
      };
      return GatewayProductionSmokeReceiptSchema.parse({
        ...updatedMaterial,
        receiptDigest: canonicalDigest(updatedMaterial),
      });
    };

    expect(() => parseWithAuthentication({ kind: "ae_api_key" })).toThrow(
      "authentication evidence mismatch",
    );
    expect(
      parseWithAuthentication({
        kind: "platform_credential",
        scheme: "bearer",
      }),
    ).toBeDefined();
    expect(
      parseWithAuthentication({
        kind: "platform_credential",
        scheme: "api_key",
        in: "header",
        name: "X-API-Key",
      }),
    ).toBeDefined();
  });
});
