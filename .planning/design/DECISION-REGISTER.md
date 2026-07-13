# DECISION-REGISTER — strategy constraints under management

Status: the accountability ledger for KERNEL-CEILING (C-1..C-7) and ECONOMY-THESIS (E-1..E-6). A constraint without a row here is prose, not authority. Sources: management review board 2026-07-13 (persisted evidence in `.planning/research/2026-07-13-*.md`).

Solo-founder note: "Founder" is the DRI on every row by necessity; the column exists so the *hat* being worn (Eng Lead / Product Lead / CEO) is explicit and so delegation is possible later.

## 1. Constraint ledger

| ID | DRI (hat) | Activation trigger | Acceptance evidence | Review date |
|---|---|---|---|---|
| C-1 kernel vertical-neutrality | Eng Lead | First K-schema touched (Wave 2); read-side check rides Wave 1 task J1.1 | Contract test: routing-kernel/K12 types import no business/service vocabulary; local-service fields exist only in payload/view types | At Wave 2 entry |
| C-2 K12 wire digest | Eng Lead | **Wave 2 entry gate — blocks first persisted receipt** | K12 spike exit criteria met (see WAVE-1-PLAN §5 / ADR-canonical-wire-format): two independent implementations reproduce vectors; schema version inside hashed bytes; zero-runtime verifier | Before any receipt write |
| C-3 counterparty admission proof classes | Eng Lead | Wave 2 (commit-side); Wave 1 read-side legibility only | `R1TargetAdmitted` exists in src as versioned predicate over proof-class union; atomically re-evaluated at commit; unadmitted target cannot send | Wave 2 J6 gate |
| C-4 typed refusal/incident taxonomy | Eng Lead | Wave 2 command contracts | One refusal-translation contract across inquiries/routing-kernel; no coarse errors on consequential paths | Wave 2 J3 gate |
| C-5 neutrality economics | CEO | Before ANY pricing/ranking/market-data experiment | Written pricing decision showing zero paid-rank/admission/basic-response revenue; biased-routing gross-profit share tracked vs 50% kill threshold | At monetization reopen |
| C-6 J7 public envelope | Eng Lead | Wave 5 entry | Versioned ConversationEnvelope + doesNotProve + conformance vectors + ≥1 external implementation | Wave 5 entry |
| C-7 claim wording | Product Lead | Every public-copy release | Executable copy check rejects "no protocol does this" / "SWIFT-TLS for agents" phrasings; ships with Wave 1 copy tests | Each release |
| E-1 symmetric commitment schema | Eng Lead | K12 spike (reserve versioned commitment-kind/payload boundary); object ships R2 | K12 ADR shows supply-stake variant addable without digest migration | K12 spike exit |
| E-2 disclosure gradient | Eng Lead | R2/R3; K3 projection design must not preclude | Projection-policy ADR reserved; no live-commitment visibility before consent/anti-front-running rules | R2 gate |
| E-3 telemetry as reputational bond | Product Lead | Post-J4 (needs events+clocks+attribution) | Wave 1 renders ONLY "No reply history yet" stub; no bond claims until dishonor/expiry events exist | Wave 3 gate |
| E-4 sell tape never rank | CEO | Never before privacy/cohort/re-identification rules + source consent decided | Revenue hypothesis only; no telemetry exposure | At monetization reopen |
| E-5 literacy-gated rungs | Product Lead | Every rung gate | Gate packet reports measured prior-rung behavior (defined in WAVE-1-PLAN persona-gate protocol); feature completion alone never opens a rung | Each rung gate |
| E-6 R1 teaches bounds | Product Lead | Wave 2 J3 surfaces (K2/K12 prerequisite); J2 retention/expiry visibility rides Wave 1 task J2.4 | Blind user explains recipient, scope, expiry/revocation, and what the record proves after the journey | Wave 2 J3 persona gate |

## 2. Dated windows (auto-downgrade contract)

Every window claim below carries: start date 2026-07-13, evidence owner Founder, and a review date. **A missed review automatically downgrades the claim to UNKNOWN** and it may not be cited in any decision until re-evaluated. Sources: `.planning/research/2026-07-13-protocol-field-gap-matrix.md`, `-incumbent-incentive-audit.md`.

| Claim | Window | First review | Expiry/recalibrate |
|---|---|---|---|
| Protocol spec convergence | 12–24 mo | 2026-08-13 (monthly protocol scan) | 2027-07-13 |
| Cross-vendor protocol deployment | 24–48 mo | 2026-08-13 | 2028-07-13 |
| Google response lag once triggered | 0–6 / 12–24 mo | 2026-10-13 | 2027-01-13 |
| Vertical SaaS connectors | 0–6 mo | 2026-10-13 | 2027-01-13 |
| Assistant mandate/receipt lag | 6–18 mo | 2026-10-13 | 2027-07-13 |
| Net wedge window | 18–36 mo | 2026-10-13 | 2027-07-13 |
| Probability bands (KERNEL-CEILING §2) | — | 2026-10-13 | Recalibrate with any protocol-scan surprise |

## 3. "Moat" vocabulary gate

The word **moat** may not appear in any new strategy/public doc for a capability lacking a live measurement. Current status: ALL moat claims (neutral evidence layer, replay-as-product, telemetry bond, tape revenue, lattice) are **unmeasured hypotheses**. Instrumentation contract lives in WAVE-1-PLAN §4; first measurable data arrives with Wave 2 admitted sends.

## 4. ADRs required before Wave 2 code (stubs accepted 2026-07-13; full ADRs due at Wave 2 entry)

1. **Canonical governed-action wire format** — adopt RFC 8785 JCS over restricted I-JSON domain; hash versioned kernel-neutral envelope; persist exact bytes. Consequence: current `stableStringify`/FNV callsites inventoried and classified non-wire or migrated.
2. **Governed action / mandate / preparation bounded contexts** — one `GovernedActionIntent` contract; K2 mandate authorizes, preparation authority narrows disclosure, route authorization allocates resources. Consequence: ends the three-competing-authority-aggregates drift.
3. **Counterparty admission proof model** — `R1TargetAdmitted` = versioned predicate over discriminated proof-class union, re-evaluated atomically at commit. Consequence: Wave 1 projects readiness reasons; Wave 2 refuses drift.
4. **Evidence ledger vs projection ownership** — consequential commands append facts; thread/record/export/status are deterministic projections; erasure separated from lineage tombstones. Consequence: current mutable inquiry rows are NOT the Wave-2 receipt authority.
5. **R1 product adapter vs neutral kernel** — local-service identifiers stay in the inquiries adapter; kernel receives versioned opaque payload refs + neutral principals/targets. Consequence: satisfies C-1 without premature genericization.
6. **Commitment projection & disclosure levels** — defer live standing commitments to R2; reserve versioned projection-policy semantics now. Consequence: E-1/E-2 extensible without shipping a fake market.
7. **Literacy release gates as governance** — rungs open on named behavioral evidence + thresholds; owner records pass/fail. Consequence: wave progression auditable.

## 5. Standing management rules (from review board)

- **Strategy freeze:** no new analysis wave without (a) a blocked decision, (b) a named output consumer, (c) a same-session code or spec diff. Two consecutive sessions of analysis without a tested increment → cancel strategy queue, execute next ready task.
- **Capacity split:** ≥80% execution / ≤20% strategy per week.
- **Insight custody:** any insight living only in chat or an `agent://` artifact for more than one session is either amended into a canonical spec/task or discarded.
- **Certification honesty:** journeys are `designed` until a persona gate packet (frozen script, fresh-context runner, objective predicates, evidence bundle, founder sign-off) says otherwise.
