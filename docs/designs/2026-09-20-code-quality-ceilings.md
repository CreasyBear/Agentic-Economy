# Code Quality Campaign 2: Hard Ceilings

**Date:** 20 September 2026  
**Status:** Design for Campaign 2 (successor to `docs/designs/2026-09-19-code-quality-iceinvein.md`)  
**Register:** `docs/operations/code-quality-ceiling-register.md`  
**Protocol:** `docs/operations/code-quality-maturity-protocol.md` (same 5-stage lifecycle; IDs `CQ2-*`)  
**Authority:** `.cursor/rules/leaf-and-component-cleanliness.mdc` §4 and §9

---

## Thesis

> **Make the two hard ceilings true: no file in `src/` or `convex/` exceeds 1,000 lines, and page-route files are controllers under 80 lines.**

Campaign 1 closed the work it scheduled. The post-campaign re-audit found two invariants still **FAIL**: the 1,000-line hard ceiling (7 files) and the 80-line route-controller rule (24 page routes). This campaign exists to turn those two red cells green. It is not a second pass over React Doctor warnings, complexity ratchets, or the concurrent agent's procure work.

## What this is not

Campaign 1 already did type quarantine of the named 80, compound decomposition of the named top-12, four Convex façades, eleven CQS conversions, and barrel-cycle eradication to 0. Those hold. This campaign does not reopen them except where a ceiling file is also a leftover façade (`capabilityProviderOffboarding.ts`, `capabilityCallProjection.ts`).

## Wave shape

| Wave | Thesis slice | Workflows | Success metric |
| :--- | :--- | :--- | :--- |
| **Wave 1 — 1,000-line hard ceiling** | Split every *in-scope* file that is over 1,000 lines | `CQ2-01` – `CQ2-06` | `wc -l` on `src/` and `convex/` (except `_generated`) reports **zero** files > 1,000, after the one recorded deferral |
| **Wave 2 — Fat page routes** | Extract page containers from the worst operator/public routes | `CQ2-07` – `CQ2-11` | The five named routes are ≤ 80 lines |
| **Wave 3 — Remaining page routes** | Same incision on the leftover page routes over 80 | `CQ2-12`+ (staff after Wave 2) | All non-exempt `src/routes/**/*.tsx` ≤ 80 |

Wave 1 is the wave this register opens. Waves 2–3 are sketched so the campaign has a finish line, not a leftover pile.

## Cuts (deliberate)

These were on the re-audit leftover list and are **out of Campaign 2**:

| Cut | Why |
| :--- | :--- |
| `cdp-x402-payment-signer.ts` (1038) | Vendor-shaped custody wrapper (`@coinbase/cdp-sdk`). Splitting it is a signing-idempotency risk, not a ceiling win. **Recorded deferral** — Wave 1 success metric allows this one remaining >1,000 file. |
| Full `CQ-25` redesign of the call-worker / projection boundary | ADR 0002 withdrawal does not clear the still-dirty `output-adjudication.ts` consumer. Wave 1 may only do a **re-export-preserving** trim of `capabilityCallProjection.ts`. |
| All 24 Convex roots ≥ 500 | Soft warning, not the hard ceiling. Do not turn Wave 1 into Wave 4 of Campaign 1. |
| `api.*` routes | The 80-line rule is a **page-controller** rule. HTTP adapters are a different campaign. |
| `__root.tsx` | Root shell, not a page. |
| `developers.discovery.tsx` | Indirect collision with dirty discovery internals. |
| React Doctor 412 warnings / 4 errors | Advisory; different thesis. |
| `reserveAttempt` complexity 59 | Behaviour rewrite. |
| `prepareBalance` nonce burn | Deliberate Campaign 1 non-conversion (Formance replay). |
| `readAgentProviderEarnings` mutation stub | Burns no nonce. |
| Standalone money-math `.tsx`, `tool-detail/` pile, three-tier directory rename, `directory-presentation` shim | Partial invariants; not FAILs. |
| Concurrent-agent procure tests / `tool-reranker` / `routeTree.gen.ts` | Not ours. **Do not add or rename routes.** |

## Constraints that shape the design

1. **`convex/lib/<domain>/`, never `convex/<name>/`.** Campaign 1 proved the latter breaks `api.<name>.<method>`.
2. **RPC kind snapshot and string-reference ratchet stay unmodified** unless a function actually changes kind. These splits are moves.
3. **No new route files.** `routeTree.gen.ts` is already dirty. Extract containers; keep `createFileRoute` where it is.
4. **Do not touch** `src/modules/module-boundaries.ts`, `tools/dev/deps-ratchet.ts`, or procure / decision-engine / Jev files.
5. **Same gates** as Campaign 1: lint, typecheck, `deps:check` 0/0/0, tests with the known-red baseline of 6 failures in 2 files.

## Controversial decision

Leaving `cdp-x402-payment-signer.ts` over 1,000 is a recorded exception to the thesis, not a quiet miss. The alternative — splitting a Coinbase CDP signing wrapper in the same wave as five mechanical moves — spends the campaign's risk budget on the one file where being wrong is a custody bug. Revisit after Wave 1 if the other six are green.
