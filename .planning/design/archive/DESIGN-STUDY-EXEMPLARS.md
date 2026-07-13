# Design Study: Exemplar Route/IA/UX Mechanics

**Created:** 2026-07-13 · **Companion to:** `IA-BEHAVIORAL-FOUNDATIONS.md` (locked decisions D1–D6)
**Method:** 5 parallel researchers studied live products + first-party docs: Perplexity, Airbnb, Stripe, Linear, Uber. All findings URL-cited in the full reports (`agent://StudyPerplexity`, `agent://StudyAirbnb`, `agent://StudyStripe`, `agent://StudyLinear`, `agent://StudyUber`). This doc synthesizes the convergent mechanics and maps them to AE routes.

---

## 1. Cross-cutting laws (patterns ≥3 exemplars converge on)

### LAW-1 · The composer IS the front door
Perplexity's home is a sparse stage + large composer with mode explanation *inside* the input; Uber's `/go/home` opens directly to pickup/dropoff composition; Airbnb's home is Where/When/Who + Search above browse rails. None puts a marketing preamble before the task.
→ **AE `/` (D1):** ask field first; product explanation attached to the composer (examples, modes), marketing demoted below. Browsing (registry rails) is the low-commitment alternative, Airbnb-style.

### LAW-2 · Work creates a durable object with a stable URL before it completes
Perplexity navigates to `/search/{uuid}` before the answer streams; Uber's trip is one resource whose status changes (`/v1/guests/trips/{id}`); Stripe's PaymentIntent exists before it succeeds; Linear's issue gets a canonical UUID route with redirects surviving team moves.
→ **AE:** submitting at `/` immediately navigates to `/t/:threadId`; the send action creates the inquiry object *before* any "sending" animation; historical IDs redirect, never 404.

### LAW-3 · Status is a state machine, and each state is a distinct screen contract
Uber: `processing → accepted → arriving → in_progress → completed` — each state changes what is true, what's next, and the primary action. Stripe: friendly operator label (`Incomplete`) explicitly mapped to authoritative machine state (`requires_action`). Linear: customizable status names inside a fixed category backbone (Backlog/Unstarted/Started/Completed/Canceled).
→ **AE:** CH-1 lifecycle states each get required fields: **status label · known facts · next expected transition · primary action · recovery action · timestamp/ID**. Two vocabularies with an in-product bridge: owner sees "Waiting for your reply," admin sees the kernel state.

### LAW-4 · Progressive certainty — never borrow certainty from the next state
Uber shows "estimated time to match" before a driver exists, driver ETA only after acceptance, "arriving" only within 0.2mi. Stripe keeps `processing`/`pending` visible and labels refresh boundaries. Uber separates `TRACKING_ERROR` from trip failure.
→ **AE:** "Searching" ≠ "Preparing inquiry" ≠ "Sending" ≠ "Sent to business" ≠ "Business responded". `status_unknown` (readback failure) is never rendered as delivery failure. "Sent" never becomes "confirmed" — this IS the boundary-honesty contract, mechanized.

### LAW-5 · Consequence-bearing facts sit immediately before a named commit action
Uber: service + route + upfront fare + adjustment conditions before "Confirm UberX". Airbnb: sticky rail = total + dates + guests + cancellation + "You won't be charged yet" before "Reserve"; then a *separate route* (`/book/stays/:id`) repeats everything before submission. Stripe: refund modal collects amount + structured reason before "Refund".
→ **AE:** pre-send item = recipient business · request payload · data shared · expected next step · limits. CTA is "Send inquiry to {business}", never Continue/Submit/OK. Consequence rise = fact repetition (Airbnb repeats dates/guests/policy/total in checkout even though the listing showed them).

### LAW-6 · Receipts are durable objects, reachable after the success moment, reflecting current state
Stripe: unique receipt number, hosted link showing *latest* charge state, resend history (last 10), globally searchable by `receipt:`. Uber: trip detail vs full receipt breakdown, PDF + email resend, reconciles quote vs charged. Toasts explicitly disallowed for lifecycle state (Uber Base: snackbar = post-action acknowledgment only).
→ **AE:** inquiry receipt = stable ID + timestamp + recipient + submitted fields + boundary-honest state + private-link revisit path; ID pasteable into owner/admin search; later business reply is a new linked conversation item, not a mutation of the receipt.

### LAW-7 · Two-level disclosure everywhere
Airbnb: exposed high-frequency filter chips + full Filters modal; total price + "Show price breakdown". Perplexity: inline citations + `Sources N` collapsible + full Links tab. Stripe: operator summary + Workbench JSON one layer deeper. Linear: filters (membership, in URL) vs display options (presentation, personal).
→ **AE:** every surface picks its two levels deliberately — registry chips + Filters panel; answer + collapsible work record + admin evidence; owner summary + admin raw.

### LAW-8 · Zero results teach the specific mismatch
Airbnb: "No exact matches" + per-constraint removal buttons ("Remove price filter", "Remove beds"), map retained, never silently broadening. Linear: empty distinguishes queue-cleared / hidden-by-preference / no-match / not-configured. Uber: no-drivers is terminal + suggests alternate ride type.
→ **AE:** registry zero-state names each active constraint with individual relax actions; operator empties state the visibility policy. Extends DS-13's six empty meanings.

### LAW-9 · Document spine, not chat bubbles
Perplexity renders answers as an editorial document (lead, sections, inline citations) with per-item action strips — not alternating speech bubbles. Latest expanded, follow-ups stack chronologically under one URL, suggested next moves come *after* the current item.
→ **AE conversation-item primitive (D2):** one readable chronological column; item types distinguished by structure (heading, metadata, status, action row), not bubble sides; actions rendered by item type and consequence, never a cloned universal toolbar.

### LAW-10 · Navigation is redundant by design; each layer has one job
Linear: sidebar (recognition) + shortcut grammar (habit) + Cmd-K palette (recall) + canonical URLs (sharing) — and five *scoped* search layers instead of one overloaded box. Stripe: sidebar by resource + object-locator search + `~` Workbench. Perplexity: rail recents + `/library` archive.
→ **AE:** mount `AeRouteCommandMenu` at the operator shell, generated from the same route/action registry as the sidebar (fixes the two-taxonomies violation); commands grouped Navigate / Open record / Change view / Act on focused record; availability follows authorization.

---

## 2. Per-exemplar signature mechanics (unique, still transferable)

| Exemplar | Signature mechanic | AE application |
|---|---|---|
| **Perplexity** | Answer/Links/Images as *views of one research object* (`?sm=r`); viewer follow-up on a shared thread forks instead of mutating | Thread tabs (Answer / Evidence) over one `/t/:threadId`; shared/private-link threads branch on continuation |
| **Airbnb** | Authority-based action branching: "Confirm and pay" (instant) vs "Request to book" (host approval, 24h pending, withdrawable) | AE always has request-authority, never book-authority → every CTA is the request branch; pending state shows expected response window + withdraw path |
| **Stripe** | Object workspace anatomy: identity header → state-gated actions → core facts → related-object graph → timeline → receipt history → machine detail one layer down; `/agents` gateway page before raw artifacts | Owner inquiry detail + `/admin/runs/:turnId` restructure; "For agents" gateway page fronting SKILL.md/llms.txt/UCP |
| **Linear** | Triage = bounded disposition vocabulary (accept/duplicate/decline/snooze as 1/2/3/H); split inbox keeps list context; focus is durable state surviving queue mutation | Owner inquiry inbox: fixed dispositions (Reply / Request clarification / Decline / Snooze), split layout, focused-row survival |
| **Uber** | Explicit fallback branches shipped with the happy path: `driver_redispatched` (stale assignment cleared), `no_drivers_available` (terminal + alternative), telemetry failure ≠ lifecycle failure | AE delivery states: `delivery_retrying` / `delivery_failed` / `business_unavailable` / `user_canceled` / `status_unknown` — designed before the happy path ships |

---

## 3. AE route blueprint (study conclusions applied)

### `/` — composer front door (D1)
- Composer first (LAW-1); example asks as actionable chips; registry browse rails below (Airbnb home duality: search contract + low-commitment browse).
- Submit → immediate `/t/:threadId` navigation (LAW-2), streaming in place, Stop affordance in the composer (Perplexity).
- Marketing narrative below the fold or on `/about`; never a preamble.

### `/t/:threadId` — thread as durable research/inquiry object
- Document spine (LAW-9); turn header = user query as document title with edit/copy.
- Work record: named phases ("Searching businesses", "Checking capabilities"), streams into final semantic shape, collapses when settled (matches CH-7/CH-8).
- Evidence: inline where claims occur + collapsible summary + dedicated view (LAW-7); dedupe across turns (Perplexity anti-pattern: source inflation to 20).
- Suggested next moves after the settled item; become ordinary user items when clicked.
- Visibility/retention rendered as object state (private / link-shared / expiring).

### `/registry` — catalog
- Persistent editable search summary header (Airbnb); two-level filters (LAW-7); cards answer "is this candidate actionable?" — capability, service area, evidence posture, supported next action. No badge theatre without inspectable evidence.
- Zero-state: named constraints + individual relax actions (LAW-8).

### `/:slug` — listing
- Section order: identity/save-share → capability facts → evidence/response posture → highlights → detail → proof → service boundary → terms (Airbnb funnel: fast fit → evidence → policy).
- Sticky rail = proposal snapshot: need + constraints + price posture ("business will quote") + boundary copy + "Ask this business" (LAW-5). Rail never outruns the evidence column.
- Exact/private details gated until inquiry consents (Airbnb: exact address after booking).

### `/:slug/inquiry` — the request-to-book analogue
- Review surface repeats recipient, scope, timing, contact, consent, quote posture, withdrawal semantics with Change controls (LAW-5 repetition rule).
- Named CTA; pending lock; receipt per LAW-6 with expected-response window + withdraw path (Airbnb 24h pattern, boundary-honest).

### `/owner/inquiries` — split triage inbox
- Linear split layout; bounded dispositions with resulting-status text; durable focus; empty states name visibility policy; `G`/`J`/`K`/Space/Enter shortcut grammar surfaced in tooltips.

### `/admin/runs/:turnId` — object workspace
- Stripe anatomy: identity header + summary state ↔ kernel state bridge in-product; state-gated actions; related-object graph (inquiry → proposal → receipt → delivery attempts → run); collapsed machine noise, receipts/permission decisions never collapsed (Linear collapsed-history + AE audit exception); raw JSON one layer deeper.
- Test/simulated records structurally marked (route/data/capability restriction), never color-only (Stripe `/test/` routes + read-only live Shell).

### "For agents" gateway
- Stripe `/agents` model: one page — what agents can discover/submit, quick start, canonical machine endpoints (SKILL.md, llms.txt, UCP, catalog APIs), boundary statement. Replaces scattered footer files; fixes IA-4.

---

## 4. Anti-pattern register (do NOT copy)

1. **Vocabulary drift** — Perplexity ships Spaces/Projects/threads/sessions simultaneously. AE: one term per object, aligned across route/nav/UI/docs (feeds UBIQUITOUS_LANGUAGE).
2. **Action-vocabulary theft without authority** — no Reserve/Book/Confirm/instant totals unless the business supplied that authority (Airbnb branch is earned by controlling payment).
3. **Toast as lifecycle evidence** — Uber Base forbids it; AE receipts/failures are durable items.
4. **Stale counterpart during rework** — Uber's `driver_redispatched` clears the old driver; AE must clear/qualify stale business/delivery claims on re-routing.
5. **Color-only or icon-only status**, ever (Linear/Stripe both text-first).
6. **One overloaded search box** — scope search layers (Linear's five).
7. **Cmd-K as dumping ground** — contextual ranking/grouping or don't ship it.
8. **Telemetry-heavy public URLs** — keep shareable URLs canonical (Airbnb's `/rooms/:id?source_impression_id=…` sprawl).
9. **Marketing-page sprawl** — staged narrative yes, Stripe-length capability catalogue no.
10. **Silent shared-default mutation** — view preference changes are personal unless explicitly "Set as default" (Linear).
11. **Semi-secret keyboard-only affordances** for infrequent users (Linear Peek) — pair shortcuts with visible affordances on owner surfaces.
12. **Accidental accessibility noise** — one state, one concise announcement (Airbnb's repeated price-average text).
13. **Duplicated status vocabularies without an in-product bridge** (Stripe needs a docs page to map them; AE should show the mapping in a tooltip/detail).
14. **Sign-in interruption of legitimate public flows** — auth only at route-class or consequence boundaries (Perplexity's modal).

---

## 5. Deltas to IA-BEHAVIORAL-FOUNDATIONS.md

The study **confirms** the locked foundations and **sharpens** these:

| Foundation rule | Sharpened by study |
|---|---|
| CH-1 lifecycle | Add delivery-branch states: `delivery_retrying`, `delivery_failed`, `business_unavailable`, `user_canceled`, `status_unknown` (Uber) |
| CH-4 plans | Perplexity precedent: named work phase + interpreted-search readback beats a rendered plan for simple lookups |
| CH-5 context | Show the *interpreted search phrase* / carried constraints as an inspectable work record, not "using previous context" banners (Perplexity Links-view heading) |
| AX-1 proposal card | Add price-posture field: authoritative quote vs "business will quote" — never synthesized totals (Airbnb) |
| AX-5 readback | Add withdraw-while-pending affordance + expected response window (Airbnb request-to-book) |
| LAW-6 receipts | Receipt IDs globally searchable in operator surfaces; resend/delivery history on the record (Stripe) |
| IA-2 one route map | Command palette must be *generated* from the route/action registry, mounted at shell boundary (Linear) |
| IA-4 machine gateway | Upgrade from "labelled gateway" to a real onboarding page fronting all machine artifacts (Stripe /agents) |
| DS-13 empty states | Add per-constraint relax actions to the zero-match state (Airbnb) |
| Status presentation | Formalize the two-vocabulary bridge (operator label ↔ authoritative state) inside `status-presentation.ts` (Stripe) |
