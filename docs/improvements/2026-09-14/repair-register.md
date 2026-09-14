# Alpha UI/UX repair register

**Updated:** 2026-09-14
**Owner:** UI/UX stabilisation task
**Source audit:** [Alpha IA/UX stabilisation audit](./audit.md)

This is the detailed interface repair queue that supports the 32-item release
maturity register. It does not create new release scope and cannot mark a parent
AM item verified. A source fix remains subject to integration, hosted task proof,
compact-layout and keyboard review under AM-27/31/32.

## Status rules

- **OPEN:** established defect without an integrated source correction.
- **ACTIVE:** bounded repair is in progress in this task or an agreed owner task.
- **FIXED IN SOURCE:** a committed correction has focused observable-behaviour evidence.
- **BLOCKED:** a named owning contract or executable continuation is missing.
- **VERIFIED:** accepted candidate behaviour has been observed under the release register's evidence rules.

## P0 journey register

| Finding | Parent | Status | Source evidence / next boundary |
| ---: | --- | --- | --- |
| 1. Owner home is Provider Tools rather than a neutral Overview | AM-27 | FIXED IN SOURCE | `c520db917`: `/owner` is the workspace home and independently projects Balance, Calls, Agents and applicable Provider state with one evident next action. Provider navigation disclosure remains finding 2. |
| 2. Buy and Supply appear as one role before Provider intent exists | AM-27 | FIXED IN SOURCE | `0a5b24644`: the default buyer shell omits Supply. Existing Provider state is exposed by the conditional Overview card; direct authenticated Provider routes remain reachable and disclose the Supply group while active so deep-linked users retain orientation. |
| 3. Mobile buyer navigation omits Balance and promotes Provider Tools | AM-27 | FIXED IN SOURCE | `c520db917`: compact primary navigation is Overview, Market, Calls and Balance; Agent and Provider administration cannot displace purchase continuity. |
| 4. Global and workspace navigation duplicate Market and Calls | AM-27 | FIXED IN SOURCE | `5116d283c`: authenticated Market now lives at `/owner/market` in the Buy group, shares the public Market data/view contract, and preserves its shell through search/filter/page transitions; the operator shell suppresses the public primary and drawer navigation. Calls remains in that same workspace hierarchy. |
| 5. Balance availability depends on Agent-directory state | AM-11, AM-23 | OPEN | Shared Balance work is release-owner controlled; use an independent authoritative Account balance read. |
| 6. Unrelated Balance resources share one load lifecycle and can race | AM-07–11, AM-23, AM-27 | OPEN | Model each read independently; preserve known Balance and document facts when a secondary read fails. |
| 7. Balance history is not an authoritative Account chronology | AM-11, AM-23 | OPEN | Requires the owning Account-history read contract; do not merge partial Agent pages in the browser. |
| 8. Available Balance lacks first-view hierarchy | AM-07, AM-11, AM-27 | OPEN | Apply the OpenRouter reference pattern: dominant available AUD, reserved state beneath, one Add credit action. |
| 9. Funding creation uses overlapping action flags | AM-07–10, AM-27 | OPEN | Reconcile after the release owner's current funding panel changes; encode mutually exclusive action states. |
| 10. Funding processing has no executable update path | AM-09, AM-10 | FIXED IN SOURCE | `61b7b0866`: exact-session Check this payment preserves the attempt and known pending state. Hosted forced-event proof remains. |
| 11. Funding continuation copy does not match its action | AM-05, AM-09, AM-24 | FIXED IN SOURCE | `61b7b0866`: removed false Stripe/Agent affordances; each visible action now performs the named continuation. Executable Agent deep-link remains blocked below. |
| 12. Transient funding failure is collapsed with invalid/expired links | AM-09, AM-10, AM-27 | FIXED IN SOURCE | `61b7b0866`: unavailable, missing, expired, failed, awaiting, processing and ready states remain distinct. |
| 13. Market defaults to the densest catalogue | AM-27 | FIXED IN SOURCE | `c7a9546e0`, integrated by release owner as `bf9a71be7`: empty Market opens guided discovery even if optional showcase data fails. |
| 14. Market exposes source/protocol filters before buyer needs | AM-27 | FIXED IN SOURCE | `8d885b887`: category and listed price remain primary; network, Provider, metadata, payer and catalogue facets use the maintained Collapsible control. |
| 15. Tool cards foreground USDC/network before an exact buyer AUD Quote | AM-18, AM-27 | FIXED IN SOURCE | `e5136b402`: external amounts are explicitly labelled Provider-listed evidence and remain secondary to Tool identity; settlement network is absent from cards and pending detail. Exact buyer-AUD language appears only beside the admitted Tool continuation that supports `tool.quote`. |
| 16. Catalogue pagination can turn failure into false completion | AM-27 | FIXED IN SOURCE | `8d885b887`: idle/loading/failed continuation preserves rows and cursor, retries in place and rejects stale responses after a new search. |
| 17. Tool handoff loses progress across browser and Agent | AM-05, AM-24, AM-27 | BLOCKED | Payer-safe handoff exposes no executable Agent return target. Preserve originating Agent and durable supported continuation before changing UI promises. |
| 18. Agent installation has no confirmed resumable progression | AM-05, AM-24, AM-27 | ACTIVE | `575540d92`: setup is an ordered connect → approve → confirm path; **Check connection** refreshes the authoritative Agent directory and is disabled while pending. Originating Tool/Agent continuation remains unavailable. |
| 19. Approval identity is an opaque Tool reference | AM-05, AM-18, AM-24, AM-27 | FIXED IN SOURCE | `219ed5b82`: the accepted Quote now supplies Tool identity, Provider ref, AUD ceiling, effects and data release beside the current Agent label and explicit unrecorded purpose. Missing/legacy Quote context cannot enable approval; decline and scoped refresh remain available. |
| 20. Calls needing attention are mixed with routine history | AM-21–23, AM-27 | OPEN | Foreground an attention queue; keep recent history second and preserve Account scope. |
| 21. Calls pagination failure is invisible and can diverge from loader state | AM-21, AM-23, AM-27 | OPEN | Apply the proven Market continuation state pattern without changing backend remedy semantics. |
| 22. Call receipt loses owner-workspace context | AM-21–23, AM-27 | FIXED IN SOURCE | `5b80b32b9`: the unchanged `/calls/:callRef` URL now renders under the authenticated owner shell with Calls breadcrumb and return action through pending, found, unavailable and refused states. |
| 23. Call receipt foregrounds internal states and identifiers | AM-19, AM-21–24, AM-27 | FIXED IN SOURCE | `5b80b32b9`, `bb190d492`: first view leads with outcome, buyer amount/time, retained Tool snapshot name, recorded Provider reference, current Agent label and Provider output. Unrecorded Provider name and historical purpose are explicit rather than guessed; lifecycle, identifiers, hashes, settlement detail and reuse recipes remain disclosed. |
| 24. Recovery offers competing actions and asks customers for Provider evidence | AM-21, AM-22, AM-29 | FIXED IN SOURCE | `5b80b32b9`, `bb190d492`: the state-supported refresh/remedy is primary; raw evidence is subordinate under **Advanced evidence reconciliation** and appears only when the owner receipt explicitly grants submission permission. Missing context fails closed without hiding refresh or recorded blockers. |
| 25. Route-keyed Call state is mirrored after render | AM-21–23, AM-27 | FIXED IN SOURCE | `5b80b32b9`: the controller is keyed by `callRef`; loader replacement is rendered synchronously and local recovery state cannot cross Call identity. |

## P1 stabilisation register

| Boundary | Parent | Status | Completion condition |
| --- | --- | --- | --- |
| Privacy-safe funnel events | AM-28 | BLOCKED | Confirm the intended analytics destination and event schema before emitting stage-only events; never capture content or protected identifiers. |
| Shared buyer-facing Call status | AM-21–24, AM-27 | OPEN | List, attention queue, receipt and notification render one status projection without merging payment, delivery and purchase facts. |
| Standard identity-first tables | AM-23, AM-27 | OPEN | Identity first, decision facts next, labelled action last; compact layout remains scannable. |
| Scoped optional-read failures | AM-11, AM-23, AM-27 | OPEN | Known content remains useful; only the failed region offers Retry; destructive treatment is reserved for blocked/dangerous states. |
| Stable shell rhythm and responsive layout | AM-27 | OPEN | One rail and vertical rhythm survives desktop/compact transitions without first-view reflow or hidden primary actions. |
| Task-level critical journey coverage | AM-05, AM-07–10, AM-18–24, AM-27, AM-31 | OPEN | Connect → fund → use → Call → receipt/recovery covers reload, partial read, refusal, processing and unknown outcome. |

## Blocked dependencies

| Dependency | Owning acceptance | Effect on UI work |
| --- | --- | --- |
| Executable browser-to-Agent return/resume target | AM-05, AM-24 | Funding and Tool handoff may give honest close-and-resume guidance, but cannot claim a one-click return. |
| Authoritative Account-level chronological history | AM-11, AM-23 | The UI must not manufacture completeness from funding records plus one partial Agent page. |
| Permitted Call remedies and shared buyer status projection | AM-21–23 | Receipt/recovery hierarchy can improve only without inventing actions or collapsing commercial states. |
| Confirmed analytics destinations and privacy-safe schema | AM-28 | Funnel instrumentation remains blocked rather than sending unreviewed customer context. |

## Evidence log

| Date | Finding | Change | Checks | Remaining proof |
| --- | ---: | --- | --- | --- |
| 2026-09-14 | 10–12 | `61b7b0866` preserves exact-session funding continuation and distinct failure states | Funding-return and handoff API: 11 tests; lint; typecheck; staged React Doctor | Release integration, hosted cancel/fail/expire, forced replay/reordering, executable Agent return |
| 2026-09-14 | 13 | `c7a9546e0` makes guided discovery the deterministic default; release integration `bf9a71be7` | Market route/page: 33 tests; lint; typecheck; staged React Doctor | Frozen-candidate compact/keyboard/cold-task proof |
| 2026-09-14 | 14, 16 | `8d885b887` progressively discloses advanced catalogue facts and makes continuation recoverable and stale-safe | Market route/page/filter: 44 tests; lint; typecheck; commit-hook React Doctor passed | Release integration, compact/keyboard/cold-task proof |
| 2026-09-14 | 1, 3 | `c520db917` adds the neutral owner Overview, corrects owner home, and constrains compact navigation to the buyer journey | Overview/navigation: 8 focused tests; focused lint; staged React Doctor 0 errors (2 bounded-role lookup advisories) | Release integration, Provider-nav disclosure, compact/keyboard/cold-task and hosted proof |
| 2026-09-14 | 18 | `575540d92` makes Agent setup ordered and explicitly confirmable against the authoritative directory; it also scopes directory-read failure away from Balance | Setup/Agent route: 10 focused tests; focused lint; staged React Doctor 0 errors (3 pre-existing/bounded advisories) | Origin-preserving return target, compact/keyboard/cold-task and hosted connection proof |
| 2026-09-14 | 22–25 | `5b80b32b9` retains the owner shell, leads with buyer-facing outcome/money, progressively discloses technical evidence, narrows remedies and scopes state by Call identity | Call receipt/recovery: 20 focused tests; focused lint; staged React Doctor 100/100 | Display-name/Agent/Provider projection, reconciliation privilege fact, compact/keyboard/cold-task and hosted recovery proof |
| 2026-09-14 | 4 | `5116d283c` separates public and authenticated navigation while preserving one shared Market implementation and shell-stable transitions | Market/shell/navigation: 45 focused tests; focused lint; staged React Doctor 0 errors (3 pre-existing/advisory findings) | Release integration, compact/keyboard/cold-task and hosted shell proof |
| 2026-09-14 | 19 | `219ed5b82` makes approval an accepted-Quote decision region and fails closed when those facts are unavailable | Agent console: 16 focused tests; focused lint; staged React Doctor clean | Release integration, compact/keyboard/cold-task and hosted approval proof |
| 2026-09-14 | 23–24 | `bb190d492` consumes the owner receipt identity and reconciliation-permission projection, exposing honest missing-history facts and failing evidence submission closed | Call receipt/recovery: 21 focused tests; focused lint; staged React Doctor 92/100 with one pre-existing `ResultDetails` complexity advisory | Release integration, compact/keyboard/cold-task and hosted recovery proof |
| 2026-09-14 | 15 | `e5136b402` separates Provider-listed price evidence from the exact buyer AUD Quote and removes settlement networks from first-layer Tool cards | Market price/card/detail: 47 focused tests; focused lint; staged React Doctor 0 errors (pre-existing component complexity/Intl/route-file advisories) | Release integration, compact/keyboard/cold-task and hosted Tool-selection proof |
| 2026-09-14 | 2 | `0a5b24644` makes Supply a disclosed Provider mode rather than a default buyer responsibility without removing direct route access | Sidebar disclosure: 1 focused behaviour test; focused lint; staged React Doctor 100/100 | Release integration, compact/keyboard/cold-task and hosted role-orientation proof |
