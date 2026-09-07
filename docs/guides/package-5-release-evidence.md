> **Current-source cross-reference — 2026-09-07.** This historical record retains
> its original vocabulary, evidence, dates and release status. For current source
> Tool/Quote/Call contracts, see [PRODUCT.md](../../PRODUCT.md),
> [CONTEXT.md](../../CONTEXT.md) and the [current operating guide](./package-4-operations.md).
> The 7 September source and documentation handoffs do not establish hosted or data
> cutover, Package 6 publication, Package 7 implementation, or production readiness.

# Package 5 release evidence

**Status:** source implementation complete; external release proof open

**Observed:** 2026-09-04

## Product outcome

Package 5 now implements one Provider journey:

```text
Add service
→ preview a native source
→ connect only when the source requires it
→ select one Operation
→ review derived facts and AE terms
→ submit once
→ Published or one required action
→ monitor, correct, pause, republish or retire
```

The implementation preserves AE's Operation, authority, admission, routeability, Qualified Use and commercial boundaries. It does not add a second catalog, lifecycle authority, credential store, payment ledger, Provider status machine, retry system or connector framework.

## Mature-reference reconciliation

| Reference | Adopted mechanism | AE-owned boundary |
|---|---|---|
| Whop | Stable resource, expiring owner handoff, authoritative readback after return | Provider authority and Operation admission remain AE decisions. |
| Locus | Durable connection distinct from credentials; exact resource/scope/generation; restart, rotation and revocation | AE stores stable connection authority and keeps raw secrets in Infisical. |
| Nevermined | Maintained official protocol/API primitives and stable upstream identifiers | External metadata remains evidence until AE admits and publishes an exact Operation. |

## Implemented evidence

- OpenAPI 3.0/3.1 preview uses Scalar validation and guarded dereferencing.
- MCP preview and protected connection use the pinned official v2 client, exact remote selection, streamable HTTP, OAuth callback `finishAuth`, a fresh reconnect and paginated `tools/list`.
- Agent Plugins use pinned official 1.0 schemas, JSON file intake and one explicitly selected remote.
- x402 derives live payment/source facts through the installed official packages and retains wallet-control proof.
- Protected discovery resumes the exact attempt-bound source-selection draft after browser return or process restart.
- Provider connections preserve stable identity while secret generations rotate outside Convex; revocation fails closed locally and reports cleanup uncertainty.
- `supply.publish:v2` re-fetches source and authority before write, binds canonical source-route identity and creates one admission case.
- `supplier_operations:v1` is shared across web, HTTP/action, MCP and CLI and separates lifecycle, routeability, health, delivery and Qualified Use.
- Supplier fleets are cursor-paginated; a 10,000-Operation fixture returns one bounded page; Provider offboarding processes Operations, Offerings and connections in pages.
- Provider offboarding freezes routeability first, drains Calls and money obligations, revokes connections last, and cannot retire from Workflow status alone.
- The competing Offering editor, v1-style public writer, manual source JSON, `ae_envelope` writes and separate readiness/test/promotion ceremonies are absent from shipped Provider surfaces.

## Deterministic proof

The final changed-cone run selected every extant test file changed since the Package 5 implementation began:

```text
61 test files
508 tests executed
505 passed
3 failed outside Package 5
```

The three failures are attributable to concurrent dirty-tree work:

- two `ae doctor` expectations in a separately modified market-terminal file;
- one schema census missing a separately added Package 4 Stripe webhook inbox table.

Focused OAuth/connection/draft/boundary proof after the final reference correction passed **23/23 tests**. The complete import and architecture boundary suite passed **49/49 tests**. Full typecheck, lint, production build and Convex code generation in dry-run mode all pass on the shared tree.

The public CLI archive was rebuilt from clean committed source rather than the dirty workspace. Its package gate passed under Node 20 and Node 22, blocked programmatic imports, and verified exactly `README.md`, `dist/ae.js` and `package.json`. SHA-256:

```text
c65ba38bab5c9ae777865d8f607d23e44a515b80fb9b2713edb5133328ec5022
```

## Release gates still open

Package 5 is not yet a production or live-market claim. Promotion requires evidence from one deployed revision:

1. Real OpenAPI, MCP, Agent Plugin and x402 fixtures published through normal admission.
2. Buyer `search → inspect → invoke` succeeds for each Published Operation.
3. Static credentials and MCP OAuth survive restart and rotate/revoke through deployed Infisical.
4. Protected connection revocation immediately removes buyer routeability while public discovery remains truthful.
5. Active admission and offboarding cases survive backup restoration.
6. Web, HTTP, MCP and the packaged CLI return the same source revision, Operation identity and lifecycle.
7. Supported actual clients complete their advertised Provider/Agent continuation where applicable.
8. Package 4 legal, tax, accounting, retention, backup and real-money gates are signed before production paid supply.

No ledger item should move to `MEETS` from this document alone when its acceptance test requires live external evidence.
