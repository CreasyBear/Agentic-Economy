import type { CapabilityTransportBindingRegistration } from "@/modules/capability-supply/public";
import type {
  HttpJsonTransportConfiguration,
  McpJsonRpcTransportConfiguration,
  X402FetchTransportConfiguration,
} from "./transport-adapters";

export const HEALTHY_TTL_MS = 6 * 60 * 60_000;
export const UNHEALTHY_TTL_MS = 60 * 60_000;
export const MAX_RESPONSE_BYTES = 64 * 1024;

export type CapabilityProbeTarget = Readonly<{
  publicationRef: string;
  revision: number;
  bindingId: string;
  capabilityId: string;
  endpointUrl: string;
  authority: CapabilityTransportBindingRegistration["authority"];
  adapterId: string;
  probeQuery?: readonly Readonly<{ parameter: string; value: string }>[];
  probeMethod?: "GET" | "POST";
  transportConfigJson?: string;
  probeInputJson?: string;
  outputSchemaJson?: string;
  expectedPaymentJson?: string;
  targetDigest: string;
}>;

export type CapabilityProbeObservation = Readonly<{
  targetDigest: string;
  requestDigest: string;
  responseStatus?: number;
  responseContentType?: string;
  responseDigest?: string;
  outcome: CapabilityProbeOutcome;
  credentialState: "ready" | "unavailable";
  healthState: "healthy" | "unhealthy";
  observedAt: number;
  validUntil: number;
  evidenceRefs: readonly string[];
}>;

export type CapabilityProbeOutcome =
  | "healthy"
  | "credential_unavailable"
  | "credential_rejected"
  | "target_not_public"
  | "transport_unreachable"
  | "http_redirect"
  | "http_4xx"
  | "http_5xx"
  | "response_content_type_invalid"
  | "response_too_large"
  | "response_invalid";

export type CapabilityProbeDependencies = Readonly<{
  /**
   * Returns the current opaque `env:` locator from the authority row. Tests may
   * inject a resolved value; production resolves the locator through the
   * server-only helper immediately before the request.
   */
  resolveProviderConnectionCredential: (
    authority: Extract<
      CapabilityTransportBindingRegistration["authority"],
      { kind: "provider_connection" }
    >,
  ) => Promise<string | undefined>;
  resolveCredential?: (reference: string) => string | undefined;
  validateTarget: (url: URL) => Promise<boolean>;
  send: (request: Request) => Promise<Response>;
  now?: () => number;
}>;

export type ProbeParseEvidence =
  | "probe:request_unrepresentable"
  | "probe:mcp_protocol_unsupported";

export type ParsedProbeConfiguration =
  | Readonly<{
      kind: "valid";
      transport: "http";
      http: HttpJsonTransportConfiguration;
    }>
  | Readonly<{
      kind: "valid";
      transport: "mcp";
      mcp: McpJsonRpcTransportConfiguration;
    }>
  | Readonly<{
      kind: "valid";
      transport: "x402";
      x402: X402FetchTransportConfiguration;
    }>
  | Readonly<{ kind: "valid"; transport: "none" }>
  | Readonly<{ kind: "invalid"; evidence: ProbeParseEvidence }>;

export type ValidProbeConfiguration = Extract<
  ParsedProbeConfiguration,
  Readonly<{ kind: "valid" }>
>;

export type ProbeObservationBase = Readonly<{
  targetDigest: string;
  requestDigest: string;
}>;

export type ProbeCommandContext = Readonly<{
  target: CapabilityProbeTarget;
  endpoint: URL;
  parsed: ValidProbeConfiguration;
  credential: string | undefined;
  send: (request: Request) => Promise<Response>;
  now: number;
  base: ProbeObservationBase;
  credentialEvidence: string;
}>;

export type ProbeCommand = Readonly<{
  parse: (target: CapabilityProbeTarget) => ParsedProbeConfiguration;
  credentialPlacement: (
    target: CapabilityProbeTarget,
    parsed: ValidProbeConfiguration,
  ) => Readonly<{ kind: "required" | "none" | "mismatch" }>;
  execute: (context: ProbeCommandContext) => Promise<CapabilityProbeObservation>;
}>;

export type ResponseMetadata = Readonly<{
  responseStatus?: number;
  responseContentType?: string;
  responseDigest?: string;
}>;

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function responseMetadata(response: Response): ResponseMetadata {
  const contentType = response.headers.get("Content-Type")?.trim();
  return {
    responseStatus: response.status,
    ...(contentType === undefined || contentType.length === 0
      ? {}
      : { responseContentType: contentType.slice(0, 200) }),
  };
}

export function healthy(
  now: number,
  base: ProbeObservationBase,
  evidenceRefs: readonly string[],
  metadata: ResponseMetadata = {},
): CapabilityProbeObservation {
  return {
    ...base,
    ...metadata,
    outcome: "healthy",
    credentialState: "ready",
    healthState: "healthy",
    observedAt: now,
    validUntil: now + HEALTHY_TTL_MS,
    evidenceRefs: [...evidenceRefs],
  };
}

export function unhealthy(
  now: number,
  base: ProbeObservationBase,
  credentialState: "ready" | "unavailable",
  outcome: Exclude<CapabilityProbeOutcome, "healthy">,
  evidenceRefs: readonly string[],
  metadata: ResponseMetadata = {},
): CapabilityProbeObservation {
  return {
    ...base,
    ...metadata,
    outcome,
    credentialState,
    healthState: "unhealthy",
    observedAt: now,
    validUntil: now + UNHEALTHY_TTL_MS,
    evidenceRefs: [...evidenceRefs],
  };
}
