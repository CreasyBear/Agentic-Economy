import { isProviderConnectionCredentialRef } from "../provider-connection";
import { credentialFromEnvironment } from "./server-credential";
import { probeRequestDigest } from "./graph/probe-digest";
import { validPublicHttpsEndpoint } from "./transport-adapters";
import {
  aeQuoteProbeCommand,
  httpJsonProbeCommand,
} from "./readiness-probe-http";
import { mcpProbeCommand } from "./readiness-probe-mcp";
import { x402ProbeCommand } from "./readiness-probe-x402";
import {
  unhealthy,
  type CapabilityProbeDependencies,
  type CapabilityProbeObservation,
  type CapabilityProbeOutcome,
  type CapabilityProbeTarget,
  type ProbeCommand,
} from "./readiness-probe-shared";

export type {
  CapabilityProbeDependencies,
  CapabilityProbeObservation,
  CapabilityProbeOutcome,
  CapabilityProbeTarget,
};

export async function runCapabilityReadinessProbe(
  target: CapabilityProbeTarget,
  dependencies: CapabilityProbeDependencies,
): Promise<CapabilityProbeObservation> {
  const now = (dependencies.now ?? Date.now)();
  const requestDigest = probeRequestDigest(target);
  const base = { targetDigest: target.targetDigest, requestDigest };
  const command = probeCommandFor(target.adapterId);

  const parsed = command.parse(target);
  if (parsed.kind === "invalid") {
    return unhealthy(now, base, "ready", "response_invalid", [parsed.evidence]);
  }
  const credentialPlacement = command.credentialPlacement(target, parsed);
  if (credentialPlacement.kind === "mismatch") {
    return unhealthy(now, base, "unavailable", "credential_unavailable", [
      "probe:credential_unavailable",
    ]);
  }

  const endpoint = validPublicHttpsEndpoint(target.endpointUrl);
  if (endpoint === undefined) {
    return unhealthy(now, base, "ready", "target_not_public", [
      "probe:target_not_public",
    ]);
  }
  let targetIsPublic: boolean;
  try {
    targetIsPublic = await dependencies.validateTarget(endpoint);
  } catch {
    targetIsPublic = false;
  }
  if (!targetIsPublic) {
    return unhealthy(now, base, "ready", "target_not_public", [
      "probe:target_not_public",
    ]);
  }

  let credential: string | undefined;
  if (credentialPlacement.kind === "required") {
    const authority = target.authority;
    if (authority.kind !== "provider_connection") {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
    let reference: string | undefined;
    try {
      reference =
        await dependencies.resolveProviderConnectionCredential(authority);
    } catch {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
    if (reference === undefined || reference.trim().length === 0) {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
    credential =
      dependencies.resolveCredential?.(reference) ??
      (isProviderConnectionCredentialRef(reference)
        ? credentialFromEnvironment(reference)
        : reference);
    if (
      credential === undefined ||
      credential.trim().length === 0 ||
      isProviderConnectionCredentialRef(credential)
    ) {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
  }

  const credentialEvidence =
    credentialPlacement.kind === "required"
      ? "probe:credential_resolved"
      : "probe:credential_not_required";
  return await command.execute({
    target,
    endpoint,
    parsed,
    credential,
    send: dependencies.send,
    now,
    base,
    credentialEvidence,
  });
}

type RegisteredProbeAdapterId =
  | "http-json:v1"
  | "mcp-jsonrpc:v1"
  | "x402-fetch:v2";

function isRegisteredProbeAdapterId(
  adapterId: string,
): adapterId is RegisteredProbeAdapterId {
  return (
    adapterId === "http-json:v1" ||
    adapterId === "mcp-jsonrpc:v1" ||
    adapterId === "x402-fetch:v2"
  );
}

function probeCommandFor(adapterId: string): ProbeCommand {
  if (!isRegisteredProbeAdapterId(adapterId)) return aeQuoteProbeCommand;
  switch (adapterId) {
    case "http-json:v1":
      return httpJsonProbeCommand;
    case "mcp-jsonrpc:v1":
      return mcpProbeCommand;
    case "x402-fetch:v2":
      return x402ProbeCommand;
    default: {
      const _exhaustive: never = adapterId;
      return _exhaustive;
    }
  }
}
