import { z } from "zod";

import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from "@/lib/server/convex-source";
import type { PayoutStatusView, ProviderEarningsView } from "@/modules/money/public";
import type { ProviderConnectionOwnerProjection } from "../../provider-connection";
import { OWNER_SUPPLY_UNAVAILABLE_MESSAGE } from "./types";

export type OwnerProviderConnectionCommandResult =
  | Readonly<{
      kind: "applied" | "duplicate";
      connection: ProviderConnectionOwnerProjection;
      commandDigest: string;
    }>
  | Readonly<{ kind: "refused"; code: string }>;
export type OwnerProviderConnection = ProviderConnectionOwnerProjection;

export type OwnerProviderEarningsAccountReadback = Readonly<{
  currency: string;
  earnings: Readonly<{ kind: "ok" } & ProviderEarningsView>;
  payout: Readonly<{ kind: "ok" } & PayoutStatusView>;
}>;

export type OwnerProviderEarningsReadback = Readonly<
  | { kind: "error"; code: "unauthenticated" | "source_unavailable" }
  | { kind: "not_found" }
  | {
      kind: "available";
      businessId: string;
      accounts: readonly OwnerProviderEarningsAccountReadback[];
      accountsTruncated: boolean;
    }
>;

const readOwnerProviderConnectionsQuery = sourceQuery<
  Record<string, never>,
  readonly ProviderConnectionOwnerProjection[]
>("capabilityProviderConnections:listOwner");
const connectOwnerX402Mutation = sourceMutation<
  {
    businessId: string;
    resourceUrl: string;
    commandId: string;
    evidenceRefs: readonly string[];
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:connectX402Owner");
const reconnectOwnerProviderConnectionMutation = sourceMutation<
  {
    connectionRef: string;
    commandId: string;
    expectedAuthorityGeneration: number;
    expectedAuthorityDigest: string;
    evidenceRefs: readonly string[];
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:reconnectOwner");
const revokeOwnerProviderConnectionMutation = sourceMutation<
  {
    connectionRef: string;
    commandId: string;
    expectedAuthorityGeneration: number;
    expectedAuthorityDigest: string;
    evidenceRefs: readonly string[];
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:revokeOwner");
const retryOwnerProviderConnectionCleanupMutation = sourceMutation<
  {
    connectionRef: string;
    commandId: string;
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:retryOwnerCleanup");
const readOwnerProviderEarningsQuery = sourceQuery<
  Record<string, never>,
  OwnerProviderEarningsReadback
>("moneyLedger:readOwnerProviderEarnings");

export const ownerConnectionCommandSchema = z.strictObject({
  connectionRef: z.string().min(1).max(300),
  commandId: z.string().min(1).max(256),
  expectedAuthorityGeneration: z.number().int().positive(),
  expectedAuthorityDigest: z.string().min(1).max(200),
});
export const connectOwnerX402InputSchema = z.strictObject({
  businessId: z.string().min(1),
  resourceUrl: z.url().max(2_048),
  commandId: z.string().min(1).max(256),
});
export const retryOwnerProviderConnectionCleanupInputSchema =
  ownerConnectionCommandSchema.pick({ connectionRef: true, commandId: true });

export function filterOwnerSupplyAuthorityOptions<
  T extends Pick<
    ProviderConnectionOwnerProjection,
    "businessId" | "adapterId" | "credentialConfigured"
  >,
>(businessId: string, connections: readonly T[]): readonly T[] {
  return connections.filter(
    (connection) =>
      connection.businessId === businessId &&
      (connection.adapterId === "x402-fetch:v2" ||
        connection.credentialConfigured),
  );
}

export async function readOwnerProviderConnections(): Promise<
  readonly ProviderConnectionOwnerProjection[]
> {
  try {
    return await callSourceQuery(readOwnerProviderConnectionsQuery, {});
  } catch {
    throw new Error(OWNER_SUPPLY_UNAVAILABLE_MESSAGE);
  }
}

export async function connectOwnerX402({
  data,
}: {
  data: z.infer<typeof connectOwnerX402InputSchema>;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    return await callSourceMutation(connectOwnerX402Mutation, {
      ...data,
      evidenceRefs: [],
    });
  } catch {
    return { kind: "refused", code: "source_unavailable" };
  }
}

export async function reconnectOwnerProviderConnection({
  data,
}: {
  data: z.infer<typeof ownerConnectionCommandSchema>;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    return await callSourceMutation(reconnectOwnerProviderConnectionMutation, {
      ...data,
      evidenceRefs: [],
    });
  } catch {
    return { kind: "refused", code: "source_unavailable" };
  }
}

export async function revokeOwnerProviderConnection({
  data,
}: {
  data: z.infer<typeof ownerConnectionCommandSchema>;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    return await callSourceMutation(revokeOwnerProviderConnectionMutation, {
      ...data,
      evidenceRefs: [],
    });
  } catch {
    return { kind: "refused", code: "source_unavailable" };
  }
}

export async function retryOwnerProviderConnectionCleanup({
  data,
}: {
  data: z.infer<typeof retryOwnerProviderConnectionCleanupInputSchema>;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    return await callSourceMutation(
      retryOwnerProviderConnectionCleanupMutation,
      data,
    );
  } catch {
    return { kind: "refused", code: "source_unavailable" };
  }
}

export async function readOwnerProviderEarnings(): Promise<OwnerProviderEarningsReadback> {
  try {
    return await callSourceQuery(readOwnerProviderEarningsQuery, {});
  } catch {
    return { kind: "error", code: "source_unavailable" };
  }
}
