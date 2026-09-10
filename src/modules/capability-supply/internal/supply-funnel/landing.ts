export type SupplyLandingTool = Readonly<{
  id: string;
  name: string;
  summary: string;
  boundaries: readonly string[];
  inputJsonSchema?: string;
  outputJsonSchema?: string;
}>;
export type SupplyLandingReadback<Listings> =
  | Readonly<{
      kind: "available";
      tools: readonly SupplyLandingTool[];
      listings: Listings;
      evidence: "source" | "labelled_local_dev";
    }>
  | Readonly<{
      kind: "error";
      reason: "source_unavailable";
      retryable: true;
    }>;

type SupplyLandingToolDescriptor = Readonly<{
  id: string;
  name: string;
  summary: string;
  boundaries: readonly string[];
  inputJsonSchema?: unknown;
  outputJsonSchema?: unknown;
}>;

export type SupplyLandingPorts<Listings> = Readonly<{
  listTools: () => readonly SupplyLandingToolDescriptor[];
  listListings: () => Promise<Listings>;
}>;

export async function loadSupplyLandingReadback<Listings>(
  ports: SupplyLandingPorts<Listings>,
): Promise<SupplyLandingReadback<Listings>> {
  try {
    const tools = ports.listTools()
      .slice(0, 32)
      .map((tool) => ({
        id: tool.id,
        name: tool.name,
        summary: tool.summary,
        boundaries: tool.boundaries,
        ...(tool.inputJsonSchema === undefined
          ? {}
          : { inputJsonSchema: JSON.stringify(tool.inputJsonSchema, null, 2) }),
        ...(tool.outputJsonSchema === undefined
          ? {}
          : {
              outputJsonSchema: JSON.stringify(tool.outputJsonSchema, null, 2),
            }),
      }));
    const listings = await ports.listListings();
    return { kind: "available", tools, listings, evidence: "source" };
  } catch {
    return { kind: "error", reason: "source_unavailable", retryable: true };
  }
}
