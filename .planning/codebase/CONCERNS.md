# Current Concerns

The old answer-thread, harness, artifact, run-viewer, and evaluator sprawl is
removed from current source. The remaining risks are operational or belong to
the narrow Operation/chat design.

## Irreversible legacy-table deletion

The eleven old tables may still exist as undeclared production data. Dashboard
deletion is irreversible and must occur only after Release B is verified. A
separate typed human confirmation and deletion record is required for each
table; never batch-confirm them.

## Sensitive rollback exports

The original Convex export ZIP and eleven extracted `documents.jsonl` files may
contain private production data. Store them with restricted access, verified
counts/bytes/SHA-256 digests, and an explicit retention/disposal policy. Do not
attach them to ordinary CI artifacts.

## Exact deployment identity

A clean source branch does not identify production. Drain observation, export,
Release A, Release B, staging smoke, gateway smoke, and deletion records must all
name the exact deployment and source revision. Local `.env.local` values are not
production evidence.

## External smoke remains human-gated

OpenRouter streaming, Clerk sign-in, Convex scheduling, provider delivery,
payment, recovery, and settlement can drift after local tests pass. The staging
chat smoke and production paid gateway smoke require protected credentials and,
for paid work, explicit spend consent. They cannot be inferred from CI source
proof.

## Single model/provider dependency

Chat intentionally uses one `AE_LLM_MODEL` through OpenRouter. This removes
catalogue complexity but makes chat availability and tool-call quality dependent
on that model/provider pair. Keep deterministic `mockModel` coverage and verify
the selected model in staging before release; do not reintroduce dynamic model
discovery without a measured need.

## Share and proxy secret rotation

`AE_CHAT_SHARE_SECRET`, `AE_CHAT_SHARE_KEY_ID`, and `AE_CHAT_PROXY_SECRET` are
security boundaries. Rotation must keep configuration and deployment ordering
coherent. Share generations/verifiers must continue to reject revoked or old
links, and the anonymous Convex action must remain indistinguishable from absent
when the proxy secret is wrong.

## CDP external-package seam

Convex Node execution externalizes `@coinbase/cdp-sdk` in `convex.json` to avoid
bundling its optional platform graph. A Convex/CDP package update can change that
assumption. Preserve the import-boundary test proving the external-package list,
the absence of an `@x402/svm` root dependency/import, and the production x402
smoke before changing this seam.

## Operational completion still pending

This branch is a Release-B source candidate only. There is no repository proof
that production drain/export/deploy/deletion or exact-revision staging occurred.
The complete pending evidence list and rollback sequence are in
`ARCHITECTURE.md`.
