export type SupplyLandingTool = Readonly<{
  id: string;
  name: string;
  summary: string;
  boundaries: readonly string[];
  inputJsonSchema?: string;
  outputJsonSchema?: string;
}>;
export type SupplyLandingReadback<Services> =
  | Readonly<{
      kind: "available";
      tools: readonly SupplyLandingTool[];
      services: Services;
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

export type SupplyLandingPorts<Services> = Readonly<{
  listTools: () => readonly SupplyLandingToolDescriptor[];
  listServices: () => Promise<Services>;
}>;

export async function loadSupplyLandingReadback<Services>(
  ports: SupplyLandingPorts<Services>,
): Promise<SupplyLandingReadback<Services>> {
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
    const services = await ports.listServices();
    return { kind: "available", tools, services, evidence: "source" };
  } catch {
    return { kind: "error", reason: "source_unavailable", retryable: true };
  }
}
