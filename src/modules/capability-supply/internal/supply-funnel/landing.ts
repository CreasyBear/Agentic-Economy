import { describeActionForAgent, listMcpActions } from "@/modules/actions";
import type { PublicServicesApiPage } from "@/modules/registry/public";
import { registryServicesListAction } from "@/modules/registry/registry.actions";

export type SupplyLandingTool = Readonly<{
  id: string;
  name: string;
  summary: string;
  boundaries: readonly string[];
  inputJsonSchema?: string;
  outputJsonSchema?: string;
}>;
export type SupplyLandingReadback =
  | Readonly<{
      kind: "available";
      tools: readonly SupplyLandingTool[];
      services: PublicServicesApiPage;
      evidence: "source" | "labelled_local_dev";
    }>
  | Readonly<{
      kind: "error";
      reason: "source_unavailable";
      retryable: true;
    }>;

export async function loadSupplyLandingReadback(): Promise<SupplyLandingReadback> {
  try {
    const tools = listMcpActions()
      .filter(
        (action) => action.readOnly && action.credentialAdmission === undefined,
      )
      .map(describeActionForAgent)
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
    const services = await registryServicesListAction.run({
      data: registryServicesListAction.schema.parse({ limit: 10 }),
      context: { caller: "ui" },
    });
    return { kind: "available", tools, services, evidence: "source" };
  } catch {
    return { kind: "error", reason: "source_unavailable", retryable: true };
  }
}
