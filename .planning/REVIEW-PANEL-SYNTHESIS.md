# Review Panel Synthesis — 2026-06-27

**Question reviewed:** can the fresh repo planning package prevent `Agentic-Economy-Backup` bloat while preserving the useful Phase 35 spine?

**Panel:** Stripe platform, product truth, CEO/founder, engineering architecture, security/CSO, AI protocol, premortem/reliability, SEO/AEO, GTM launch, TypeScript standards.

## Verdict

Resolved into the planning package.

The first rewrite cut obvious surface bloat, but the panel found the same deeper failure class in every lens: the docs named good principles without making them source-owned contracts and gates.

Accepted remediation now exists in the authority docs:

- `SOURCE-MINING.md` and `source-mining/phase-1-ledger.md` for backup extraction discipline,
- `PROJECT.md` for ICP, state contracts, durable model, and module seams,
- `SECURITY-SPEC.md` for admin/auth/audit/redaction/abuse authority,
- `AI-SPEC.md` for UCP/llms/agent-discovery support matrix,
- `SEO-AEO-SPEC.md` for crawl/schema/canonical/measurement gates,
- `GTM-READINESS.md` for launch stages, ORB channels, activation, and claims register,
- `ENGINEERING-STANDARDS.md` for TypeScript/source-scan/import/review gates,
- Phase 1 `PHASE.md`/`PREMORTEM.md` for PR ordering, runtime kill-switches, repair loops, and launch rehearsal.

## Cross-panel P0/P1 decisions

| Decision | Source lenses | Accepted fix |
|---|---|---|
| Name the first ICP | Product, CEO, GTM, SEO | Launch ICP is owner/operator or admin of AU urgent/local service businesses, starting with emergency trades; not generic marketplace or developer platform. |
| Add PR00 source mining | CEO, Premortem, Engineering | Every mined backup file gets invariant kept, code rejected, fresh seam, tests, banned imports. |
| Move abuse/admin earlier | Security, Engineering, Premortem | Abuse checks, admin authority, suppression eligibility land before public discovery/routes can expose bad claims. |
| Add idempotency state | Stripe, Engineering, Security, Premortem | `operationKeys`/idempotency keys precede claim/publish/projection implementation. |
| Separate projection attempts | Stripe, Reliability, Engineering | Durable projection item/attempt/readback/retry, not only latest `indexStatus`. |
| Make AI-SPEC authority | AI protocol, SEO, Security | Phase 1 only supports AE-hosted fallback discovery and honest unavailable/degraded states. |
| Add lifecycle moat as contract | CEO, Engineering | Preserve held-money/external-authority/time-bound/proof-gap primitives as types/tests only. |
| Add source-owned admin model | Stripe, Security, Engineering | Admin membership/role/grant/revoke/break-glass state; no env-only admin authority. |
| Add SEO/AEO spec | SEO, GTM, AI | Public pages, sitemap, robots, llms, schema, canonical/noindex policy are source-owned deliverables. |
| Add GTM readiness gates | GTM, Product, CEO | Launch cannot proceed from green tests alone; owner activation/channel attribution/copy claims must be source-owned. |
| Enforce TS standards | TypeScript, Engineering | `test:ts-standards` + `test:types`; no broad strings/any/v.any/non-null; validators share one owner. |
| Add runtime kill-switches | Premortem, Security, Engineering | Source-owned operator controls pause claims/publish/registry/discovery and emergency-suppress. |

## Backup learnings retained

Keep as concepts, not copied folders:

- Phase 35 `src/lib/registry` insight: registry is the SQCT spine, not marketing copy.
- `syncClaimResult` validation lesson: publish-to-index gaps need visible readbacks and repair.
- UCP builder lesson: generated projection is good; placeholder schema URLs, payment handlers, and `.well-known` wording overclaims are bad.
- Lifecycle moat: held money, external authority, time-bound proofs, proof gaps.
- Source-owned standards: planning is not runtime, fixtures are not implementation, screenshots are not proof.
- Keep/cut/kill lesson: six of seven deferred surfaces were spine-woven, so do not copy folder topology.

## Backup patterns explicitly banned

- Global validators dump.
- Route-level Convex store construction and domain assembly.
- Public developer/agent copy calling fallback UCP `.well-known/ucp`.
- Empty endpoint rows labelled agent-callable.
- `payment_handlers` or Stripe/x402 fields before money rails exist.
- Admin authority from env or route-only guards.
- Best-effort external write with warning-only failure.
- Future-surface directories and stubs.
- Broad `string` statuses, `any`, `as any`, `v.any`, non-null assertions in domain paths.

## Remediation files

The planning package should now include:

- `PROJECT.md`
- `ENGINEERING-STANDARDS.md`
- `SOURCE-MINING.md`
- `SECURITY-SPEC.md`
- `AI-SPEC.md`
- `SEO-AEO-SPEC.md`
- `GTM-READINESS.md`
- `PRODUCT-LENS.md`
- `ROADMAP.md`
- `STATE.md`
- `phases/01-ten-star-spine-foundation/PHASE.md`
- `phases/01-ten-star-spine-foundation/PREMORTEM.md`

## Review status

All ten review agents returned `overall_correctness: incorrect` for the pre-remediation package. Their blocking findings are accepted and mapped into the files above. Any future review should evaluate the current authority docs, not the first rewrite.
