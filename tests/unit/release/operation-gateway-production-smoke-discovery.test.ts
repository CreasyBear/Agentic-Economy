import {
  amount,
  controlOperationRef,
  linkedService,
  operation,
  operationRef,
  observedAt,
  serviceFetch,
  servicePage,
  strictReceipt,
} from "./operation-gateway-production-smoke-harness";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../src/modules/common/canonical-digest";

import { GatewayProductionSmokeReceiptSchema } from "../../../tools/release/operation-gateway-production-smoke";
import {
  discoverGatewayServices,
  gatewayOperationRejectionReason,
  matchGatewayServiceOperation,
} from "../../../tools/release/operation-gateway-production-smoke-discovery";

describe("hosted Operation gateway smoke discovery", () => {
  it("discovers canonical service identity across bounded cursor pages", async () => {
    const { config, urls } = serviceFetch([
      servicePage(
        [linkedService("service:owner", operationRef)],
        false,
        "cursor:1",
      ),
      servicePage(
        [
          linkedService("service:control", controlOperationRef, {
            kind: "platform_credential",
            scheme: "bearer",
          }),
        ],
        true,
      ),
    ]);
    const discovered = await discoverGatewayServices(config);
    expect(discovered.serviceCount).toBe(2);
    expect(discovered.endpointCount).toBe(2);
    expect(discovered.operations.get(operationRef)).toEqual({
      serviceId: "service:owner",
      offeringRef: operation.offering.offeringRef,
      authentication: { kind: "ae_api_key" },
    });
    expect(discovered.operations.get(controlOperationRef)?.serviceId).toBe(
      "service:control",
    );
    expect(urls).toEqual([
      "https://gateway.example/api/v1/services?limit=50",
      "https://gateway.example/api/v1/services?limit=50&cursor=cursor%3A1",
    ]);
  });

  it("fails closed for missing linkage and endpoint/detail authentication mismatch", () => {
    const missing = {
      operations: new Map(),
      serviceCount: 0,
      endpointCount: 0,
    };
    expect(() =>
      matchGatewayServiceOperation(missing, operation, "owner"),
    ).toThrow("operation_service_link_missing");
    const mismatched = {
      operations: new Map([
        [
          operationRef,
          {
            serviceId: "service:owner",
            offeringRef: operation.offering.offeringRef,
            authentication: {
              kind: "platform_credential" as const,
              scheme: "bearer" as const,
            },
          },
        ],
      ]),
      serviceCount: 1,
      endpointCount: 1,
    };
    expect(() =>
      matchGatewayServiceOperation(mismatched, operation, "owner"),
    ).toThrow("service_authentication_mismatch");
  });

  it("requires owner keyless, paid control authentication, and distinct service identities", () => {
    const ownerKeyed = {
      ...operation,
      authentication: {
        kind: "platform_credential" as const,
        scheme: "bearer" as const,
      },
    };
    const ownerKeyedDiscovery = {
      operations: new Map([
        [
          operationRef,
          {
            serviceId: "service:owner",
            offeringRef: operation.offering.offeringRef,
            authentication: ownerKeyed.authentication,
          },
        ],
      ]),
      serviceCount: 1,
      endpointCount: 1,
    };
    expect(() =>
      matchGatewayServiceOperation(ownerKeyedDiscovery, ownerKeyed, "owner"),
    ).toThrow("gateway_smoke_owner_operation_not_brokered");
    const controlKeylessDiscovery = {
      operations: new Map([
        [
          operationRef,
          {
            serviceId: "service:control",
            offeringRef: operation.offering.offeringRef,
            authentication: { kind: "ae_api_key" as const },
          },
        ],
      ]),
      serviceCount: 1,
      endpointCount: 1,
    };
    expect(() =>
      matchGatewayServiceOperation(
        controlKeylessDiscovery,
        operation,
        "control",
      ),
    ).toThrow("control_operation_authentication_unsupported");
    const { receiptDigest: _receiptDigest, ...material } = strictReceipt();
    const collided = {
      ...material,
      discovery: {
        ...material.discovery,
        controlServiceId: material.discovery.ownerServiceId,
      },
    };
    expect(() =>
      GatewayProductionSmokeReceiptSchema.parse({
        ...collided,
        receiptDigest: canonicalDigest(collided),
      }),
    ).toThrow("identities collide");
  });

  it("stops after the hard Services page cap", async () => {
    const { config } = serviceFetch(
      Array.from({ length: 100 }, (_, index) =>
        servicePage([], false, `cursor:${index}`),
      ),
    );
    await expect(discoverGatewayServices(config)).rejects.toThrow(
      "services_page_limit_exceeded",
    );
  });
  it("selects a current provider-owned paid fixed-price operation at runtime", () => {
    expect(
      gatewayOperationRejectionReason(
        {
          ...operation,
          commercial: {
            ...operation.commercial,
            price: { kind: "fixed", amount: { ...amount, units: "0" } },
          },
        },
        observedAt,
      ),
    ).toBe("gateway_smoke_candidate_free");
    expect(
      gatewayOperationRejectionReason(operation, observedAt),
    ).toBeUndefined();
  });
});
