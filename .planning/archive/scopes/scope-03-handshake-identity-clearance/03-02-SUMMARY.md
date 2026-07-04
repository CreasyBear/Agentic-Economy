# 03-02 Summary - Agent Door Identity Public Posture

**Status:** source/local complete
**Date:** 2026-07-04

## Proof ledger

| Claim | Proof level | Provider mode | Public-copy permission | Missing gate |
|---|---|---|---|---|
| Agent-door WBA verification and attribution path works | source/local + dev Convex smoke | unit fixture plus real local signer-directory HTTP server signed with `web-bot-auth`; dev Convex readback passed | no new public copy | deployed live third-party signer request |
| `agentPrincipals` source state exists and persists through source-write admission | source/local + dev Convex smoke | `npx convex dev --once` + `npm run test:dev-smoke:wba-agent-door` against dev deployment `loyal-peacock-107` passed | no public copy | production/deployed evidence artifact |
| Unsigned reads remain served and unsigned writes step up | source/local | route/integration tests | assistant boundary copy only | deployed route smoke |
| Signed identity never authorizes writes by itself | source/local | route/integration tests | assistant boundary copy only | mandate/checkpoint proof in 03-03 |
| D9 public-posture copy scan blocks identity/protocol vocabulary | source/local | copy fixtures/scans | no new public copy | real PM-05 reviewer evidence |

No booking, payment, dispatch, or autonomous fulfilment claim was introduced. Production/deployed proof is not claimed.

## Implemented

- Added a Web Bot Auth identity verifier at the quiet agent door (`/api/agent/tools`).
- Admitted only the initial OpenAI ChatGPT signer (`Signature-Agent: "https://chatgpt.com"`) while other signer families remain unverified until their signer directories and semantics are confirmed.
- Required signed requests to carry:
  - parseable HTTP Message Signature headers,
  - `tag="web-bot-auth"`,
  - `@authority` coverage,
  - `signature-agent` coverage,
  - `created` and `expires` freshness bounds,
  - an allowed and pretrusted `Signature-Agent`, and
  - a published key matching the signature `keyid`.
- Kept unsigned reads available so read-only assistant discovery does not break.
- Kept unsigned writes refused with a typed `agent_tools_signature_required` response and `Accept-Signature` challenge.
- Kept signed writes refused without a mandate/approval path: verified identity is attribution/quota/audit context only and never write authority.

## Principal model

- Added `agentPrincipals` Convex source state keyed by `(signatureAgent, keyid)`.
- Added a stable `principalId` built from `signatureAgent` and `keyid`.
- Registered observed signed identities through source-write-admitted Convex persistence under the `agent_identity` scope.
- Kept audit persistence non-authoritative for tool execution; the real dev smoke now verifies persistence by reading the Convex row back.

## Public posture

- Public and assistant-visible language stays unbranded: no Handshake/HSK/kernel/clearance/greenlight/protocol/gateway/action-contract vocabulary leaks onto human surfaces or agent descriptors.
- The agent-door action surface remains the same three assistant-callable actions:
  - `registry.search`
  - `registry.detail`
  - `inquiry.submit`
- The identity addition changes request handling and context attribution only; it does not advertise new verbs or broaden public authority.

## D9 scan coverage

- Added/kept copy scan coverage for the D9 banned identity vocabulary on public human surfaces and agent-facing tool descriptors/boundaries.
- Internal implementation paths, tests, and planning artifacts remain allowed contexts for the identity/security vocabulary.

## Verification

Verification is source/local plus one real dev Convex smoke; production/deployed proof is still not claimed:

- `npm run typecheck` — passed.
- `npm run check:convex-codegen` — passed.
- `npx vitest run tests/unit/clearance/web-bot-auth.test.ts tests/integration/agent-tools-api.test.ts` — passed, 33 tests.
- `npm run test:ts-standards` — passed.
- `npx vitest run tests/copy/scope3-handshake-banned-copy.test.ts` — passed, 6 tests.
- `npm run test:copy` — passed, 52 tests.
- `npm run test:imports` — passed.
- `npm run test:dev-smoke:wba-agent-door` — passed against dev Convex after setting `AE_SOURCE_WRITE_SECRET`, `AE_DEV_WBA_SMOKE_ENABLED=1`, and `AE_DEV_WBA_SMOKE_SECRET` on dev deployment `loyal-peacock-107`; the smoke starts a real local signer-directory HTTP server, signs the actual `/api/agent/tools` request with `web-bot-auth`, runs the real route verifier, and reads back the persisted `agentPrincipals` row.
- `npm run test:source-mining` — passed, 2 tests.
- `npm run build` — passed.

## Boundary

This does **not** claim deployed end-to-end attribution. Deployed proof remains a Scope 1 gate because it requires a live signer directory fetch, deployed route behavior, source-state readback, and captured evidence artifact.