# OCR findings response

**Date:** 2026-09-15  
**Status:** signed off 2026-09-15 including finding 30 IAM; plan validated; pre-flight recorded 2026-09-15; Task 1 waits on the next instruction  
**Source:** Alibaba Open Code Review v1.12.1 delegation scan (30 findings)  
**Skills:** sluice, seam-finder, contract-enforcer, idempotency-guardian, error-strategist, type-driven-designer

## Thesis

Close OCR-confirmed holes at **existing seams**. Do not reopen Tool/Quote/Call vocabulary or hosted `presentation.price` removal (C15). Finding 30 is in this run: replace `PowerUserAccess` in source; do not apply CloudFormation until Joel authorises it.

## What this is about

Not “become more secure in general.” Make the 30 named defects either **fixed at the smallest seam**, **grouped into one existing contract**, or **explicitly deferred** with a reason that survives a later session.

## Constraints that shape the design

- Product charter: funding ≠ authority ≠ purchase ≠ delivery ≠ purchase resolution.
- `AGENTS.md`: no directory reorg, no public-contract aliases, no raising the deps ratchet.
- C15 / CONCERNS: Convex still allows `offering.presentation.price`; hosted migration is the drop. This run must not add new readers of that field.
- Iceinvein: preserve unknown behaviour; test first; money/auth tasks are review-tier 3.

## What was removed from an “fix all 30 now” draft

- Rewriting OAuth, rate-limit, or Call HTTP hosts.
- Dropping `presentation.price` from the Convex validator.
- Redesigning `Package4ReleaseOpenTofu` off PowerUserAccess in the same batch as application defects.
- Touching skipped UI barrels, CSS, shadcn, JSON fixtures.

## Response legend

| Response | Meaning |
|---|---|
| **Fix** | Accepted. Change in this design’s later plan. |
| **Defer** | Real issue. Not this run. Named follow-on. |
| **Won’t-fix** | Intentional or false given surrounding contract. |

## Findings

### 1. `convex/rateLimit.ts:44` — public `admitHttp` — **Fix** (high / security)

**Channel when coded:** fast (existing mutation, one subsystem).  
**Contract:** `admitHttp` is an HTTP-edge command, not a public query. Caller must be the server function that already hashes the key.  
**Seam:** object — keep `assertAdmission`; change export from `mutationGeneric` to `internalMutation` (same shape as `admit`).  
**Preserved:** bucket names, retryAfter, chat anonymous edge.  
**Idempotency:** N/A (admission is a counter; exposing it is the bug).  
**Change:** Make `admitHttp` internal. Confirm HTTP edge still reaches it via `internal.rateLimit.admitHttp`. Add a test that a public Convex client cannot call it.

### 2. `convex/moneyAccountFunding.ts:991` — second Stripe refund books another reversal — **Fix** (high / bug)

**Channel:** main (Stripe webhook + Formance side effect).  
**MUTATION:** `prepareFundingRefundEvent`  
**Natural:** non-idempotent (Formance reversal is a side effect).  
**Protection today:** none on `reversalState` occupation.  
**Seam:** input — refuse/replay when `reversalState` is already pending or outcome_recorded. Dedup key is the **funding command / payment**, not `refundId`.  
**Guarantee:** strong — second succeeded refund of an already-reversing command returns the first reversal’s prepared/replayed result; does not book `funding-reversal:<newRefundId>`.  
**Change:** Occupy reversal state on first prepare. Characterization test: two refund IDs, one Formance reversal.

### 3. `convex/moneyAccountFunding.ts:927` — second paid checkout does not replay — **Fix** (medium / bug)

**Channel:** main (same host as #2).  
**Seam:** same prepare function. If command already `succeeded`, return replay, not `prepared`.  
**Change:** Land in the same task as #2. Same tests file.

### 4. `convex/moneyReconciliationCases.ts:73` — owner closes funding lock without source-write — **Fix** (medium / bug)

**Channel:** main (owner mutation + funding lock).  
**Contract:** `processor_difference` funding locks require a source-write admission, same as other money repairs. Self-supplied evidence is not a write.  
**Seam:** sprout a predicate already used by source-write paths; call it from `resolveOwnerCase`.  
**Change:** Refuse `processor_difference` without source-write. Owner can still close cases that are not funding locks.

### 5. `AeToolEconomics.tsx:14` — “Fixed price” when estimate unavailable — **Fix** (medium / bug)

**Channel:** fast.  
**Seam:** input — reuse `formatDisplayPrice` / unavailable branch already used by `AeToolPrice`.  
**Change:** Do not label unavailable as fixed.

### 6. `AeToolEconomics.tsx:38` — hardcoded 5% fee — **Fix** (medium / bug)

**Channel:** fast.  
**Seam:** object — pass live `fundingServiceFeeBps` already on the Balance quote. Do not invent a second price chain.  
**Change:** Render bps from constraints. Fallback copy only if constraints missing.

### 7. `AeProviderListingPage.tsx:98` — href without http(s) allowlist — **Fix** (medium / security)

**Channel:** fast.  
**Seam:** input — existing public URL helper (`isPublicHttpsUrl` or listing sanitizer). Do not trust catalog strings in `href`.  
**Change:** Only emit `https:` (and documented `http:` for localhost if that helper already allows it). Strip `javascript:`.

### 8. `supply-publication-v2.ts:321` — native x402 publish cannot admit — **Fix** (high / bug)

**Channel:** main (V2 publish + importer).  
**Root cause:** D7 retired display `presentation.price`; V2 stopped setting it; `importX402Capability` still requires it. Facilitator ingest already stuffs-then-strips.  
**Seam:** input at the importer gate only. Bind `resource.price` to the PaymentRequired accept amount. Do **not** persist `presentation.price` (C15).  
**Change:** V2 may pass a gate-only ExactAmount twin; draft persist stays pricingConfig-only.

### 9. `publication-importer-x402.ts:130` — still treats presentation.price as price of record — **Fix** (high / bug)

**Channel:** same task as #8.  
**Change:** Stop requiring `offering.presentation.price`. Validate resource.price against accept amount / `pricingConfig.managed_x402` source requirement.

### 10. `agent-access-oauth/protocol.ts:221` — any scheme on localhost — **Fix** (high / security)

**Channel:** fast.  
**CONTRACT:** `validRedirectUri(value)`  
**Requires:** no `*`; parseable URL.  
**Ensures:** scheme is `https:` **or** (`http:` AND loopback host).  
**On violation:** false.  
**Type-driven:** loopback is not “any scheme”.  
**Change:** Require `http:` or `https:` explicitly. Reject `javascript:`, `data:`, `file:`.

### 11. `rate-limit.ts:175` — unauthenticated header spoofing — **Fix** (high / security)

**Channel:** main (HTTP identity + MCP anonymous bucket).  
**Seam:** input — `requestIdentity` must not treat unauthenticated `X-Api-Key` / Bearer as a principal. Principal kind only after the existing credential verifier accepts the token.  
**Preserved:** real API keys and sessions still get principal/session buckets.  
**Change:** Unknown Bearer/X-Api-Key fall through to IP (or a dedicated `unverified` bucket that is not finer than IP).

### 12. `agent-access-oauth-api.ts:370` — sign-in never returns to authorize — **Fix** (high / bug)

**Channel:** main (OAuth HTTP + auth redirect sanitizer).  
**Root cause:** authorize sets `redirect_url` to an absolute URL; `sanitizeAuthRedirectTarget` only accepts same-origin relative paths via `search.redirect`.  
**Seam:** input — set `redirect` to a relative `/oauth/authorize?...` path (or extend sanitizer to that one route). Prefer relative path: no open-redirect widening.  
**Change:** Relative `redirect` query. Test signed-out authorize → sign-in → back to grant.

### 13. `call-api.ts:458` — missing `withHttpRateLimit` — **Fix** (high / security)

**Channel:** fast (existing wrapper).  
**Seam:** wrap — same `withHttpRateLimit` market-demand already uses.  
**Change:** Wrap Quote/Call/cancel/reconcile, supply actions, account money, funding-handoff. Do not invent a second limiter.

### 14. `api.discovery.schema.ts:38` — unauthenticated schema fan-out — **Fix** (medium / security)

**Channel:** fast. Same wrapper as #13.  
**Change:** Rate-limit `/api/discovery/schema` and `/examples`.

### 15. `call-api.ts:741` — unknown/duplicate query keys — **Fix** (medium / bug)

**Channel:** fast.  
**Seam:** existing `duplicateQueryParameterProblem` / strict query helper on registry/businesses.  
**Change:** Same 400 behaviour. Public contract becomes consistent, not new.

### 16. `agent-access/policy.ts:661` — grant tool allow-list never checked — **Fix** (medium / security)

**Channel:** main.  
**CONTRACT:** `evaluateAgentAccessTool`  
**Requires:** active grant, matching principal, environment.  
**Ensures:** `selected_tools` grants refuse `tool_not_allowed` when `agentAccessGrantAllowsTool` is false. If `tool.spend` omitted, still apply maximumSpendPerCall when the grant has a budget (or refuse `grant_material_invalid`).  
**Seam:** call the existing `agentAccessGrantAllowsTool` (already used at line 540).  
**Change:** No new policy model.

### 17. `call-authority.ts:325` — test-only remap skips approval — **Fix** (medium / security)

**Channel:** fast (one function).  
**Seam:** add the same production×`unrestricted_test_only` refusal already in `evaluateAgentAccessTool`. Do not remap unless environment is sandbox.  
**Change:** Preserve sandbox test UX. Fail closed in production.

### 18. `network-guard/public.ts:16` — SSRF misses 6to4/NAT64 — **Fix** (medium / security)

**Channel:** fast.  
**Seam:** extend the existing denylist. Decode 6to4 (`2002::/16`) and NAT64 (`64:ff9b::/96`) to IPv4 and reuse the IPv4 private check.  
**Change:** No new HTTP client.

### 19. `registry/internal/search.ts:146` — raw numeric businesses cursor — **Fix** (medium / security)

**Channel:** fast.  
**Seam:** existing opaque cursor kind `businesses`. Wrap like `/api/v1/registry`.  
**Change:** Mint/accept opaque cursors only.

### 20. `offering-api-projection.ts:254` — `descriptor: null` throws — **Fix** (medium / bug)

**Channel:** fast.  
**Error class:** recoverable (bad stored snapshot). Strong guarantee for the public projection: skip/drop the bad path, do not 500 the business.  
**Change:** Treat null as missing. Guard `accessPathRef.trim()`.

### 21. `money/internal/funding-quote.ts:83` — quotes always sandbox policy — **Fix** (medium / bug)

**Channel:** main (quote vs reserve).  
**Root cause:** constraints/quotes use `SANDBOX_COMMERCIAL_POLICY_CONTROLS`; reserve checks live Convex digest.  
**Seam:** object — pass the same commercial-policy reader reserve already uses. If that reader is Convex-only, add a server-side quote path; do not keep two truths.  
**Change:** Quoted bps/limits match reserved digest. Test: digest mismatch refused at both quote and reserve, or quote uses live digest.

### 22. `market-demand.actions.ts:191` — raw Convex cursor — **Fix** (medium / security)

**Channel:** fast. Opaque cursor wrap, authenticated.  
**Change:** Same helper as #19, different kind.

### 23. `x402-directory-index.server.ts:102` — public catalogue raw cursor — **Fix** (medium / security)

**Channel:** fast. Same as #19.  
**Change:** Wrap `indexCursor`. `/api/v1/registry` is the pattern.

### 24. `offering-supply.ts:348` — `fc`/`fd` prefix false positives — **Fix** (medium / bug)

**Channel:** fast.  
**Seam:** unique-local IPv6 is `fc00::/7` (and `fd` as a **colon-hex** host), not DNS labels.  
**Change:** Check parsed IPv6, not `startsWith('fc')`. Keep `fc2.com` / `fdic.gov` valid.

### 25. `chat/tool-card.ts:609` — Account available / Agent maximum in shareable facts — **Fix** (high / security)

**Channel:** main (inspect projection + public share sanitizer).  
**Contract:** Quote inspect facts are Quote terms, not Account funding.  
**Seam:** sprout — split “operator facts” vs “shareable facts”. Public `/s/$shareToken` already XSS-sanitizes strings; it must **drop** funding fields. Owner chat may keep them.  
**Change:** Remove those two facts from the shareable projection (or omit from `serializeToolCard` when the card is share-eligible). Characterization: share payload has price/expiry/quoteRef, not available/maximum.

### 26. `observability/internal/redaction.ts:5` — narrow key matcher — **Fix** (medium / security)

**Channel:** fast.  
**Seam:** extend the existing key regex. Do not scan all string values (too much false redaction).  
**Change:** Add `password`, `api_key`/`apiKey`, `private_key`/`privateKey`, `credential`.

### 27. `audit-events.ts:269` — secret check only Package 3 — **Fix** (medium / security)

**Channel:** fast. Same module as #28.  
**Change:** Run `containsSecretMaterial` for billing and `api_key.*` writes too.

### 28. `audit-events.ts:203` — missing state-changing events — **Fix** (medium / bug)

**Channel:** fast.  
**Change:** Add `dispute.opened` and `capability_binding.quarantined` to `stateChangingEvents`.

### 29. `.github/workflows/react-doctor.yml:17` — third-party action on a tag — **Fix** (high / security)

**Channel:** fast.  
**Change:** Pin `millionco/react-doctor` to a full commit SHA. Keep `blocking: none`. First-party `actions/checkout@v5` may stay.

### 30. `infra/package4/bootstrap/state-and-deployer.yaml:175` — PowerUserAccess — **Fix** (high / security)

**Channel:** main (CloudFormation bootstrap + OpenTofu resource set). Signed off 2026-09-15 to include in this run.  
**Seam:** replace `ManagedPolicyArns: PowerUserAccess` with an explicit service policy derived from `infra/package4/modules/release-environment` resource types (EC2, RDS, VPC, S3, KMS, logs, backup, SSM already bounded). Keep MFA `AssumeRole` and existing `Package4ReleaseIamBoundary`.  
**Preserved:** role name, session duration, human deployer user, IAM boundary SIDs.  
**Change:** Source-only CloudFormation. **No live AWS apply** until Joel authorises it. Characterization: template no longer attaches `PowerUserAccess`; actions cover every resource type the OpenTofu modules declare.

## Grouping for the later plan (not yet dispatched)

Inert / test-only first. One flip per later plan file if we split; this design expects **one implementation plan** after sign-off, with **one Flip**: “OCR-accepted defects enforced on live paths.”

| Later task | Findings | Touches (indicative) |
|---|---|---|
| A OAuth redirect contract | 10, 12 | protocol.ts, oauth-api.ts, auth-redirect tests |
| B Rate-limit identity + admitHttp | 1, 11, 13, 14 | rateLimit.ts, rate-limit.ts, call-api.ts, discovery routes |
| C Funding webhook idempotency | 2, 3, 4 | moneyAccountFunding.ts, moneyReconciliationCases.ts |
| D x402 admission vs pricingConfig | 8, 9 | supply-publication-v2.ts, publication-importer-x402.ts |
| E Agent-access tool gate | 16, 17 | policy.ts, call-authority.ts |
| F Shareable Quote facts | 25 | tool-card.ts, chat share sanitizer |
| G Catalog / cursor / SSRF / URL | 7, 18, 19, 20, 22, 23, 24 | listing, network-guard, search, projection, market-demand, x402 index, offering-supply |
| H Money quote digest | 21 | funding-quote.ts + reserve reader |
| I Copy / redaction / CI | 5, 6, 26, 27, 28, 29 | UI economics, audit, workflow |
| J Scoped deployer IAM | 30 | state-and-deployer.yaml |

## Out of scope

- Hosted `removeOfferingPrice` / dropping the Convex field.
- Vocabulary rename of historical protocol names.
- OCR native `ocr scan` re-run (needs an LLM key).
- Live AWS apply of the scoped deployer role (source lands; Joel authorises apply).

## Sign-off

Signed off 2026-09-15: all 30 findings Fix, including scoped deployer IAM in source. Next: plan at `docs/plans/2026-09-15-ocr-findings.md` and pre-flight. No product code until pre-flight clears.
