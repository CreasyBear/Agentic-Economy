# 03-01 Summary — kernel acquisition + Convex runtime spike

**Scope:** source-local hackathon spike only. Production/deployed proof is not claimed.

## Outcome

- **#16 acquisition:** `handshake-protocol-kernel@0.4.0` resolves from npm and is installed as an exact pin in `package.json` / `package-lock.json`.
- **Provenance:** npm package metadata verifies Apache-2.0, Node `>=20`, gitHead `93de6633338bf9d778c7e20edf76cece08a93b5f`, and tarball integrity `sha512-Im98MnYbkANQOiwnfEyx8Vu2OR5J9jroP6RcHSks5miOtsu2zT74Z91+sT84NBu3TI2jC8ofdWa8m+3zGvLDyw==`.
- **Vendoring:** no compiled runtime dist was vendored. `vendor/handshake-protocol-kernel/README-PROVENANCE.md` records npm provenance and the fallback finding.
- **Subpath quarantine:** `test:imports` / `test:source-mining` now fail runtime imports of `handshake-protocol-kernel/x402-protected-tool`, `/mcp`, `/http`, `/agentic-endpoint-middleware`, `/customer-edge`, `/experimental`, plus direct `@x402/*`, `viem`, and `@modelcontextprotocol/*` imports in `src/**` or `convex/**`.

## Important source finding

The npm root export resolves, but the published root bundle includes the Hono HTTP surface and does **not** export the self-hosted `HandshakeKernel` class through the allowed root export. Evidence:

- `node_modules/handshake-protocol-kernel/package.json` exports root and `/adapter-sdk`.
- `node_modules/handshake-protocol-kernel/dist/index.mjs` contains `class HandshakeKernel` internally.
- Runtime import inspection shows `HandshakeKernel` is not an exported root symbol.
- `node_modules/handshake-protocol-kernel/dist/index.mjs` contains bundled `node_modules/hono` code.

This keeps D1's exact npm acquisition usable for schema/adapter inspection, but it prevents a clean PASS for running the self-hosted kernel transition spine from the allowed root API.

## #17 spike verdict

**Verdict: FALLBACK.**

`tests/spike/handshake-convex-runtime.spike.test.ts` now exercises three paths: the pure helper, the real Convex internal mutation probe (`npx convex run spikeHandshakeRuntime:run ...`), and the real Convex fallback action (`npx convex run spikeHandshakeRuntime:runFallbackAction ...`). The fallback action calls one terminal internal mutation (`consumeGreenlightTerminal`) twice against the source-owned `operationKeys` table.

Proved:

- The Convex internal mutation probe executes the zod, `@noble`, deterministic-hash, and npm root-export verdict inside the Convex function runtime, not just in Vitest/Node.
- `@noble/hashes` SHA-256 succeeds.
- `@noble/curves` ed25519 sign/verify succeeds from an injected fixed key.
- Kernel-shipped zod v4 strict parsing succeeds via `/adapter-sdk`, and an unknown key is rejected.
- `now`, `actionContractId`, `greenlightId`, and `gateAttemptId` are injected; no `Date.now()` or random ID source is used for spike IDs.
- The action-contract hash is deterministic across repeated runs: `62c61e291d83c1134274ee331ea591211879e9d6888b6779b6dd65616c55f71e` in the fixed helper case.
- Real Convex fallback CAS is persisted by the terminal internal mutation: first consumption returns `consumed`; replay returns `already_consumed`; `terminalMutationPersisted: true`.

The spike does **not** claim a full `proposeActionContract -> evaluatePolicy -> gatewayCheck -> createReceiptExport` PASS inside one Convex mutation, because the npm package's allowed root API does not expose `HandshakeKernel`. For 03-03, do not implement a Convex `ProtocolStore` against npm root assumptions. The proved fallback execution shape is `action_plus_terminal_mutation_fallback`: run non-transactional kernel work only outside the mutation, then delegate each authority-changing consume/commit to one terminal internal Convex mutation.

## Validation gate consumption

| Gate | Verdict | Artifact |
|---|---|---|
| S3-G1 package/subpath quarantine | GO, with npm-root caveat above | `package.json`, `package-lock.json`, `vendor/handshake-protocol-kernel/README-PROVENANCE.md`, `src/lib/ui/contract-scans.ts` |
| S3-G3 Convex CAS replay proof | ADAPT/FALLBACK | `convex/spikeHandshakeRuntime.ts`, `tests/spike/handshake-convex-runtime.spike.test.ts` |

## Proof matrix

| Claim | Proof level | Provider mode | Public-copy permission | Missing gate |
|---|---|---|---|---|
| `handshake-protocol-kernel` resolves from npm at exact `0.4.0` | source/local | npm registry metadata | no public claim | none for source-local acquisition |
| Root + `/adapter-sdk` imports resolve | source/local | local npm install | no public claim | none for import resolution |
| Npm root does not expose self-hosted `HandshakeKernel` and bundles Hono | source/local | local package inspection | no public claim | package export/vendor decision before 03-03 store wiring |
| D1 forbidden subpaths are scan-quarantined | source/local | Vitest import/source-mining scans | no public claim | none for source-local scan |
| One-mutation kernel transition PASS | not proved | n/a | no public claim | allowed self-hosted kernel export or deliberate vendored core dist |
| Low-level crypto/zod/deterministic-hash/single-use-CAS spike checks pass | source/local | local Vitest + real Convex `internalMutation` probe + real Convex `internalAction` → terminal `internalMutation` run | no public claim | real full-kernel transition API before production authority |

## Targeted verification

- `npx vitest run tests/spike/handshake-convex-runtime.spike.test.ts` — PASS (5 tests, including real Convex internal mutation probe and real Convex fallback action + terminal internal mutation).
- `npm run check:convex-codegen` — PASS.
- `npm run test:imports` — PASS.
- `npm run test:source-mining` — PASS.
- `npm run typecheck` — PASS.
- Issue #1 now contains the corresponding Scope-3 decisions for #16 and #17.

## Boundaries kept

- No `src/modules/clearance/` files were created.
- No `agentPrincipal`, Web Bot Auth verifier, agent-door identity public posture, or Handshake banned-copy scan was created; those remain 03-02+ work.
- No booking, payment, dispatch, autonomous fulfillment, live/deployed, or production proof claim is introduced.
- Source/local proof only; production proof not claimed.
