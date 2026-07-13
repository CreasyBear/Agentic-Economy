# WAVE-1-PLAN — J1 cold trust + J2 decision aid, under management

Status: the executable plan. Owner: Founder. Budget: **8 founder sessions (3h each), 2026-07-14 → 2026-07-23.** No new strategy docs and no Wave 2 work before the 2026-07-23 release decision. Sources: management board 2026-07-13 (`agent://PmAlex`, `agent://SeniorPm` — content merged here; artifacts ephemeral).

## 1. North Star (defined now, movable only by Wave 2+)

**Useful Independent Coordination Rate (UICR):** % of active principals (rolling 30d) completing ≥1 useful run spanning the customer and an independently controlled business — useful = correlated business reply, exported/shared/cited record, or replay that materially resolves an exception. Reported beside (never merged with) machine-coordination-event count and physical-job count. **Wave 1 cannot move UICR and must not claim to.** Wave 1 uses the leading indicators in §3.

## 2. Task breakdown (FS = one 3h founder session)

### J1 — cold trust
| Task | Size | Mode | DoD (abbrev) | Verify |
|---|---|---|---|---|
| **J1.1** Freeze trust-projection contract (phone/hours/service-area/proof-links/posture/distance; unknowns explicit; K7 fallback = "No reply history yet"; **C-1 check**: local-service fields payload/view-only) | 0.5 | founder-serial | Contract approved; no kernel-type imports | `typecheck` + `test:imports` + review |
| **J1.2** Registry-card trust slice (facts, posture, distance, CS6 proof links, call/web/copy/view/ask peers) | 1 | agent-parallel | No paid/best/availability implication; missing facts explicit; mobile targets usable | registry unit+integration tests |
| **J1.3** Listing first-screen trust slice (`/:slug` trust trio before Ask per `pages/listing.md`) | 1 | agent-parallel | 375px + desktop first viewport contains trio; unknown fixtures pass | new focused test + `test:ui-contract` + `test:copy` + `test:seo` |
| **J1.4** J1 integration + persona gate | 0.75 | founder-serial | SeoLander ≤10s trio+purpose, calls without entering AE; UrgentTradie sees posture/direct-call pre-selection | `test:e2e --grep "cold trust|registry|listing"` + gate packet |

### J2 — ask → decision aid
| Task | Size | Mode | DoD (abbrev) | Verify |
|---|---|---|---|---|
| **J2.1** Composer + timing contract (durable thread; CS4 timing structured; `?q=` editable never auto-submitted; urgent → early call-capable candidates) | 1 | agent-parallel | One submit = one thread; no contact/consent requested | home-landing + thread-loader tests |
| **J2.2** Shortlist progression + terminal "Your shortlist is ready." (posture + CS2 distance before selection; terminal removes send-pressure chrome) | 1.25 | founder-serial | Actions: Change criteria/Open/Copy/Call/Close | transcript tests + new terminal-state test |
| **J2.3** Sanitized export preview + artifacts (preview-first; sanitized default; output = preview; revision invalidates; "Not sent / No business reply" proof line) | 1.25 | agent-parallel | PII/keys default off; Playwright export scenario green | focused unit + e2e + `test:copy` |
| **J2.4** Bounds-visible moments + kill-condition instrumentation (E-6: retention/expiry visible, Stop instant; events per §4) | 0.75 | agent-parallel | Events versioned, PII-free, Wave-2-joinable without schema change | telemetry contract test + `test:types` |
| **J2.5** J2 E2E + visual QA + persona gate | 0.75 | founder-serial | BrowserOnly predicts every exported field, zero send pressure; UrgentTradie early call routing | `test:e2e --grep "shortlist|decision aid|export"` + gate packet |

**Dependency edges:** J1.1 → {J1.2, J1.3, J2.1} → J1.4; J2.1 → J2.2 → {J2.3, J2.4} → J2.5. Max 3 concurrent agent patches; founder integrates one layer at a time; red mainline after integration → concurrency drops to 1.

**Cadence:** S1 Jul-14 J1.1 · S2 Jul-15 parallel J1.2/J1.3/J2.1 + review · S3 Jul-16 integrate J1 · S4 Jul-17 J1 gate · S5 Jul-20 J2.2 · S6 Jul-21 J2.3/J2.4 · S7 Jul-22 integrate + E2E · S8 Jul-23 gates + release decision.

**Cut order if over budget:** (1) CS6 third-party proof link-outs; (2) map → truthful text distance; (3) PDF download (keep preview+print+sanitized copy); (4) `/activity` route (keep home rail, CS9). **Never cut:** trust trio, posture-before-selection, shortlist terminal, sanitized preview, C-1 check, E-6 bounds, telemetry contract, persona gates. Still over → stop and rebaseline, never silently slip.

## 3. Wave 1 success metrics (decision gates, not vanity)

| Outcome | Metric | Window / consequence |
|---|---|---|
| Cold visitor trusts and acts | ≥80% of 10 blind cold-arrival tests find trio + explain AE within 10s; 0 false availability/response claims | Pre-release gate; rerun day 14. <80% → no Wave 2 UI work |
| Researcher leaves with useful shortlist, unpressured | ≥70% qualified J2 sessions reach `shortlist_ready`; ≥25% then copy/export/open/call; send-pressure violations = 0 | First 30 days. <70% → repair before consequential sends |
| Urgent user reaches safe action | ≥90% urgent-intent sessions expose call routing before any send-review choice | Any safety miss blocks release |
| Measurement is real | ≥99% sampled terminal sessions have one deduplicated event chain; zero bearer keys/PII in payloads | Pre-release fixture + day-7 audit |

## 4. Instrumentation contract (ships INSIDE Wave 1 — kill conditions need it)

- **Wave 1 events:** `listing_viewed`, `listing_trust_fact_opened`, `direct_call_selected`, `shortlist_started`, `shortlist_ready`, `shortlist_reopened`, `export_preview_opened`, `shortlist_exported(copy|print|pdf)`, `business_opened`, `urgent_call_route_shown`, `journey_abandoned`.
- **Defined+versioned now, wired Wave 2:** `record_reopened`, `record_exported`, `record_shared`, `record_cited`, `dispute_opened`, `replay_materially_resolved`, `admitted_r1_send`. **J2 events never enter the 1,000-admitted-send kill denominator** (KERNEL-CEILING §6.1).
- **Definitions:** reopen = new session ≥30min after creation viewing the durable artifact; export = artifact generated after visible preview; share/cite = explicit user actions only; materially-resolved = explicit disposition attributing resolution to replay.
- **Custody:** append-only domain events in product ledger; privacy-safe projections in a product-events dataset (pseudonymous ids, journey, event version, cohort); weekly founder review.

## 5. Persona-gate protocol (E-5 operationalized)

Founder owns scope/pass decisions. A fresh-context agent executes the FROZEN persona script (no access to rationale docs); an independent fresh-context critic scores it. Evidence packet = URL, viewport, fixture, steps, screenshots, result, failures. **Pass** = every register predicate met + zero recurrence of the named walkout + no Sev-1/2. One failed predicate → journey returns to implementation within the same wave. Gate results recorded in the journey register status.

## 6. Risk register

| Risk | L/I | Mitigation | Trigger → action |
|---|---|---|---|
| W3/J4 scheduler hard-stop | H/H | Scheduler spike + go/no-go before Wave 2 closes | No scheduler proof by W2 midpoint → W3 stays BLOCKED |
| K12 retrofitted after receipts | M/Crit | K12 = dated Wave 2 entry gate (DECISION-REGISTER C-2 + ADR-1) | Any receipt-writing change without K12 reference → reject |
| Solo-founder bus factor / untracked docs | H/H | Design set + evidence committed to git (done 2026-07-13); session-end decision readback | Insight >1 session outside canon → amend or discard |
| Strategy-session addiction | H/H | DECISION-REGISTER §5 freeze rules; 80/20 split | 2 sessions analysis w/o tested increment → cancel strategy queue |
| Persona gate theatre | M/H | §5 protocol: frozen script, fresh runner, evidence packet | Runner saw rationale docs or predicate lacks evidence → FAIL |
| Parallel-agent integration overload | H/M | ≤3 concurrent patches; contracts frozen first; single integration queue | Collision or >2 review cycles → concurrency 1 + contingency session |

## 7. Wave 2 preview (NOT started before Jul-23 decision)

Order: **K12 spike (3–5 days, exit criteria in ADR-1)** → J6 admitted supply (C6 enforced at commit in `src/modules/inquiries/internal/commands.ts`; `R1TargetAdmitted` becomes real code) → J3 one governed send (blind SkepticalShopper gate) → kill-condition telemetry live (first 30 / 100 / 1,000-send reviews). Explicitly out: J4 clocks, CS1 email ingestion, comparison, booking, payment, capacity stakes.
