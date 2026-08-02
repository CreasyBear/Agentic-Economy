# T53 — BAS wedge external kill gate

Labels: `wayfinder:task`, `tdd:red`, `external-evidence`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source ticket: T27.
Status: landed + verified at the source/local-labelled evidence boundary — frozen external-run contract, public/functions/gate/schema and Convex persistence are landed in `src/modules/external-run/public.ts`, `src/modules/external-run/external-run.functions.ts`, `src/modules/external-run/internal/contract.ts`, `src/modules/external-run/internal/gate.ts`, `src/modules/external-run/internal/convex-schema.ts`, `convex/externalRuns.ts` and `convex/externalRuns.test.ts`; source verification and the local labelled smoke are recorded in `output/release/final-gate-2.log` and `output/release/work-tree-smoke.json.log`; open: recruitment/external run and final immutable PASS/FAIL/KILL, with hosted T51 and real-payment T52 dependencies explicit.

Blocked by: T51; real payment additionally blocked by T52. Signed paid pilots may satisfy the pre-payment commercial signal but not settled-payment evidence.

## Outcome

Twelve real attributed BAS-quarter starts decide whether AE's first framework wedge deserves continued investment. The output is exactly `PASS` or `FAIL/KILL`; thresholds are frozen before data.

## Public seam

Deployed human `/`, authenticated agent actions and public WorkTree/receipt readback. Validators must not query Convex tables.

## Frozen run manifest

- Window: 30 calendar days.
- Cohort: 12 admitted Australian SMB starts with a current BAS due/overdue outcome; every admitted start stays in the denominator.
- Supply: ≥3 independently operated bookkeeping/BAS-provider businesses.
- Attribution and inclusion/exclusion recorded before start.
- Thresholds: ≥75% decision-ready within 24h; ≥60% blind preference in paired evaluable cases; ≥50% provider-backed completion or customer-accepted next step; 0 false success/fulfilment/payment claims; ≤25% refusal+unknown; operator touches median ≤1/p90 ≤3; ≥2 signed paid pilots; ≥1 settled real payment if T52 opens live money; positive observed contribution margin.

## Red

Current source has no immutable external-run manifest/readback and only labelled sandbox cohorts. It cannot prove real provider response, customer value, payment, acquisition or margin.

## Minimal green

1. Persist an immutable run manifest/digest through a bounded source-owned admin seam before recruitment.
2. Recruit with informed consent; record channel attribution and provider independence.
3. Run equivalent asks through human and agent seams; preregister paired incumbent-assistant comparison and blinded scoring.
4. Record every start, decision-ready timestamp, provider observation/refusal/unknown, completion evidence, manual AE touch, customer preference, pilot/payment and variable cost through public/source-owned events.
5. Report all denominators and missing data. Sandbox, hosted, provider and customer evidence classes remain separate.
6. Compute gates mechanically from frozen values and append the final `PASS` or `FAIL/KILL` decision; no threshold editing or case deletion after start.

## TDD tracer bullets

- incomplete manifest → admission refused;
- frozen manifest update → refused;
- mock/provider/customer evidence → retained as distinct classes;
- missing/unknown case → remains denominator and cannot count as success;
- threshold boundary examples → deterministic result;
- failed gate → `FAIL/KILL`; all gates passed → `PASS`;
- public report totals reconcile to all 12 admitted starts.

## Adopted seams

Existing WorkTree/Study journals, observability events, receipts, Convex persistence and public readback. Custom code is limited to BAS inclusion mapping and deterministic metric aggregation; no analytics platform or fake provider.

## Acceptance

- All 12 admitted starts are visible in the final denominator.
- Provider fulfilment requires independently operated provider evidence.
- Every manual intervention is counted.
- Blind comparison method and raw scored cases are retained with consent/privacy controls.
- Commercial evidence distinguishes signed pilot from settled payment.
- Result is reproducible from the immutable public evidence packet.

## End condition

`PASS` unlocks generalization to a second outcome with the same framework; `FAIL/KILL` stops BAS acquisition/product expansion and records the next founder decision. Neither result upgrades evidence beyond what was observed.

## Source evidence

`.planning/wayfinder/JOURNEYS.md` J12; `.planning/research/2026-08-01-demand-anchor-asks.md`; `.planning/wayfinder/MAP-vision-gap.md`; labelled sandbox supply modules; T43 frozen decision.
