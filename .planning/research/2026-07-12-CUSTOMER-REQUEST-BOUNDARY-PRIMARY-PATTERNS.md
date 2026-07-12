# Production CustomerRequest Boundary: Primary-Source Constraints

Date: 2026-07-12

Scope: engineering constraints for AE's neutral `CustomerRequest` boundary. This note separates durable registration, retry-safe commands, and live agent/tool discovery. It does not define a vertical or provider-specific workflow.

## Decisions

### 1. Published capability versions are immutable identities

The official MCP Registry requires every publication to have a unique version and states that a published version and its metadata cannot be changed. Metadata-only corrections require another version. It also recommends aligning a remote server's registry version with its API version. The registry verifies publisher namespaces, while downstream aggregators add curation and ratings rather than rewriting publisher metadata.

Sources:

- [MCP Registry versioning](https://modelcontextprotocol.io/registry/versioning)
- [MCP Registry architecture and trust boundaries](https://modelcontextprotocol.io/registry/about)

AE implication:

- Identify a registered capability by `(capabilityId, version)`, never by a mutable capability row alone.
- Canonicalize and digest the complete contract material at registration. Exact replay is idempotent; reuse of the same identity with different material is a hard conflict.
- Corrections create a new version. Retirement, admission, health, reputation, and routing eligibility are separate mutable records that reference the immutable version.
- Preserve provenance: publisher identity, contract digest, registration time, and endpoint/package reference. AE may score and route a capability, but must not silently rewrite what the publisher declared.

### 2. CustomerRequest commands use payload-bound idempotency

Stripe stores the first executed result for an idempotency key and returns that result on identical retries. It compares incoming parameters with the original request and errors when they differ. Validation failures and concurrent conflicts are not stored as completed executions. The IETF HTTPAPI working-group draft independently specifies a client-generated key, optional request fingerprint, replay of the completed result, conflict for an in-progress duplicate, and rejection when a key is reused with a different payload.

Sources:

- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [IETF HTTPAPI Idempotency-Key draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)

AE implication:

- Every mutating `CustomerRequest` command carries a caller-supplied idempotency key.
- Scope storage by caller identity plus command kind plus key; persist a canonical input digest beside the result.
- Same scope and same digest returns the original typed result. Same scope and different digest returns `idempotency_conflict`. An in-flight duplicate returns `request_in_progress` and cannot start a second execution.
- Record completion only after command execution begins. Pre-execution validation failures remain safely retryable.
- Publish the retention window and never place personal or sensitive data in an idempotency key.

### 3. Registry discovery and live tool discovery are different layers

The MCP Registry is a metadata repository intended for downstream aggregators and marketplaces. It describes where a server is and how to configure it; it is not a guarantee that a tool is currently callable. At runtime, MCP requires protocol-version and capability negotiation before operation. Tool-capable servers expose `tools/list`; each tool has a unique name and input schema, may have an output schema, and can announce that the list changed. The specification requires input validation and access controls, and advises clients to validate results, apply timeouts, and log usage.

Sources:

- [MCP Registry architecture](https://modelcontextprotocol.io/registry/about)
- [MCP lifecycle and capability negotiation](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- [MCP tools discovery and invocation](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

AE implication:

- Registration admits an immutable declared contract; qualification proves the live endpoint against that contract; routing considers only versions with current qualifying evidence.
- Store declared capability metadata separately from observed runtime tools, health, latency, authorization scope, and conformance evidence.
- Normalize discovered tools into AE capability contracts with explicit input and output schemas. Do not route from prose descriptions alone.
- Re-negotiate the live protocol and authorized tool set at the execution boundary. A registry hit is a candidate, not executable proof.
- A runtime tool-list change invalidates cached qualification for the affected version until AE rechecks it; it does not mutate the published contract.

## Required production invariants

1. No capability version can be edited in place after successful registration.
2. No mutating request can execute twice under one caller-scoped idempotency identity.
3. No idempotency key can be reused for changed command material.
4. No registered capability is treated as live solely because metadata exists.
5. No tool enters routing without a machine-readable input contract and observed qualification evidence.
6. Every routed execution records the exact capability version, contract digest, observed tool identity, and request-command identity used.

## Boundary model

`published contract version -> qualification observation -> routing eligibility -> idempotent CustomerRequest command -> version-pinned execution receipt`

This is the production seam: immutable claims, mutable evidence, deterministic selection inputs, replay-safe commands, and receipts that identify exactly what ran.
