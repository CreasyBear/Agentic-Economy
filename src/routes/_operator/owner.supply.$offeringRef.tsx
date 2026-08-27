import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { brandNonEmpty } from "@/modules/common/ids";

import { AeOperatorShell } from "@/components/ae/layout/AeOperatorShell";
import type { OwnerOfferingEditorValue } from "@/components/ae/offerings/AeOwnerOfferings";
import {
  readOwnerOfferingSupplyServer,
  saveOwnerOfferingServer,
  type OwnerOfferingSupplyReadResult,
} from "@/components/ae/offerings/owner-offering.functions";
import { AeSupplyFunnel } from "@/components/ae/supply/AeSupplyFunnel";
import {
  filterOwnerSupplyAuthorityOptions,
  admitOwnerCapabilityServer,
  readOwnerSupplyFunnelServer,
  readOwnerProviderConnectionsServer,
  ownerSupplyActionContext,
  preflightOwnerOpenApiDocumentServer,
  preflightOwnerCapabilityServer,
  recheckOwnerCapabilityServer,
  republishOwnerCapabilityServer,
  runOwnerSupplyReadinessServer,
  runOwnerSupplyTestServer,
  withdrawOwnerCapabilityServer,
  type OwnerSupplyAdmissionResult,
  type OwnerSupplyCommandResult,
  type OwnerSupplyMaintenanceInput,
  type SupplyFunnelActionContext,
  type SupplyFunnelRefusal,
  type SupplyFunnelStepCompletion,
} from "@/modules/capability-supply/supply-funnel.functions";
import { operatorRouteOptions } from "@/lib/operator/route-options";

export const Route = createFileRoute("/_operator/owner/supply/$offeringRef")({
  ...operatorRouteOptions,
  loader: async ({ params }) => {
    const offerings = await readOwnerOfferingSupplyServer();
    if (offerings.kind !== "available") {
      return {
        supply: offerings,
        offerings,
        source: undefined,
        durableOffering: undefined,
        authorityOptions: [],
      };
    }
    const [supply, authorityOptions] = await Promise.all([
      readOwnerSupplyFunnelServer({
        data: { businessId: offerings.businessId },
      }),
      readOwnerProviderConnectionsServer(),
    ]);
    const source = offerings.offerings.find(
      (item) => item.offeringRef === params.offeringRef,
    );
    const durableOffering =
      supply.kind === "available"
        ? supply.offerings.find(
            (item) => item.offeringRef === params.offeringRef,
          )
        : undefined;
    return {
      supply,
      offerings,
      source,
      durableOffering,
      authorityOptions,
    };
  },
  head: () => ({
    meta: [
      { title: "Prepare Operation | Agentic Economy" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerSupplyDetailRoute,
});
function OwnerSupplyDetailRoute() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const requestKey = useRef<string | undefined>(undefined);
  const preflightDocument = useServerFn(preflightOwnerOpenApiDocumentServer);
  const preflight = useServerFn(preflightOwnerCapabilityServer);
  const admit = useServerFn(admitOwnerCapabilityServer);
  const readiness = useServerFn(runOwnerSupplyReadinessServer);
  const test = useServerFn(runOwnerSupplyTestServer);
  const recheck = useServerFn(recheckOwnerCapabilityServer);
  const withdraw = useServerFn(withdrawOwnerCapabilityServer);
  const republish = useServerFn(republishOwnerCapabilityServer);
  const durableOffering = result.durableOffering;
  const editorSource = result.source;
  if (result.supply.kind === "incomplete") {
    return (
      <AeOperatorShell
        operatorRole="owner"
        title="Prepare Operation"
        description="We could not load this Operation completely."
        currentPath="/owner/supply"
      >
        <div className="grid gap-3">
          <Alert>
            <AlertTitle>Operation readback needs repair</AlertTitle>
            <AlertDescription>
              The owner readback reached its bounded limit before this operation
              could be joined. Return to Operations and reload.
            </AlertDescription>
          </Alert>
          <Button
            asChild
            variant="secondary"
            className="min-h-touch justify-self-start"
          >
            <Link to="/owner/supply">Return to Operations</Link>
          </Button>
        </div>
      </AeOperatorShell>
    );
  }
  if (
    result.supply.kind !== "available" ||
    result.offerings.kind !== "available" ||
    durableOffering === undefined ||
    durableOffering.sourceHash === undefined ||
    editorSource === undefined ||
    editorSource.revision === undefined
  ) {
    return (
      <AeOperatorShell
        operatorRole="owner"
        title="Prepare Operation"
        description="We could not load this Operation. Return to Operations and try again."
        currentPath="/owner/supply"
      >
        <div className="grid gap-3">
          <Alert>
            <AlertTitle>Operation unavailable</AlertTitle>
            <AlertDescription>
              We could not load this Operation. Return to Operations and try
              again.
            </AlertDescription>
          </Alert>
          <Button
            asChild
            variant="secondary"
            className="min-h-touch justify-self-start"
          >
            <Link to="/owner/supply">Return to Operations</Link>
          </Button>
        </div>
      </AeOperatorShell>
    );
  }
  const businessId = result.offerings.businessId;
  const currentOfferingRef = durableOffering.offeringRef;
  const offeringRevision = durableOffering.revision;
  const initialOffering = toEditorValue(editorSource);
  const context = ownerSupplyActionContext(businessId, durableOffering);
  const maintenance =
    (
      serverFn: (input: {
        data: OwnerSupplyMaintenanceInput;
      }) => Promise<OwnerSupplyCommandResult>,
      reasonCode: string,
    ) =>
    async (actionContext: SupplyFunnelActionContext) =>
      serverFn({
        data: {
          ...actionContext,
          operationKey: `owner-supply:${reasonCode}:${crypto.randomUUID()}`,
          correlationId: `owner-supply:${businessId}:${currentOfferingRef}`,
          reasonCode,
          evidenceRefs: ["owner-supply:funnel"],
        },
      });
  return (
    <AeOperatorShell
      operatorRole="owner"
      title={durableOffering.name}
      description="Describe the Operation, connect its API, check readiness, and run a contract test."
      currentPath="/owner/supply"
    >
      <AeSupplyFunnel
        businessId={businessId}
        offering={durableOffering}
        initialOffering={initialOffering}
        authorityOptions={filterOwnerSupplyAuthorityOptions(
          businessId,
          result.authorityOptions,
        )}
        callbacks={{
          saveOffering: async (value) => {
            requestKey.current ??= crypto.randomUUID();
            const saved = await saveOwnerOfferingServer({
              data: { businessId, requestKey: requestKey.current, value },
            });
            if (saved.kind === "saved") requestKey.current = undefined;
            return saved;
          },
          preflightDocument: async (document) =>
            preflightDocument({
              data: {
                businessId,
                offeringRef: currentOfferingRef,
                offeringRevision,
                document,
              },
            }),
          preflight: async (publicationSource) => {
            const checked = await preflight({
              data: {
                businessId,
                offeringRef: currentOfferingRef,
                offeringRevision,
                source: publicationSource,
                evidenceRefs: ["owner-supply:funnel"],
              },
            });
            if (checked.kind === "refused")
              return {
                kind: "refused",
                reason: checked.reason,
                fix: preflightFix(checked.reason),
              };
            return { kind: "prepared", prepared: checked.prepared };
          },
          admit: async (publicationSource) => {
            const admission = await admit({
              data: {
                businessId,
                offeringRef: currentOfferingRef,
                offeringRevision,
                offeringSourceHash: durableOffering.sourceHash,
                source: publicationSource,
                operationKey: `owner-supply:admission:${crypto.randomUUID()}`,
                correlationId: `owner-supply:${businessId}:${currentOfferingRef}`,
                reasonCode: "owner_supply_admission",
                evidenceRefs: ["owner-supply:funnel"],
              },
            });
            return ownerAdmissionCompletion(
              admission,
              currentOfferingRef,
              offeringRevision,
            );
          },
          runReadiness: async (actionContext) =>
            readiness({
              data: {
                ...actionContext,
                operationKey: `owner-supply:readiness:${crypto.randomUUID()}`,
              },
            }),
          runTest: async (actionContext) =>
            test({
              data: {
                ...actionContext,
                operationKey: `owner-supply:test:${crypto.randomUUID()}`,
              },
            }),
          ...(context === undefined
            ? {}
            : {
                recheck: maintenance(recheck, "owner_supply_recheck"),
                withdraw: maintenance(withdraw, "owner_supply_withdraw"),
                republish: maintenance(republish, "owner_supply_republish"),
              }),
          onReload: () => router.invalidate(),
        }}
      />
    </AeOperatorShell>
  );
}

function ownerAdmissionCompletion(
  result: OwnerSupplyAdmissionResult,
  offeringRef: string,
  revision: number,
): SupplyFunnelStepCompletion {
  if (result.kind === "refused") {
    return {
      step: "admission",
      state: "refused",
      offeringRef,
      revision,
      refusal: mapAdmissionRefusal(result.reason),
    };
  }
  return {
    step: "admission",
    state: "completed",
    offeringRef,
    revision,
    publicationRef: result.publicationRef,
    operationRef: result.operationRef,
    message:
      result.kind === "replayed"
        ? "The existing publication was admitted again."
        : "The API source was admitted and linked to this Operation.",
  };
}

function preflightFix(reason: string): string {
  switch (reason) {
    case "source_invalid":
      return "Provide a complete canonical source with valid JSON and source-specific fields.";
    case "source_unavailable":
      return "AE could not check this source. Reload and try again.";
    case "source_too_large":
    case "contract_too_large":
      return "Reduce the source or schema material below AE’s bounded size limit.";
    case "source_revision_invalid":
      return "Use a non-empty source revision with the supported length and characters.";
    case "pricing_config_invalid":
    case "price_unavailable":
      return "Make the durable paid amount match the Operation price exactly.";
    case "contract_invalid":
    case "schema_missing":
      return "Provide complete request and response JSON schemas with output evidence.";
    case "source_version_unsupported":
      return "Use an OpenAPI 3.1 document or the protocol version supported by this source.";
    case "selector_invalid":
    case "operation_not_found":
      return "Choose an operation path and method that exist in the submitted source.";
    case "openapi_query_parameter_definition_unsupported":
      return "Use direct scalar or scalar-array query parameters and omit OpenAPI Parameter.content.";
    case "openapi_query_parameter_serialization_unsupported":
      return "Use query style=form with boolean explode and allowReserved=false.";
    case "openapi_query_parameter_schema_unsupported":
      return "Use scalar or one-dimensional scalar-array query schemas with supported form serialization.";
    case "openapi_path_parameter_required":
      return "Declare every path parameter with required=true and a matching {name} path placeholder.";
    case "openapi_path_parameter_serialization_unsupported":
      return "Use simple scalar or one-dimensional scalar-array path serialization.";
    case "openapi_header_parameter_unsafe":
      return "Remove reserved credential/AE headers or declare a supported security scheme.";
    case "openapi_header_parameter_serialization_unsupported":
      return "Use non-secret simple scalar or scalar-array headers.";
    case "openapi_request_body_parameter_mix_unsupported":
      return "Use either a JSON POST body or guarded query/path/header mappings, not both.";
    case "openapi_response_status_unsupported":
      return "Declare one explicit 2xx JSON response for this operation.";
    case "openapi_media_type_unsupported":
      return "Use application/json or an application +json media type.";
    case "openapi_operation_unsupported":
      return "Select a guarded GET query/path/header operation or a JSON POST body.";
    case "transport_unsupported":
    case "target_not_public":
      return "Use one public HTTPS endpoint without private or local addressing.";
    case "commercial_metadata_inconsistent":
      return "Correct the Operation, binding, authority, timeout, and evidence metadata.";
    case "payment_required_invalid":
      return "Provide a valid x402 PaymentRequired challenge and exact payment metadata.";
    default:
      return `AE refused this source as ${reason}. Correct the named source rule and try again.`;
  }
}

function mapAdmissionRefusal(reason: string): SupplyFunnelRefusal {
  if (reason === "source_revision_invalid") return "revision_changed";
  if (reason === "catalog_offering_invalid" || reason === "offering_invalid")
    return "invalid_offering";
  if (reason === "provenance_invalid") return "authorization_denied";
  if (
    reason === "contract_too_large" ||
    reason === "contract_invalid" ||
    reason === "contract_integrity_failure"
  )
    return "source_invalid";
  if (reason === "binding_invalid" || reason === "binding_identity_conflict")
    return "adapter_config_invalid";
  if (reason === "connection_authority_stale") return "authority_stale";
  if (reason === "registration_changed") return "incompatible_revision";
  return reason as SupplyFunnelRefusal;
}

function toEditorValue(
  source: Extract<
    OwnerOfferingSupplyReadResult,
    { kind: "available" }
  >["offerings"][number],
): OwnerOfferingEditorValue {
  if (source.revision === undefined)
    throw new Error("Offering revision missing");
  return {
    offeringRef: brandNonEmpty(source.offeringRef, "OfferingRef"),
    expectedRevision: source.currentRevision,
    name: source.revision.name,
    category: source.revision.category,
    summary: source.revision.summary,
    serviceAreaSummary: source.revision.serviceAreaSummary ?? "",
    availabilitySummary: source.revision.availabilitySummary ?? "",
    pricingSummary: source.revision.pricingSummary ?? "",
    price: source.revision.price,
    status: source.status,
    accessPaths: source.accessPaths.map((path) => ({
      accessPathRef: path.accessPathRef,
      status: path.status,
      descriptor: path.descriptor,
    })),
  };
}
