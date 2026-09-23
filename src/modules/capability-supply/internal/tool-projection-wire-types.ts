import type { ToolComparisonFact } from "./tool-detail-compare";
import type { ToolSearchFilters, ToolSearchRanking } from "./tool-search";
import type {
  PublicCapabilityUnavailableReason,
  PublicToolCanonical,
  PublicToolDescriptor,
  PublicToolNavigationRelation,
  PublicToolRegistrySchemaVersion,
} from "./tool-projection-types";

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

export type ToolSurfaceWireNavigation = Omit<
  DeepWritable<PublicToolNavigationRelation>,
  "inputSchema"
> & {
  inputSchema?: string;
};

export type ToolSurfaceWireDescriptor = Omit<
  DeepWritable<PublicToolDescriptor>,
  "contract" | "navigation"
> & {
  contract: Omit<
    DeepWritable<PublicToolDescriptor["contract"]>,
    "inputJsonSchema" | "outputJsonSchema"
  > & {
    inputJsonSchema: string;
    outputJsonSchema: string;
  };
  navigation: ToolSurfaceWireNavigation[];
  canonical?: DeepWritable<PublicToolCanonical>;
};

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
        | "query_invalid"
        | "source_unavailable"
        | "source_capacity_exceeded";
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
