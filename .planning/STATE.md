---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 06
status: completed
stopped_at: Completed 06-06-copy-source-smoke-gates-PLAN.md
last_updated: "2026-06-29T15:25:41.336Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 31
  completed_plans: 29
  percent: 67
---

# State — Agentic Economy Fresh Repo

**Created:** 2026-06-27
**Current phase:** 06
**Status:** Phase 6 complete

## Active decision

`Agentic-Economy-Backup` is frozen as a source mine. The fresh `agentic-economy` repo is the working product repo.

Reason: Phase 35 proved the old repo has useful product insight but poor launch architecture. Six of seven deferred surfaces were spine-woven, so pruning in place would spend launch energy untangling old coupling instead of shipping a clean product.

## Current product slice

```text
claim -> publish -> public business service catalog page -> registry/search/API -> AE-hosted discovery -> operator health/repair
```

No chat, protected actions, wallet, payment, request market, skills, hosted agents, voice, or expert surfaces in Phase 1.

## Open risks

| Risk | Status | Handling |
|---|---|---|
| Bloat re-enters the fresh repo | Active | `SOURCE-MINING.md`, PR00 ledger, import/source-mining scans, hard runtime cuts |
| UCP/agent discovery overclaim | Active | `AI-SPEC.md`; AE-hosted fallback only in Phase 1; no callable/payment/MCP/OpenAPI |
| Publish succeeds but projection fails silently | Active | durable projection attempts, `indexStatus`, admin repair loop |
| Unauthorized claim/admin action | Active | Convex-derived actor/admin, CSRF, rate limit, duplicate detection, source-owned admin roles |
| Suppression leaks through one public output | Active | one eligibility predicate; suppression tests across page/search/sitemap/llms/UCP |
| ABN-first regression | Active | no-ABN claim/publish e2e and copy/form scan |
| Payment readiness cosplay | Active | Phase 1 money-identifier quarantine; Phase 5 money decision; Phase 6 direct Stripe evidence is test-mode/source-local only and does not prove production money readiness |
| Agentic economy overclaim | Active | Phase 6 is one receipt-backed business operation proof, not a generic runtime, wallet, marketplace, settlement layer, sandbox, product catalog, or provider |
| TypeScript contract drift | Active | domain-owned validators, exact unions, type tests, `test:ts-standards` |
| GTM outruns product | Active | `GTM-READINESS.md`; internal alpha before public launch |

## Next action

Phase 6 is closed as source/local proof in `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`; Round 4 code review passed with CR-01 through CR-06 and WR-01 resolved, and copy/language gates were explicitly waived by the user for this closeout only. Phase 3 local/source closeout is verified in `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md`, but deployed Phase 3 proof is not claimed until a real deployed route/readback smoke artifact exists. Final Phase 2 closeout remains blocked until deployed support/provider smoke inputs exist per `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`: prove the deployed `human_inquiry_owner_inbox` support row, run `npm run test:phase2-support-smoke`, then run real inquiry-created owner Resend and Novu provider smokes with source-owned dispatch IDs. The five-owner Phase 1 evidence gate is explicit deferred debt and still blocks internal-alpha/public-launch claims, but it no longer blocks Phase 2-6 planning/execution progress when plans label the debt honestly. Phase 5 has Autumn/Stripe money-boundary hardening and a fail-loud `npm run test:provider-smoke:autumn-stripe`; do not claim deployed money proof until that smoke passes with source-owned provider evidence. Phase 6 production/deployed Stripe proof likewise remains a future provider-smoke/deployment evidence task.

## Verification expectation

Phase 1 cannot close until the exact command suite in the plan passes, rendered compact/wide product-design evidence exists for materially changed user-facing surfaces, and deployment/readback smoke covers `/`, `/claim`, `/registry`, `/{slug}`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, and `/admin/*` non-admin denial.

## Session

**Last session:** 2026-06-29T14:19:52.150Z
**Stopped at:** Completed 06-06-copy-source-smoke-gates-PLAN.md
**Resume file:** None

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P01 | 14 min | 3 tasks | 54 files |
| Phase 01 P02 | 43 min | 8 tasks | 46 files |
| Phase 01 P03 | 32 min | 7 tasks | 25 files |
| Phase 01 P04 | 6h 56m | 6 tasks | 24 files |
| Phase 01 P06 | 37min | 6 tasks | 29 files |
| Phase 01 P07 | 26min | 6 tasks | 21 files |
| Phase 01 P08 | 35min | 7 tasks | 15 files |
| Phase 01 P09 | 1h 46m | 6 tasks | 4 files |
| Phase 01 P10 | 14min | 3 tasks | 12 files |
| Phase 01 P11 | 21min | 3 tasks | 10 files |
| Phase 01 P13 | 12min | 3 tasks | 5 files |
| Phase 01 P14 | 19min | 3 tasks | 10 files |
| Phase 01 P15 | 12min | 3 tasks | 5 files |
| Phase 06 P01 | 19m 21s | 3 tasks | 10 files |
| Phase 06 P02 | 26min | 3 tasks | 5 files |
| Phase 06 P03 | 12min | 2 tasks | 4 files |
| Phase 06 P06-04 | 27min | 2 tasks | 10 files |
| Phase 06 P06-05 | 12min | 3 tasks | 4 files |
| Phase 06 P06-06 | 12m 25s | 3 tasks | 8 files |

## Decisions

- [Phase 01]: 01-01 completed around the existing root TanStack/Vite scaffold instead of moving to apps/web. — Preserved workspace state and avoided restarting the partial substrate the orchestrator identified.
- [Phase 01]: 01-01 clean guardrail scans exclude the scanner definition file while fixture scans prove banned tokens are detected. — The scanner utility must contain the banned regex tokens it enforces; excluding only that file avoids self-matching without weakening runtime coverage.
- [Phase 01]: Kept Convex schema as a thin composition root over module-owned schema fragments. — Avoids a monolithic schema file while preserving the Convex-required default export.
- [Phase 01]: Left Convex codegen as the real Convex CLI command and recorded the missing deployment as an environment blocker. — Prevents false green checks; codegen can pass only after CONVEX_DEPLOYMENT is configured.
- [Phase 01]: Implemented PR03 behavior through module seams and fail-closed generic Convex wrappers. — Generated Convex server files remain unavailable until `CONVEX_DEPLOYMENT` is configured, so runtime mutation boundaries fail closed while seam-level behavior is tested.
- [Phase 01]: Allowed only same-module `public.ts` files to import their own internal implementations. — This enables owning public seams while route, sibling-module, and cross-module private-import bans remain active.
- [Phase 01]: Implemented PR04 admin, dispute, suppression recovery, and operator controls through source-owned module seams with fail-closed Convex wrappers. — Route guards alone are not authority, and deployment boundaries deny until generated auth/DB wiring exists.
- [Phase 01]: Kept admin route loaders fail-closed with `membership: undefined` readbacks. — Non-admins receive safe denial/readback shells without private rows; source-owned admin resolution is deferred to configured Convex deployment wiring.
- [Phase 01]: Public business APIs return explicit public DTO subsets without private ids, source hashes, MCP/OpenAPI, callable, or payment fields. — The plan stop conditions forbid raw database/private fields and future platform/action/payment surfaces.
- [Phase 01]: Admin index-health generates source/projection/repair rows but denied route reads return no private rows until real membership wiring exists. — This keeps admin readback useful in tests and fail-closed in the unauthenticated runtime shell.
- [Phase 01]: Registry search uses deterministic source-owned catalog DTO projection, not an external search engine. — Phase 1 requires no external search engine or marketplace ranking surface.
- [Phase 01]: Discovery manifests are AE-hosted fallback documents only; no merchant-origin well-known claim is emitted. — The plan forbids merchant-origin /.well-known/ucp claims and future action/payment protocol overclaims in Phase 1.
- [Phase 01]: llms.txt lists canonical links and source-owned status fields only, not owner-authored free text. — Owner-authored text is excluded from llms.txt to avoid prompt-injection, Markdown, HTML, bidi, and instruction-like prose risk.
- [Phase 01]: Discovery route availability is proven by in-process route-handler parity tests rather than hand-authored static files. — Every URL emitted by manifest, llms, sitemap, and robots must resolve through the shipped route handlers or be omitted.
- [Phase 01]: Browser gates use VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E only at command time because real Clerk keys are absent. — Route rendering could be verified locally without writing fake keys to .env.local or claiming real Clerk proof.
- [Phase 01]: Internal alpha is explicitly not ready until five real friendly-owner activation rows exist. — Plan 01-08 produced instrumentation and a one-owner rehearsal record only; GTM requires five owner evidence rows plus friction/failure notes.
- [Phase 01]: ROADMAP progress update was skipped for Plan 01-08 to avoid mixing pre-existing dirty planning changes. — User explicitly warned not to stage or modify unrelated dirty planning files; ROADMAP.md was already dirty before this execution.
- [Phase 01]: Deploy smoke fails loudly when deployment env, Convex URL, Clerk storage states, or business slug are absent. — A silent skip would create false deploy/readback proof.
- [Phase 01]: Plan 01-10 continued existing dirty Convex bridge work but staged only auth/source-state files and required schema/test support. — Preserved useful partial work while avoiding unrelated billing, Phase 2-5, ROADMAP, and future-surface changes.
- [Phase 01]: Convex actor authority now derives from `ctx.auth.getUserIdentity()` plus source-owned admin membership rows. — Browser-supplied owner/admin/Clerk fields are ignored by the shared authz helper.
- [Phase 01]: Convex codegen proof later passed during the formal R10 rerun against `loyal-peacock-107`. — Earlier auth/network blockers remain historical evidence, but current closeout state uses `01-DEPLOY-READBACK-EVIDENCE.md`.
- [Phase 01]: Adopted a claim-specific server helper for 01-11 instead of touching unrelated dirty src/lib/server work. — Preserved the dirty-worktree boundary while completing durable claim/readback routing.
- [Phase 01]: Kept 01-11 local e2e bypass command-scoped through VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E. — Production claim/readback authority still requires Clerk-authenticated Convex calls.
- [Phase 01]: Used slug search params for 01-11 success/status readbacks without treating the slug as authority. — The slug selects a public DTO while owner/admin identity remains server-derived.
- [Phase 01]: Skipped ROADMAP.md mutation for 01-11 because ROADMAP.md was already dirty with unrelated planning work. — Avoided staging or overwriting pre-existing Phase 2-5 planning edits.
- [Phase 01]: Public registry/API runtime handlers now call Convex registry query references; legacy synchronous API helper exports are fixture-only for existing guardrail tests. — Preserves dirty-worktree test compatibility while removing route-local default source factories from runtime handlers.
- [Phase 01]: Discovery route server handlers now use durable Convex query references; synchronous helper exports are fixture-only for existing guardrail tests.
- [Phase 01]: Plan 01-14 used index-only staging for src/modules/discovery/public.ts to preserve pre-existing developer-discovery worktree edits.
- [Phase 01]: Plan 01-15 initially kept R10 blocked because Convex codegen auth, deploy-smoke inputs, full local Playwright, and five-owner evidence were not green; the formal rerun later cleared technical/codegen/deploy gates. — Five-owner evidence is now explicit deferred debt and no longer blocks Phase 2-5 execution.
- [Phase 01]: Matt Pocock two-axis review is recorded in `01-MATT-REVIEW.md`. — Standards found no hard violations; Spec still blocks on five friendly-owner rows.
- [Phase 01]: User explicitly accepted the 0/5 friendly-owner rows as non-blocking execution debt on 2026-06-28. — Internal-alpha and launch claims remain blocked until rows exist.
- [Phase 02]: Began execution despite deferred Phase 1 owner rows and tightened inquiry idempotency before provider work. — Same-key owner retries now replay original effects before stale/terminal gates; tests cover replay, duplicate conflict, wrong-owner, stale, disabled-reply, and terminal reply branches.
- [Phase 02]: Reused the Phase 1 source-owned rate-limit helper for inquiry abuse buckets. — Public submit now writes private abuse bucket state, returns retryable `inquiry_rate_limited`, and does not create additional inquiry rows on limited attempts.
- [Phase 02]: Added Convex-only inquiry schema tables through `src/modules/inquiries/internal/convex-schema.ts`. — Schema tests, import guards, typecheck, and Convex dry-run codegen pass while frontend inquiry schema remains free of Convex imports.
- [Phase 02]: Added durable inquiry Convex submit/list/detail adapters. — Public submit persists private inquiry rows and redacted audit/funnel effects; current-owner inbox/detail readbacks derive owner authority from Clerk plus the owner row and fail closed for wrong owners.
- [Phase 02]: Added durable owner inquiry mark-read, reply, and close mutations. — Owner actions reuse the module state machine, persist idempotent thread/message/notification/audit/funnel effects, and cover wrong-owner, stale, replay, conflict, and terminal branches.
- [Phase 02]: Added durable owner delivery readback, inquiry export, private-content delete, and privacy tombstone readbacks. — Owner-scoped Convex functions preserve hashes, operation refs, tombstones, and audit refs while replacing raw customer/owner message text after privacy delete.
- [Phase 02]: Added public inquiry and owner thread route surfaces backed by route readbacks and Convex server seams. — `/{slug}/inquiry` and `/owner/inquiries/$threadId` now render source-owned availability/detail/delivery/tombstone states with local/build evidence; live provider and rendered-browser proof remain open.
- [Phase 02]: Added AE-owned notification outbox domain and durable Convex table fragment. — Dispatches, attempts, and webhook events now support redacted Resend/Novu provider refs, provider/orchestrator missing states, held webhook readback, duplicate handling, and operator-only retry/no-repair controls; actual provider adapters and smoke remain open.
- [Phase 02]: Added notification outbox Convex runtime adapters without provider-network claims. — Runtime functions now persist enqueue, provider-missing attempt, webhook readback, owner-scoped readback, operator retry, and no-repair states; actual Resend/Novu sends and signed HTTP webhook proof remain open.
- [Phase 02]: Added a Resend signed webhook route behind a server-held outbox key. — `/api/notification/resend-webhook` verifies Svix raw-body signatures and forwards only redacted provider metadata to Convex; later work resolved owner delivery address from Clerk at send time because owner rows store only `emailHash`.
- [Phase 02]: Resolve owner delivery address from Clerk at send time instead of storing raw owner email in source rows. — Server helpers use `CLERK_SECRET_KEY` to select the Clerk primary email only for immediate delivery while durable owner/outbox rows retain hashes and provider refs.
- [Phase 02]: Record Resend send results through the AE outbox instead of treating provider success as message truth. — A system-keyed send readback exposes dispatch/business/owner Clerk identity, and `dispatchNotificationOutbox` can persist a server-supplied provider result with Resend message id and response hash.
- [Phase 02]: Added a guarded Resend dispatch route for the actual server send bridge. — `/api/notification/resend-dispatch` requires the outbox bearer secret, reads a system-keyed dispatch snapshot, resolves Clerk email only at send time, sends Resend, and records the provider result without returning raw owner email.
- [Phase 02]: Added a fail-loud Resend provider smoke harness rather than claiming local provider proof. — `npm run test:provider-smoke:resend` now fails as a named deploy-smoke test until `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`, and `SMOKE_NOTIFICATION_DISPATCH_ID` identify a real deployed dispatch.
- [Phase 02]: Added server-only Novu trigger and authenticated readback helpers without claiming webhook proof. — Novu uses `ApiKey`, the AE outbox idempotency key, transaction-scoped message readback, and returns only redacted provider refs for later outbox persistence.
- [Phase 02]: Added a guarded Novu dispatch route and fail-loud provider smoke harness. — `/api/notification/novu-dispatch` requires the outbox bearer secret, triggers or confirms a Novu-backed owner dispatch, records redacted provider refs, performs authenticated transaction readback, and `npm run test:provider-smoke:novu` fails until real deployed inputs identify a matching dispatch.
- [Phase 02]: Replaced placeholder owner inbox loading with a server-backed source seam and recorded rendered inquiry UI evidence. — `/owner/inquiries` now uses `readCurrentOwnerInboxServer`; local Clerk-bypass evidence covers `/plumbing-demo`, `/plumbing-demo/inquiry`, `/owner/inquiries`, and `/owner/inquiries/inquiry_thread%3Ahash%3Af3e29153` with compact/wide screenshots plus public/owner focus proof.
- [Phase 02]: Added the human-inquiry capability launch support-record gate and deployed smoke harness. — New inquiry submissions and state-backed public availability now require a complete `human_inquiry_owner_inbox` support record with named primary/backup owners/operators, channels, thresholds, incident counts, disable path, kill rules, evidence refs, source hash, correlation ID, and last-reviewed timestamp; Convex runtime loads matching rows from `capabilityLaunchSupportRecords`, and `npm run test:phase2-support-smoke` fails loudly until a deployed smoke slug proves the row through the real public inquiry form.
- [Phase 03]: Closed route-parity gaps before accepting builder discovery. — `03-VERIFICATION.md` moved from `gaps_found` 5/8 to `passed` 8/8 only after `03-02` wired discovery artifacts to durable public route snapshots, replaced synthetic route health with executed readbacks, and expanded builder/agent smoke without claiming deployed proof.
- [Phase 06]: Plan 06-01 is source/local proof only; production proof not claimed.
- [Phase 06]: BusinessActionSlug remains the single literal provision-paid-intake-endpoint with proposal-only, non-callable, non-payment public posture.
- [Phase 06]: GuardrailDecisionEvidence is pre-checkpoint decision evidence and never creates downstream ExternalEvidenceEvent consequence.
- [Phase 06]: Hermes evidence is admitted only after source-owned accepted owner checkpoint and is evidence only, not authority.
- [Phase 06]: Use existing protected_action source-write admission scope for Phase 6 business-action writes — Adding a new business_action admission scope would touch files outside 06-02, while the adapter still enforces business-action-specific source/local policy.
- [Phase 06]: Private evidence exports are redacted hash-only with raw-ref tombstones — Public readbacks and owner/admin exports must not leak raw traces, prompts, provider payloads, private endpoint refs, keys, or webhook secrets.
- [Phase 06]: source/local proof only; production proof not claimed — Phase 6 Plan 06-02 persists local/source evidence and explicitly excludes external provider or production proof.
- [Phase 06]: Business-action Convex adapters remain thin public-seam delegates — Validators, source-write admission, authority derivation, persistence, and redacted returns belong in Convex; domain rules remain in src/modules/business-action/public.ts.
- [Phase 06]: source/local proof only; production proof not claimed — Phase 6 Plan 06-03 adds Stripe test-mode evidence only and explicitly excludes live money, production provider proof, paid activation, Connect, x402, wallet, custody, settlement, and public payment claims.
- [Phase 06]: Stripe Checkout Sessions are server-created test-mode evidence only — Checkout creation binds source request/checkpoint refs and rejects client-supplied amount, currency, customer/provider IDs, success/cancel URLs, paid state, entitlement, and receipt status before any Stripe call.
- [Phase 06]: Stripe webhook admission verifies raw body before source admission — The route checks Stripe-Signature with timestamp tolerance against the exact raw body and only then forwards normalized evidence input; invalid signatures are rejected before source admission.
- [Phase 06]: Webhook route default source admission now forwards signed Stripe evidence through server source-write admission to the Convex source mutation — invalid signatures, unnormalized held events, and unsafe provider facts still fail closed instead of creating false payment or receipt proof.
- [Phase 06]: source/local proof only; production proof not claimed — Plan 06-04 adds owner/admin business-action route readbacks without public production proof claims.
- [Phase 06]: Owner/admin business-action routes read through module server seams — Route components do not own Business Action fixture arrays or raw private evidence.
- [Phase 06]: Business-action operator controls use the existing source-owned operator-control path instead of env-only switches.
- [Phase 06]: Public private-evidence projection returns hash/metadata only and explicitly excludes raw prompts, traces, provider payloads, Stripe payloads, customer identifiers, private endpoint refs, API keys, and webhook secrets.
- [Phase 06]: source/local proof only; production proof not claimed — Plan 06-05 adds observability/support-control source validation only.
- [Phase 06]: Do not add duplicate observability tables for Phase 6 support/private-evidence rows — 06-02 already owns durable business-action source persistence.
- [Phase 06]: source/local proof only; production proof not claimed — Plan 06-06 adds copy/source/SEO/smoke gates without external provider proof.
- [Phase 06]: Provider-smoke status is not external proof unless configured evidence passes — The Phase 6 Stripe smoke currently fails loudly because deployed source-owned evidence env is absent.

### Blockers

- Phase 01 five-owner activation evidence remains 0/5 as deferred debt.
- Internal-alpha and public-launch claims still require five real owner rows.
- Phase 2 still needs deployed `npm run test:phase2-support-smoke`, `npm run test:provider-smoke:resend`, and `npm run test:provider-smoke:novu` with source-owned inquiry-created dispatch IDs before final closeout artifacts may be written.
- Phase 3 has local/source verification passed, but no deployed Phase 3 route/readback evidence artifact exists yet; do not claim deployed Phase 3 proof until a real deployed smoke is captured.
- Phase 5 provider proof requires deployed `npm run test:provider-smoke:autumn-stripe` with source-owned Autumn/Stripe event, receipt, reconciliation, support, and claim evidence before any public paid claim.
- Phase 6 production/deployed claims require real provider-smoke evidence for signed Stripe webhook admission, source-owned receipt reconstruction, support/kill rules, and no-overclaim copy scans; the 2026-06-29 closeout waived copy as a blocking gate only for source/local Phase 6 closure, not for production claims.
