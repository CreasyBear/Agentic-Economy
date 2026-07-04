# Phase 3: Standard Agent/Builder Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 03-standard-agent-builder-discovery
**Areas discussed:** production maturity, read-only discovery, optional surface policy, support matrix, deferred developer platform

---

## Discovery posture

| Option | Description | Selected |
|--------|-------------|----------|
| Production read-only docs/readback | Docs/schema/examples/readbacks over public catalog facts only; deployed and route-tested. | ✓ |
| Developer platform | API keys, SDK/CLI/plugin, devrel/gallery by default. | |
| Agent runtime | MCP tools, invocation, protected-action descriptors. | |

**User's choice:** User wants full maturity, but no runtime theatre. The selected posture is production-real read-only discovery.
**Notes:** P3 is complete when builders can discover truthful public facts and unsupported/degraded states from deployed artifacts.

---

## Optional surfaces

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence-backed support matrix | Ship OpenAPI/API keys/MCP only when they add real route-tested value. | ✓ |
| Ship all standards | OpenAPI, MCP, API keys, SDK/CLI/plugin as platform theatre. | |
| Merchant-origin claims | Claim business-origin UCP before readback proves it. | |

**User's choice:** Agent discretion under `/ponytail full` and production directive.
**Notes:** OpenAPI read projection is likely useful if it passes parity. API keys/MCP need real production need. SDK/CLI/plugin remain future products.

---

## the agent's Discretion

- Exact docs/readback UI shape.
- Exact cache/schema version labels.
- Whether OpenAPI read projection ships in P3 after route parity exists.

## Deferred Ideas

- MCP tools, mutation surfaces, SDK/CLI/plugin, hosted MCP/BYO proxy, developer gallery, payment descriptors, protected-action descriptors.
