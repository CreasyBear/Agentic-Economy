import { afterEach, vi } from "vitest";

import { generateText } from "ai";
import type { KeylessExecutableSourcePort } from "@/modules/capability-execution";
import { setPublicRegistrySourcePortForTests } from "@/modules/registry/registry.functions";
import type {
  OpenRouterContractServer,
  OpenRouterProsePlan,
} from "../../helpers/openrouter-contract-server";
import { createLocalE2eRegistrySourcePort } from "../../helpers/registry-local-e2e";

const hoistedAiSdkTestState = vi.hoisted(() => ({
  generateTextCalls: [] as Array<Record<string, unknown>>,
}));

export const aiSdkTestState = {
  generateTextCalls: hoistedAiSdkTestState.generateTextCalls,
};

export const emptyKeylessSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
};

type AiModuleForMock = {
  readonly [key: string]: unknown;
  readonly generateText: typeof generateText;
};

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<AiModuleForMock>();
  return {
    ...actual,
    generateText: new Proxy(actual.generateText, {
      apply(target, thisArg, args) {
        hoistedAiSdkTestState.generateTextCalls.push(
          args[0] as Record<string, unknown>,
        );
        return Reflect.apply(target, thisArg, args);
      },
    }),
  };
});

afterEach(() => {
  aiSdkTestState.generateTextCalls.length = 0;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.AE_OPENROUTER_API_BASE_URL;
});

export function matchingProviderProse(): OpenRouterProsePlan {
  return {
    oneLine: "One listed business matches this need.",
    summary:
      "The listing publishes emergency pipe repair. Scope, price, and current availability still need confirmation.",
    whatToDoNow:
      "Contact the business and ask whether it handles the work, what it costs, and when it is available.",
  };
}

export async function withAnswerToolUseAgentContract<T>(
  server: OpenRouterContractServer,
  run: () => Promise<T>,
  options?: { installRegistryPort?: boolean },
): Promise<T> {
  const restoreOpenRouter = server.installEnv();
  const previousLocalRegistry =
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E;
  const previousConvexUrl = process.env.CONVEX_URL;
  const previousPublicConvexUrl = process.env.VITE_CONVEX_URL;
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = "true";
  delete process.env.CONVEX_URL;
  delete process.env.VITE_CONVEX_URL;
  const restoreRegistry =
    options?.installRegistryPort === false
      ? undefined
      : setPublicRegistrySourcePortForTests(
          createLocalE2eRegistrySourcePort(),
        );
  try {
    return await run();
  } finally {
    restoreRegistry?.();
    if (previousLocalRegistry === undefined) {
      delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E;
    } else {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry;
    }
    if (previousConvexUrl === undefined) {
      delete process.env.CONVEX_URL;
    } else {
      process.env.CONVEX_URL = previousConvexUrl;
    }
    if (previousPublicConvexUrl === undefined) {
      delete process.env.VITE_CONVEX_URL;
    } else {
      process.env.VITE_CONVEX_URL = previousPublicConvexUrl;
    }
    restoreOpenRouter();
    await server.close();
  }
}
