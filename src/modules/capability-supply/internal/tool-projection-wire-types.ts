import type { CapabilityInputExample } from "@/modules/capability-contract/public";
import type { PublicToolRef } from "../public";
import type {
  ToolComparisonFact,
  ToolSearchFilters,
  ToolSearchRanking,
  PublicCapabilityUnavailableReason,
  PublicCancellationPolicy,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicToolAuthentication,
  PublicToolAvailability,
  PublicToolBusinessRef,
  PublicToolCatalogPrice,
  PublicToolDescriptor,
  PublicToolNavigationRelation,
  PublicToolOfferingRef,
  PublicToolParameter,
  PublicToolPayment,
  PublicToolPrice,
  PublicToolRegistrySchemaVersion,
  PublicToolTransport,
  PublicRecoveryPolicy,
} from "../tool-projection";

export type ToolSurfaceWireDescriptor = {
  toolRef: PublicToolRef;
  toolId: string;
  callVia: PublicToolDescriptor["callVia"];
  paymentLane: PublicToolDescriptor["paymentLane"];
  contract: {
    capabilityId: string;
    version: number;
    inputJsonSchema: string;
    outputJsonSchema: string;
    customerAnnotations: DeepWritable<
      PublicToolDescriptor["contract"]["customerAnnotations"][number]
    >[];
    inputExamples?: DeepWritable<CapabilityInputExample[]>;
  };
  business: DeepWritable<PublicToolBusinessRef>;
  offering: DeepWritable<PublicToolOfferingRef>;
  summary: string;
  commercial: {
    price: DeepWritable<PublicToolPrice>;
    displayPrice?: DeepWritable<NonNullable<PublicCommercialTerms["displayPrice"]>>;
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
  authentication: DeepWritable<PublicToolAuthentication>;
  payment?: DeepWritable<PublicToolPayment>;
  transport: DeepWritable<PublicToolTransport>;
  provenance: DeepWritable<PublicToolDescriptor["provenance"]>;
  listingTier: PublicToolDescriptor["listingTier"];
  availability: DeepWritable<PublicToolAvailability>;
  navigation: ToolSurfaceWireNavigation[];
  parameters?: DeepWritable<PublicToolParameter[]>;
  catalogPrice?: DeepWritable<PublicToolCatalogPrice>;
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
export type ToolSurfaceWireNavigation = DeepWritable<
  Omit<PublicToolNavigationRelation, "inputSchema">
> & { inputSchema?: string };
export type ToolSearchWireFilters = DeepWritable<ToolSearchFilters>;
type ToolComparisonWireFact = DeepWritable<ToolComparisonFact>;
export type ToolSearchWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicToolRegistrySchemaVersion;
      query: string;
      items: ToolSurfaceWireDescriptor[];
      matchedCount?: number;
      partialResults?: boolean;
      ranking: DeepWritable<ToolSearchRanking>[];
      pagination: { limit: number; nextCursor?: string; hasMore: boolean };
      navigation: ToolSurfaceWireNavigation[];
    }
  | {
      kind: "no_candidates";
      schemaVersion: PublicToolRegistrySchemaVersion;
      query: string;
      appliedFilters: ToolSearchWireFilters;
      matchedCount?: number;
      partialResults?: boolean;
      ranking: DeepWritable<ToolSearchRanking>[];
      navigation: ToolSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicToolRegistrySchemaVersion;
      reason:
        "query_invalid" | "source_unavailable" | "source_capacity_exceeded";
      navigation: ToolSurfaceWireNavigation[];
    };
export type ToolDetailWireResult =
  | {
      kind: "found";
      schemaVersion: PublicToolRegistrySchemaVersion;
      tool: ToolSurfaceWireDescriptor;
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicToolRegistrySchemaVersion;
      toolRef: string;
      reason: PublicCapabilityUnavailableReason;
      navigation: ToolSurfaceWireNavigation[];
    }
  | {
      kind: "not_found";
      schemaVersion: PublicToolRegistrySchemaVersion;
      toolRef: string;
      navigation: ToolSurfaceWireNavigation[];
    };
export type ToolCompareWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicToolRegistrySchemaVersion;
      tools: ToolSurfaceWireDescriptor[];
      facts: ToolComparisonWireFact[];
      navigation: ToolSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicToolRegistrySchemaVersion;
      reason: "query_invalid" | "tool_not_found" | "tool_unavailable";
      navigation: ToolSurfaceWireNavigation[];
    };
export type ToolSurfaceWireResult =
  | ToolSearchWireResult
  | ToolDetailWireResult
  | ToolCompareWireResult;
