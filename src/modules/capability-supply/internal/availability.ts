import type { PublicCapabilityUnavailableReason, PublicToolAvailability } from "./tool-projection-types";

/**
 * Minimal shape `availability()` needs to derive posture, plus the raw
 * lifecycle signals (`disposition`, `sourceAuthorityState`, `admission`,
 * `conformance`, `credentialState`, `healthState`, `readinessValidUntil`)
 * that a future `listRouteableCapabilitySupply` wiring will read from the
 * same object, so eligibility and presentation share one input shape and
 * can never disagree about whether a Tool is callable. `availability()`
 * itself only reads `routeable`, `integrated`, `unavailableReason` and
 * `readiness` today; the rest are carried for that shared shape and are
 * optional so either caller can populate what it has.
 */
export type CapabilityAvailabilityInput = Readonly<{
  routeable: boolean;
  integrated: boolean;
  unavailableReason?: PublicCapabilityUnavailableReason;
  readiness: Readonly<{
    observedAt?: number;
    validUntil?: number;
    lastHealthyAt?: number;
  }>;
  disposition?: "current" | "withdrawn" | "incompatible" | "superseded";
  sourceAuthorityState?: "verified" | "review_required";
  admission?: "not_admitted" | "admitted";
  conformance?: "not_conformant" | "conformant";
  credentialState?: "unobserved" | "ready" | "unavailable";
  healthState?: "unobserved" | "healthy" | "unhealthy";
  readinessValidUntil?: number;
}>;

/**
 * Posture transitions (readiness clock only; disposition short-circuits
 * such as `withdrawn`/`incompatible` are resolved upstream by
 * `publicationLifecycle` into `unavailableReason` before this input is
 * built):
 *
 *   readiness unobserved (no validUntil)
 *       -> integrated=true  -> setup_required (reason: unavailableReason ?? setup_required)
 *       -> integrated=false -> unavailable    (reason: unavailableReason ?? setup_required)
 *
 *   ready/healthy, routeable=true, validUntil > now
 *       -> routeable
 *
 *   ready/healthy, validUntil <= now (expired)
 *       -> integrated=true  -> setup_required (reason: readiness_expired)
 *       -> integrated=false -> unavailable    (reason: readiness_expired)
 *
 *   withdrawn / incompatible (unavailableReason already set upstream)
 *       -> setup_required | unavailable (reason: unavailableReason, e.g. publisher_withdrew)
 *
 * `inspection_required` always wins over the readiness clock when set as
 * `unavailableReason`.
 */
export function availability(
  input: CapabilityAvailabilityInput,
  now: number,
): PublicToolAvailability {
  const { observedAt, validUntil, lastHealthyAt } = input.readiness;
  if (input.routeable && validUntil !== undefined && validUntil > now)
    return {
      posture: "routeable",
      ...(observedAt === undefined ? {} : { observedAt }),
      ...(lastHealthyAt === undefined ? {} : { lastHealthyAt }),
      validUntil,
    };
  const reason =
    input.unavailableReason === "inspection_required"
      ? ("inspection_required" as const)
      : validUntil !== undefined && validUntil <= now
      ? ("readiness_expired" as const)
      : (input.unavailableReason ?? "setup_required");
  return {
    posture: input.integrated ? "setup_required" : "unavailable",
    ...(observedAt === undefined ? {} : { observedAt }),
    ...(validUntil === undefined ? {} : { validUntil }),
    ...(lastHealthyAt === undefined ? {} : { lastHealthyAt }),
    reason,
  };
}
