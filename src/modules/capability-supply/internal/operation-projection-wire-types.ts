import type { CapabilityInputExample } from "@/modules/capability-contract/public";
import type {
  PublicOperationRef,
  RegisteredOperationMappingRef,
} from "../public";
import type {
  InspectPlanResult,
  OperationComparisonFact,
  OperationSearchFilters,
  OperationSearchRanking,
  PublicCapabilityUnavailableReason,
  PublicCancellationPolicy,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicOperationAuthentication,
  PublicOperationAvailability,
  PublicOperationBusinessRef,
  PublicOperationCatalogPrice,
  PublicOperationDescriptor,
  PublicOperationNavigationRelation,
  PublicOperationOfferingRef,
  PublicOperationParameter,
  PublicOperationPrice,
  PublicOperationRegistrySchemaVersion,
  PublicOperationTransport,
  PublicRecoveryPolicy,
} from "../operation-projection";

export type OperationSurfaceWireDescriptor = {
  operationRef: PublicOperationRef;
  operationId: string;
  callVia: PublicOperationDescriptor["callVia"];
  paymentLane: PublicOperationDescriptor["paymentLane"];
  contract: {
    capabilityId: string;
    version: number;
    inputJsonSchema: string;
    outputJsonSchema: string;
    customerAnnotations: DeepWritable<
      PublicOperationDescriptor["contract"]["customerAnnotations"][number]
    >[];
    inputExamples?: DeepWritable<CapabilityInputExample[]>;
  };
  business: DeepWritable<PublicOperationBusinessRef>;
  offering: DeepWritable<PublicOperationOfferingRef>;
  summary: string;
  commercial: {
    price: DeepWritable<PublicOperationPrice>;
    priceEvidence?: DeepWritable<
      NonNullable<PublicCommercialTerms["priceEvidence"]>
    >;
    priceBreakdown?: DeepWritable<
      NonNullable<PublicCommercialTerms["priceBreakdown"]>
    >;
    materialTerms: DeepWritable<
      PublicCommercialTerms["materialTerms"][number]
    >[];
    relationship: DeepWritable<PublicCommercialTerms["relationship"]>;
  };
  dataUse: DeepWritable<PublicDataUsePolicy[number]>[];
  effects: DeepWritable<PublicEffectPolicy[number]>[];
  evidence: DeepWritable<PublicEvidencePolicy[number]>[];
  cancellation: DeepWritable<PublicCancellationPolicy>;
  recovery: DeepWritable<PublicRecoveryPolicy>;
  authentication: DeepWritable<PublicOperationAuthentication>;
  transport: DeepWritable<PublicOperationTransport>;
  provenance: DeepWritable<PublicOperationDescriptor["provenance"]>;
  availability: DeepWritable<PublicOperationAvailability>;
  navigation: OperationSurfaceWireNavigation[];
  parameters?: DeepWritable<PublicOperationParameter[]>;
  catalogPrice?: DeepWritable<PublicOperationCatalogPrice>;
};
export type DeepWritable<Value> = Value extends
  string | number | boolean | bigint | null | undefined
  ? Value
  : Value extends readonly (infer Item)[]
    ? DeepWritable<Item>[]
    : Value extends object
      ? {
          -readonly [Key in keyof Value]: DeepWritable<
            Exclude<Value[Key], undefined>
          >;
        }
      : Value;
export type OperationSurfaceWireNavigation = DeepWritable<
  Omit<PublicOperationNavigationRelation, "inputSchema">
> & { inputSchema?: string };
export type OperationSearchWireFilters = DeepWritable<OperationSearchFilters>;
type OperationComparisonWireFact = DeepWritable<OperationComparisonFact>;
type InspectPlanOk = Extract<InspectPlanResult, { kind: "ok" }>;
export type OperationSearchWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      items: OperationSurfaceWireDescriptor[];
      matchedCount: number;
      ranking: DeepWritable<OperationSearchRanking>[];
      pagination: { limit: number; nextCursor?: string; hasMore: boolean };
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "no_candidates";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      appliedFilters: OperationSearchWireFilters;
      matchedCount: number;
      ranking: DeepWritable<OperationSearchRanking>[];
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        "query_invalid" | "source_unavailable" | "source_capacity_exceeded";
      navigation: OperationSurfaceWireNavigation[];
    };
export type OperationDetailWireResult =
  | {
      kind: "found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operation: OperationSurfaceWireDescriptor;
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      reason: PublicCapabilityUnavailableReason;
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "not_found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      navigation: OperationSurfaceWireNavigation[];
    };
export type OperationCompareWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operations: OperationSurfaceWireDescriptor[];
      facts: OperationComparisonWireFact[];
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason: "query_invalid" | "operation_not_found" | "operation_unavailable";
      navigation: OperationSurfaceWireNavigation[];
    };
export type InspectPlanWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      inspectPlanRef: string;
      operationRefs: PublicOperationRef[];
      mappingRefs: RegisteredOperationMappingRef[];
      summary: {
        maximumCost: DeepWritable<InspectPlanOk["summary"]["maximumCost"]>;
        dataUse: DeepWritable<PublicDataUsePolicy[number]>[];
        effects: DeepWritable<PublicEffectPolicy[number]>[];
        expiry: number;
      };
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        | "query_invalid"
        | "operation_not_found"
        | "operation_unavailable"
        | "mapping_unavailable"
        | "mapping_incompatible"
        | "mapping_cycle";
      navigation: OperationSurfaceWireNavigation[];
    };
export type OperationSurfaceWireResult =
  | OperationSearchWireResult
  | OperationDetailWireResult
  | OperationCompareWireResult
  | InspectPlanWireResult;
