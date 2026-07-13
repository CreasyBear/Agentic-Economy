# Design Constitution

**Status:** Canonical and normative  
**Scope:** All human-facing and machine-adjacent Agentic Economy interface work  
**Authority:** This document is the design constitution. The rule IDs below are stable and MUST NOT be renumbered or reused.

The words **MUST**, **MUST NOT**, **SHOULD**, and **NEVER** are normative. Examples clarify a rule but do not narrow it. Where a law and a domain rule overlap, the law states the general principle and the domain rule owns the implementation contract.

## 1. Locked decisions

| ID | Decision | Locked call | Required consequence |
|---|---|---|---|
| D1 | Front door | **`/` consumes queries.** | Home MUST be the ask surface. The `/engine` workspace folds into `/`; legacy `?q=` links MUST resolve correctly. The composer leads and marketing narrative moves below or behind the task. |
| D2 | Conversation convergence | **One conversation-item primitive.** | Chat, Customer Request, and inquiry MUST project through one shared primitive covering user text, clarification, work record, proposal, permission request, receipt, error, and status. |
| D3 | Theme honesty | **Mint `aeTheme` extending Astryx neutral.** | Eucalyptus, radius, shadow, and motion overrides MUST live in a defined theme object rather than masquerading as the neutral theme. Honest dark-mode work depends on this cutover. |
| D4 | Motion vocabulary | **Astryx fast / medium / slow.** | The parallel AE duration names MUST be removed. Components MUST consume library tiers and MUST NOT contain literal animation durations. |
| D5 | Dirty forms | **Autosave short; block consequential.** | Short forms MAY use session recovery. Long or consequential forms, including authorization and claim flows, MUST use a navigation blocker and name what would be lost. |
| D6 | Framework authority | **This constitution is authoritative.** | The former frontend framework is archival rationale only. Its valid ambition doctrine is carried into §7 with Astryx as the component base. |

## 2. Cross-cutting laws

### LAW-1 · The composer is the front door

A task-first product MUST put the primary composition control before marketing explanation. On `/`, the ask field comes first; examples and mode explanation belong in or adjacent to the composer. Registry rails MAY provide a low-commitment browse alternative below it. Marketing MUST NOT become a preamble users must cross before acting. This law operationalizes D1.

### LAW-2 · Work creates a durable object with a stable URL before it completes

Submitting at `/` MUST create a durable thread and navigate immediately to `/t/:threadId`; consequential sends MUST create the inquiry object before presenting a sending state. Canonical identifiers MUST survive completion, state changes, and internal moves. Historical identifiers SHOULD redirect to the current canonical object rather than become unexplained 404s.

### LAW-3 · Status is a state machine, and each state is a distinct screen contract

Every state MUST define: status label, known facts, next expected transition, primary action, recovery action, timestamp, and object ID. Friendly audience labels and authoritative machine states MAY differ only when the interface exposes their mapping in context. DS-7 owns the presentation contract; CH-1 owns conversational lifecycle states.

### LAW-4 · Progressive certainty: never borrow certainty from the next state

An interface MUST say only what the current state proves. Searching, preparing, sending, delivered, responded, and confirmed are distinct claims. A readback failure (`status_unknown`) MUST NOT be rendered as delivery failure. **sent never means confirmed**. AE never books/charges/confirms; business confirms. A business reply adds information; it does not retroactively expand AE authority. A10 is embodied here: `confirmed` is reserved for business-origin assertions, and no delivery-to-confirmation lifecycle edge may exist.

### LAW-5 · Consequence-bearing facts sit immediately before a named commit action

Before a consequential action, the interface MUST repeat the object, recipient, payload or scope, disclosed data, expected next step, limits, and any price posture. The CTA MUST name the consequence, such as “Send inquiry to {business}”; it MUST NOT be bare Continue, Submit, OK, or Confirm. Greater consequence requires more explicit fact repetition, not merely a larger dialog. AX-1 through AX-3 own the confirmation grammar.

### LAW-6 · Receipts are durable, reachable objects reflecting current state

A receipt MUST remain reachable after the success moment and MUST include a stable searchable ID, timestamp, recipient, submitted fields or immutable scope reference, boundary-honest state, and revisit path. Operator surfaces MUST support global receipt-ID lookup and MUST expose resend and delivery-attempt history on the record. A later business response MUST be a linked item, never a mutation that rewrites what the receipt proved. Toasts are acknowledgements only and MUST NOT serve as lifecycle evidence. AX-5 is the action/readback contract for producing the receipt.

### LAW-7 · Every complex surface has two deliberate disclosure levels

Each surface MUST define a primary decision layer and one deeper inspection layer: filter chips plus full filters; answer plus work record; owner summary plus machine detail; total plus breakdown. A third competing summary SHOULD be removed rather than added. Disclosure MUST preserve evidence, permission, and boundary facts even when details collapse.

### LAW-8 · Zero results teach the specific mismatch

A zero-result state MUST name why nothing is shown and offer the smallest valid correction. Active constraints MUST have individual relax actions; the system MUST NOT silently broaden them. Operator empties MUST name the relevant visibility policy. Terminal supply failures MUST offer a truthful alternate path. DS-13 owns the complete empty-state taxonomy.

### LAW-9 · Conversation is a document spine, not a pile of chat bubbles

Conversation MUST render as one readable chronological column. Item types are distinguished by anatomy—heading, metadata, status, evidence, and action row—not merely by bubble side or color. The latest item is expanded; older episodes MAY be grouped, but item IDs, states, receipts, permissions, and boundary facts MUST never be hidden or summarized away. Suggested next moves follow the settled item and become ordinary user items when selected. This law is canonical for document structure; CH-7, CH-8, and CH-11 define its behavioral projection. <!-- tape-out: A13 -->

### LAW-10 · Navigation is redundant by design; each layer has one job

Navigation MAY offer sidebar recognition, shortcut habit, command-palette recall, canonical URL sharing, and scoped search, but all layers MUST derive from one route/action registry. The operator command menu MUST be mounted at the shell boundary, grouped by Navigate / Open record / Change view / Act on focused record, and filtered by authorization. Search scopes MUST remain explicit rather than collapsing into one overloaded box. IA-2 owns registry consistency.
<!-- tx-lens -->
### TX — Transaction discipline

Every consequential action follows the **TX lens** below. [`WEDGE-LADDER.md` §4.3b](./WEDGE-LADDER.md#43b-transaction-discipline) is the normative source when this summary and the full transaction contract differ.

| Guarantee | Design rule |
|---|---|
| **Sign what you see** | Review and admission MUST use one canonical serialization and one payload digest; the rendered review fields MUST be the fields admitted. |
| **Preconditions at commit** | `R1TargetAdmitted` and the full authority tuple MUST be re-evaluated atomically at commit; drift produces a typed refusal and invalidates review. |
| **No replay** | The same one-use key returns the original result; the same key with a different digest is refused. |
| **One transition path** | Consequential writes MUST pass through the single state-transition function; side-door writes or dispatches are prohibited. |
| **Append-only evidence** | Commands append events, all status and other projections are derived, and direct projection writes are prohibited. |
| **Receipt ≠ outcome** | A receipt states `doesNotProve`; it proves recorded admission/dispatch evidence, while the business remains the oracle for the real-world outcome. |
| **Bounded blast radius** | Recipient, field, purpose, time, expiry, and cumulative-exposure caps MUST bound every authorization. |
| **Countersigned responses** | The target state records a business reply as an owner-session-attested response-digest event, producing two-party attestation. |
| **Deterministic replay** | Every projection and dispute answer MUST be reproducible from the event log rather than trusted from stored projection state. |

Every consequential-action design MUST state explicitly how it satisfies **sign-what-you-see**, **commit-time preconditions**, and **receipt ≠ outcome**. Customer-facing language MUST translate these mechanics into concrete approval and record terms; implementation vocabulary such as digest, nonce, ledger, and transaction belongs only on operator or builder surfaces.

## 3. Information-architecture rules

### IA-1 · Four route classes, exactly one per human route

Every human route MUST be classified as exactly one of: public discovery, private-link record (`/i/:threadId?k=`), owner activation (`/claim`), or authenticated operator (`/_operator/*`). Shell-rendered MUST NOT be treated as synonymous with public.

### IA-2 · One route map drives every navigation projection

Top navigation, command palette, footer, sitemap, breadcrumbs, and operator navigation MUST derive from one route/action registry. The command palette MUST be generated from that registry and mounted at the shell boundary; its commands and authorization MUST agree with visible navigation. See LAW-10.

The locked public header projection is **Ask · Businesses · Claim your business page**. `For agents` is footer-only; Activity remains a returning-user rail on `/` until accounts exist, not a public navigation item. The public footer projection is stated once here: **For agents · Privacy · Terms · Help · About**. <!-- stupid-shit: S3 -->

### IA-3 · One front door for requests

`/` is the primary request entry and MUST consume submitted and query-string requests. Every Ask link, follow-up suggestion, and legacy `/q/:answerId → /?q=` redirect MUST resolve to this functioning entry. `/engine` MUST NOT survive as a permanent competing front door after convergence.

### IA-4 · Machine discovery is a sibling information architecture

Machine discovery MUST have a real, labelled “For agents” onboarding page that explains what agents can discover and submit, access expectations, quick start, boundaries, and canonical endpoints for `SKILL.md`, `llms.txt`, UCP, Web Bot Auth, and catalog APIs. Raw machine artifacts MUST NOT be scattered as footer clutter or advertised beyond their real access and behavior.

### IA-5 · Sitemap is a product-state decision

Only canonical, public, loadable pages belong in the sitemap. Authentication-gated, private-link, duplicate, unavailable, or aspirational routes MUST NOT be indexed.

### IA-6 · Pick a skeleton by task, not aesthetics

Routes MUST use these task skeletons:

- editorial or trust: `AePublicShell` + `AePageHeader` + `max-w-5xl` section rail;
- focused form or private record: header + `3xl–6xl` single column;
- catalog: Astryx `Layout` + auto-fit grid;
- listing/detail: `7xl` main + sticky action rail at `lg`;
- conversation: immersive `h-dvh` shell with pinned footer;
- operator: `AeOperatorShell`, with shell-owned chrome and page-owned content.

### IA-7 · Width and rhythm use a named ladder

Widths MUST be chosen deliberately: `3xl` focused/error, `5xl` editorial, `6xl` standard public, `7xl` data/detail, and `1280` catalog. Gutters are `px-4 md:px-6`. Default vertical rhythm is 12 between editorial sections, 6 between page blocks, and 4 inside cards.

### IA-8 · Routes stay thin

A route owns loading, authentication, search parameters, and SEO. Deep composition belongs in a reusable component. Routes MUST NOT grow a second component system or embed domain orchestration in page markup.

### IA-9 · Action rails contain decisions, not duplicate content

The main column owns facts and evidence. The rail owns the next action, assistant affordance, and correction path. A rail MUST NOT restate the page or outrun the evidence available in the main column.

## 4. Conversational and multi-turn rules

### CH-1 · One canonical turn lifecycle

The conversational lifecycle is:

`draft → submitted → understanding → needs_input | working → proposal | answer_ready → awaiting_confirmation → executing → settled | failed | stopped`

Delivery-bearing variants MAY additionally enter `delivery_retrying`, `delivery_failed`, `business_unavailable`, `user_canceled`, or `status_unknown`. Delivery state MUST exist only on delivery-bearing item variants, and valid tuples MUST come from one transition registry rather than a Cartesian combination. Every rendered state MUST map to a durable domain state and satisfy LAW-3. Persisted pending and failed turns MUST render; failed turns MUST NOT disappear from history. `status_unknown` means authoritative readback is unavailable, not that the underlying operation failed. <!-- tape-out: A7 -->

### CH-2 · Three layers in every assistant turn, never blended

Every assistant turn MUST separate:

1. **Answer or proposal** — the conclusion or next decision;
2. **Public work record** — sanitized checks, sources, assumptions, and limits (“How AE checked this”);
3. **Private run evidence** — raw tools and timing, available only on authorized operator surfaces.

No projection may leak private run evidence into a public or private-link record.

### CH-3 · No private-reasoning theatre

Interfaces MAY show a plan, checks, sources, assumptions, and uncertainty. They MUST NOT claim to expose hidden chain-of-thought or manufacture reasoning theatre. Public records describe checks and listed facts, not private reasoning.

### CH-4 · Render plans only when they help a decision

For a simple lookup, work SHOULD begin immediately and show compact named phases plus an interpreted-search readback. For ambiguous, expensive, or consequential work, show a short editable plan containing the interpreted need, missing facts, intended checks, and action boundary. A transport plan event MUST NOT silently control budgets or outcomes while remaining invisible when its contents affect the user’s decision.

### CH-5 · Carried context is inspectable, provenance-marked, and correctable

Before a follow-up, show the smallest useful interpreted phrase and carried constraints as an inspectable work record—not a generic “using previous context” banner. Each fact MUST retain one provenance class: `asked`, `understood`, `assumed`, `found`, or `authorized`. A user MUST be able to correct one fact without restarting the thread.

### CH-6 · Failures persist as turns with stable recovery

A failed operation MUST remain in chronology and offer Try again, Edit request, or Choose another path as appropriate. Retry copy MUST state whether it restarts, resumes, or forks and MUST preserve idempotency and scope boundaries.

### CH-7 · One status narrative per scope

An active turn gets a trace; a settled turn gets a compact record; a session gets a journey only when it adds cross-turn orientation. The interface MUST NOT stack multiple overlapping explanations of the same work. See LAW-9.

### CH-8 · History is quiet without losing truth

The latest turn SHOULD be expanded and older episodes collapsed or grouped. The interface MUST preserve a last-turn anchor, yield scrolling to the user, and indicate when streaming continues below. Grouping MUST preserve IDs, semantic states, permissions, receipts, and recoveries.

### CH-9 · Every terminal state has one primary recovery

Recovery MUST match the failed operation: rate limit → retry after; network → reconnect; invalid input → correct field; no options → edit criteria; permission failure → review scope; no reply → direct contact or revise request. Generic “unavailable” is prohibited when the system knows the failure class.

### CH-10 · Implement or delete `reconnecting`

A lifecycle state is a contract, not decoration. `reconnecting` MUST have a real producer, transition rules, announcement, and recovery semantics or MUST be removed from the renderer.

### CH-11 · All conversation systems converge on one projection

Chat, Customer Request, and inquiry threads MUST render through the D2 conversation-item primitive. Domain-specific content MAY differ; transcript shape, lifecycle projection, accessibility, failure handling, and boundary semantics MUST NOT fork into parallel architectures.

## 5. Confirmation grammar

### AX-1 · Proposal card contract

<!-- de-hedge --> A proposal MUST state: what AE proposes, why, evidence and limits, what will happen, data and recipient scope, useful price posture, and explicit actions. Price posture follows one ladder: show a dated, business-attested indicative price when published (`Callout from $90`); otherwise show a useful adjacent fact such as reply posture, or omit the row; at the send decision point only, state `Price is confirmed by {business} in their reply`. AE MUST NOT synthesize a total. The proposal is an editable draft summary. The permission request is the single exhaustive readback; changed or sensitive fields and consequence facts MUST be emphasized adjacent to the named CTA, including on mobile. The same scope model MUST project across chat, Customer Request, and inquiry. <!-- tape-out: A6 -->

### AX-2 · Confirmation depth follows consequence, not component type

Use link-out review for browsing, inline confirmation for bounded data sharing, modal confirmation for destructive or irreversible actions, and pending lock plus receipt for externally observable sends. The chosen component MUST reflect consequence and authority rather than visual preference.

### AX-3 · Confirmation copy names the object and consequence

Copy MUST say what acts on what: “Send this inquiry to X” or “Allow AE to share these fields with up to N businesses.” Bare Continue, Confirm, Submit, Yes, or OK MUST NOT authorize a consequential action.

### AX-4 · Refusal is first-class

Permission requests MUST offer symmetric Allow / Don’t allow choices and show scope, status, and revocation where supported. Refusal MUST NOT be visually hidden, shame-framed, or treated as an error.

### AX-5 · Every consequential action pairs with readback

Before action, show exact scope. During action, lock duplicates with disabled state and `aria-busy`. After action, show a durable receipt, correlation identifier, delivery history, and recovery path. While a request is pending, show the expected response window and a withdrawal affordance; withdrawal MUST create an explicit state transition and MUST NOT imply that an already completed external action can be erased.

### AX-6 · Never collapse proposal and execution

Selecting a provider chooses context; opening a form begins review; sending executes the request; a business response is external information; a business-origin confirmation alone can confirm. These boundaries MAY share a compact surface, but MUST never be hidden or summarized away. <!-- tape-out: A13 -->

### AX-7 · Boundary copy lives beside the action

<!-- de-hedge --> The applicable load-bearing boundary statement MUST appear once beside the commit action and once in the resulting receipt when the state changes. It MUST NOT be repeated in general chrome, research cards, rails, or surrounding explanatory copy. For a send, use `Price is confirmed by {business} in their reply` beside the commit action. AE never books/charges/confirms; business confirms.

## 6. Design-system rules

### DS-1 · Astryx first, composition second, bespoke primitive last

Use an Astryx primitive when one exists, then compose it. A bespoke behavioral primitive is permitted only when the missing Astryx capability is documented. Duplicate APIs for the same interaction MUST converge.

### DS-2 · Tailwind for layout; Astryx for behavior

Flex, grid, gap, width, and responsive arrangement use Tailwind. Focus, disabled, loading, keyboard, overlay, and dialog behavior use Astryx. Layout utilities MUST NOT recreate behavioral primitives.

### DS-3 · Semantic tokens only

Components MUST use semantic tokens such as `text-primary`, `bg-surface`, `border-border`, `rounded-md`, and `shadow-sm`. New `--ae-*` aliases are prohibited outside an explicit migration shim. Use semantic state variants; reserve categorical color for stable categories.

### DS-4 · Interactive wrappers preserve the Astryx state contract

Every wrapper MUST preserve label, `isDisabled`, loading or `aria-busy`, keyboard operation, and `:focus-visible`. Every public prop MUST have observable semantics; no-op props MUST be implemented or deleted.

### DS-5 · One motion vocabulary

Motion uses the Astryx fast, medium, and slow tiers selected in D4. Literal durations and a parallel AE duration vocabulary are prohibited in components.

### DS-6 · Reduced motion means semantic immediacy

Decorative transforms MUST use `motion-safe:`. JavaScript-, Motion-, RAF-, or timer-driven behavior MUST provide an explicit reduced-motion branch that reaches the final semantic state immediately.

### DS-7 · Status is redundant in meaning, singular in authority

Status MUST use text plus shape or position and MAY add color; color alone is never sufficient. `status-presentation.ts` MUST centrally map authoritative state to audience label, compact label, tone, audience, publicness, recovery, and disabled reason. When owner/operator wording differs from kernel vocabulary, the interface MUST expose an in-product bridge between the two; it MUST NOT maintain two unexplained status taxonomies. Toast severity MUST remain distinguishable, and a toast MUST NOT substitute for a durable status record. See LAW-3.

### DS-8 · One timestamp component

All rendered timestamps MUST use `<time dateTime={iso}>`, the shared time formatter, and tabular mono numerals where appropriate. Route-local `Intl.DateTimeFormat` implementations are prohibited.

### DS-9 · Radius follows a monotonic ladder

Radius MUST increase monotonically: `inner < element < container < page < full`. Token remaps MUST NOT make larger semantic radius names render smaller or equal without an explicit compatibility reason.

### DS-10 · Name the theme honestly

The effective visual theme is AE eucalyptus extending Astryx neutral and MUST be represented as `aeTheme`. AE overrides MUST NOT be silently applied under a neutral theme identity.

### DS-11 · Dark mode is unsupported until the root theme can switch mode

A legacy variable block or local dark surface MUST NOT be described as product dark mode. Dark mode becomes supported only when the root Astryx `Theme` switches coherently and all state contracts remain accessible.

### DS-12 · Forms have one error and submission contract

Forms MUST use `FormLayout`, field-local errors with `aria-invalid` and `aria-describedby`, shared focus-first-invalid behavior, disabled-plus-loading submission, and a summary Banner for server failures. Consequential forms also follow D5 and §5.

### DS-13 · Empty states encode meaning and the next valid action

Every empty state MUST select one meaning: no source data, no filter match, resource not found, access denied, temporarily unavailable, or unmet demand. Copy and actions MUST fit that meaning. A no-filter-match state MUST name active constraints and provide an individual relax action for each; it MUST NOT silently broaden results. Operator empties MUST explain visibility policy. See LAW-8.

### DS-14 · Loading preserves geometry; errors preserve context

Route skeletons MUST mirror settled geometry. Errors MUST retain the shell and offer retry or a safe alternate path. Raw `error.message` values MUST NOT be printed on public surfaces.

### DS-15 · Baseline accessibility and illustrative-truth contract

Touch targets MUST be at least 44px. IDs and timestamps SHOULD use mono/tabular numerals. Entrance motion MUST be `motion-safe`. Illustrative UI MUST label itself “example” or “preview” inside the component and MUST NOT imply live availability, authority, or evidence it does not possess.

## 7. Ambition doctrine

- **System before screen.** Routes arrange content; they never invent visual language.
- **State is the brand.** AE’s distinctive character comes from truthful status, evidence, and readback—not ornament.
- **Every flourish has a job.** Motion, color, and layout variation MUST clarify hierarchy, state, trust, or next action.
- **No generic SaaS.** No repeated grids of three equal cards, AI-purple glow, hero metrics, or fake dashboard art.
- **No future-surface cosplay.** No unimplemented commercial, hosted-agent, or machine-control surface before its capability gate. Product copy and UI MUST remain inside current authority.
- **Boundary honesty is structural.** **sent never means confirmed**; AE never books/charges/confirms; business confirms. These are lifecycle invariants, not disclaimer styling.
<!-- de-hedge --> **Hedges are decision-point infrastructure, not voice.** Render a hedge only where it is load-bearing and adjacent to the decision it qualifies. A hedge MUST NOT displace a showable fact; two defensive clauses in one view are hedge-stacking and prohibited; when no useful fact exists, silence beats defensive copy.

## 8. Anti-pattern register

The following patterns are prohibited:

1. **Vocabulary drift:** multiple names for the same object across route, navigation, UI, machine output, and documentation.
2. **Action-vocabulary theft without authority:** Reserve, Book, Charge, Confirm, or instant-total language when AE lacks that authority. AE never books/charges/confirms; business confirms.
3. **Toast as lifecycle evidence:** transient acknowledgement standing in for a receipt, failure record, or durable status.
4. **Stale counterpart during rework:** retaining an old business, recipient, or delivery claim after rerouting without clearing or qualifying it.
5. **Color-only or icon-only status.**
6. **One overloaded search box:** mixing navigation, object lookup, catalog filtering, and action search without explicit scope.
7. **Command palette as dumping ground:** ungrouped, unauthorized, or context-free commands.
8. **Telemetry-heavy public URLs:** noncanonical tracking state polluting stable shareable URLs.
9. **Marketing-page sprawl:** capability catalogues or preambles displacing the primary task.
10. **Silent shared-default mutation:** changing a team or public default through a personal view control without an explicit “Set as default” action.
11. **Semi-secret keyboard-only affordances:** infrequent-user actions available only through shortcuts; owner surfaces require visible equivalents.
12. **Accidental accessibility noise:** duplicate announcements, repeated status prose, or multiple live regions describing one state.
13. **Duplicated status vocabularies without an in-product bridge.**
14. **Sign-in interruption of legitimate public flows:** authentication before a route-class or consequence boundary requires it.
15. **Private-reasoning theatre:** presenting hidden chain-of-thought or decorative plans as evidence.
16. **Generic unavailable states:** hiding a known failure class and its specific recovery.
17. **Decorative lifecycle states:** renderer states with no producer or transition contract.
18. **Parallel component or token systems:** recreating Astryx behavior, adding visual aliases, or leaving duplicate interaction APIs.
19. **Generic SaaS ornament:** equal-card grids, AI glow, fake metrics, and dashboard art without operational meaning.
20. **Future-surface cosplay:** UI or claims for capabilities that have not passed their rung gate.
21. **Silent result broadening:** removing constraints without the user choosing the named relaxation.
22. **Outcome theatre:** waiting, evaluation, comparison, or success chrome that implies supply response or authority the domain has not produced.
23. **Projection writes outside the event log:** mutating status, records, or other derived views without appending the authoritative event first. <!-- tx-lens -->
24. **Review digest ≠ admitted digest:** rendering or approving bytes that differ from the canonical payload admitted at commit. <!-- tx-lens -->
25. **Ambient boundary repetition:** repeating non-claims in cards, rails, headings, or explanatory chrome instead of stating the load-bearing boundary once at its decision point. Hedge-stacking is the same failure in compact form. <!-- de-hedge -->

## 9. Enforcement gaps

These gaps MUST be closed with executable enforcement, in priority order:

1. `tests/ui` lacks a real public design-system suite; rebuild it as an enforced gate.
2. The negative `scanUiContract` fixture is orphaned; execute it so every contract regex is proven to reject violations.
3. `scanPublicLanguage` does not clean-scan production; promote it to a whole-tree gate over an enumerated set of public surfaces.
4. The shadcn quarantine is non-enforcing; the scanner MUST fail on prohibited live component-system presence rather than exclude the directory.
5. Accessibility E2E coverage is too narrow; cover landing, composer/thread, registry, detail, a long form, an operator table, a dialog, and an async flow, including axe, reduced-motion emulation, focus return, keyboard operation, and 200% zoom.
6. Route-transition focus and dirty-form navigation policies need executable contracts; short-form recovery does not replace a blocker for consequential forms.
7. Scanner authority is encoded by implementation phase rather than capability rung. At the first rung-gate implementation, migrate `PhaseNumber` exceptions to an `allowedRungs` manifest tied to R0–R4, with explicit owner, expiry, and deletion gate; new phase-number exceptions are prohibited. <!-- tape-out: A8 -->
8. Boundary honesty needs semantic fixtures beyond lexical scans: prohibit a receipt-to-confirmation mutation, require business-origin provenance for confirmed fields, and verify **sent never means confirmed**. <!-- tape-out: A10 -->
9. Conversation fixtures MUST be generated from the transition registry so impossible type/lifecycle/delivery tuples cannot acquire plausible renderers. <!-- tape-out: A7 -->

## 10. Route blueprints

| Route | Compact normative blueprint |
|---|---|
| `/` | Composer first; actionable example asks; registry browse below. Submit creates a thread and immediately navigates to `/t/:threadId`; Stop remains available. Marketing belongs below the fold or on `/about`. |
| `/t/:threadId` | Durable document spine; query as title; named work phases; inline evidence plus collapsible work record and dedicated evidence view; deduplicated sources; next moves after settlement; private/link-shared/expiring state visible. Shared-thread continuation forks rather than mutating the shared record. R0 ends at **Your shortlist is ready** with no inquiry chrome. The locked customer labels are **Your shortlist is ready** and **Find businesses**. <!-- stupid-shit: S4 --><!-- tape-out: A13 --> |
| `/registry` | Persistent editable search summary; chips plus full filters; cards answer whether a candidate is actionable through capability, service area, evidence posture, and supported next action; zero state names constraints with individual relax controls. |
| `/:slug` | Identity/save-share → capability facts → evidence and response posture → highlights → detail → proof → service boundary → terms. Sticky rail contains need, constraints, useful price posture (dated business-attested indicative price when published; otherwise reply posture or no price row), and Ask action; it MUST NOT carry ambient boundary copy or outrun evidence. Exact/private detail remains gated until consent where required. | <!-- de-hedge -->
| `/:slug/inquiry` | Request review repeats recipient, scope, timing, contact, consent, quote posture, expected response window, and withdrawal semantics with Change controls. Named CTA, duplicate-safe pending lock, and durable receipt are mandatory. |
| `/owner/inquiries` | Split triage layout; bounded dispositions Reply / Request clarification / Decline / Snooze; resulting-status text; durable focus; visibility-aware empties; visible controls paired with surfaced `G`, `J`, `K`, Space, and Enter shortcuts. |
| `/admin/runs/:turnId` | Object workspace: identity header; audience label ↔ kernel state bridge; state-gated actions; related graph from inquiry through proposal, receipt, delivery attempts, and run; machine noise collapsed; receipts and permission decisions never hidden; raw JSON one layer deeper. Test/simulated records require structural, not color-only, marking and restrictions. |
| For agents gateway | Footer-linked onboarding page states real discovery/submission scope, quick start, access expectations, canonical `SKILL.md`, `llms.txt`, UCP, Web Bot Auth, and catalog endpoints, plus portable boundary statements. It MUST NOT claim unsupported machine authority. <!-- stupid-shit: S3 --> |
