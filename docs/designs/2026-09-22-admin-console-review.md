# Admin console review and synthesis

Date: 22 September 2026. Review mode: non-interactive design review plus rendered-browser inspection.

Evidence: the three committed wireframes and rationales; `OpsJobsFromCode`, `ReferenceBackOffices`, `MarketplaceMetrics`, and `UserSupportPractice`; current permission matrix and admin APIs. Every wireframe view and every role state was exercised at 1440 × 1000. Home captures: `/tmp/admin-variant-a.png`, `/tmp/admin-variant-b.png`, `/tmp/admin-variant-c.png`.

Alpha constraint: Joel is the only `owner_admin`; a support seat is possible later; Formance/x402 is not configured locally; supply is small; Convex Dashboard remains the raw-operations surface.

## 1. Job coverage matrix

Notation: `screens/clicks` starts on Home, excludes typing, and ends at a result or final confirmation. Guards are `R` reason, `F` fresh `fva`, `2` distinct second approval, `A` audit preview. `✓` is drawn on that job, `~` is promised elsewhere rather than drawn, `—` is not applicable, and **no DONE** means the wireframe correctly stops at evidence or a disabled control.

| Operator job | A · Search first | B · Triage inbox | C · Cockpit |
|---|---|---|---|
| Lookup by ref | `2/1`, Search → exact object (`#view-home`, `#view-call`) · read-only | `2/2`, Global search → object (`#view-search`, `#view-call`) · read-only | `2/2`, Global search → result/object (`#screen-search`, `#screen-call`) · read-only |
| Call money-truth investigation | `2/1`, recent/exact Call (`#view-call`) · unsafe retry disabled; best coverage | `2/1` to case sheet, `3/2` to Call (`#view-home`, `#view-call`) · unsafe action withheld | `3/2`, alert/list → Call (`#screen-list`, `#screen-call`) · read-only |
| Purchase resolution decision | `3/3` to evidence/Call; **no DONE** (`#view-queue`, `#view-call`) · `R/F/2/A ~` | `2/3` normal, `2/5` refund (`#view-home`, case sheet/guard) · `R/F/A ✓`, `2 ✓` for money | `2/4`, queue → guarded dialog (`#screen-queue`) · `R/F/A ✓`, `2 —`; command absent |
| Removal request | `2/2` to queue evidence; **no DONE** (`#view-queue`) · guards not drawn | `2/3` to case guard (`#view-home`, case sheet) · `R/F/A ✓`; removal-specific command not wired | No dedicated path; **no DONE** (`#screen-list`) |
| Tool source-authority review | No dedicated path; **no DONE** (`#view-search`) | `2/1` to evidence; **no tailored DONE** (`#view-home`, case sheet) | No dedicated path; **no DONE** (`#screen-list`) |
| Provider suppression | `3/7` (`#view-provider`, `#view-suppress`) · `R/F/2/A ✓` | `3/5+`; final waits for another owner (`#view-provider`, `#view-action`) · `R/F/2/A ✓` | `3/6`; final disabled (`#screen-provider`, `#screen-suppress`) · `R/F/2/A ✓` |
| Admin membership | No action screen; **no DONE** (`#view-audit`) | No action screen; **no DONE** (`#view-audit`) | Audit filter only; **no DONE** (`#screen-audit`) |
| Payout failure handoff | Search can reach Business, but no payout case; **no DONE** (`#view-provider`) | `2/2`, case → Stripe handoff (`#view-home`, case sheet) · vendor-owned, no AE guard | `3/2`, payout metric/list → Stripe (`#screen-home`, `#screen-list`) · vendor-owned |
| APP 12/13 request | Support context only; **no workflow** (`#view-support`) | `2/1` to request evidence; **no DONE** (`#view-home`, case sheet) | Support context only; **no workflow** (`#screen-support`) |
| Credit reconciliation delta | Five-number strip has no delta; **no DONE** (`#view-home`) | `2/1` to case evidence; **no resolution** (`#view-home`, case sheet) | `2/1` to Money; delta honestly unavailable (`#screen-home`, `#screen-money`) |
| Uncertain-Call reconciliation | `3/3`, saved queue → drawer → Call; **no reconcile command** (`#view-queue`, `#view-call`) | `2/1` to evidence sheet; **no reconcile command** (`#view-home`) | `3/2`, alert → list → Call; **no reconcile command** (`#screen-list`, `#screen-call`) |
| Audit search | `1/1`, three filters + pagination affordance (`#view-audit`) · read-only | `1/1`, filters + older events (`#view-audit`) · read-only | `1/1`, filters + older events (`#screen-audit`) · read-only |
| Morning health check | Home has five mixed numbers but no system exception summary (`#view-home`) · one hunt | Home has backlog/age/SLA only (`#view-home`) · one glance for work, not health | `1/0`, ten measures + eight thresholded alerts (`#screen-home`) · one glance, but most are absent/derivable |
| Incident notice | No incident surface (`#view-home`) | No incident surface (`#view-home`) | `2/1` to draft; **no publish** (`#screen-status`) · `R/F/A ✓`, authority/backend absent |

A covers known-object investigation. B covers visible exception work. C covers operational awareness. None covers all 14 jobs end to end because the required admin reads and several commands do not exist; drawing completion would be dishonest.

## 2. Cognitive load

- **A:** first view is one search field, three recent objects, three saved searches, then five numbers: 8 simultaneous operable choices, one focal action, two supporting groups. Known-ref Call investigation is recognition, not recall. Health and unprompted exceptions require a hunt. Winner: **“what happened to my Call?”**
- **B:** first view is one inbox plus 3 measures, 5 state tabs, 9 source filters and 8 rows: 22 controls in the first viewport. The row anatomy reduces each decision to object, age, evidence and assignee, but absent assignment/presence/SLA fields add false complexity for one operator. Winner: **clearing exceptions**.
- **C:** first view is 10 measures in 7 groups and 8 alert rules; 8 metric actions appear in the first viewport and 18 across Home. Thresholds externalise memory, but unavailable cards compete with actual signals. Winner: **morning health**, only after absent metrics are cut.

For Joel's alpha loop, no single variant wins all three jobs. A is the fastest lookup, B is the fastest exception path, and C is the fastest scan.

## 3. Gestalt / layout

The app canon is 60/36/700 for display/section type. None follows it exactly.

- **A Call (`#view-call`):** 1,100px content, 784/286 two-column grid, 30px gap, one stable left edge. Money truth, evidence, resolution and timeline form clear vertical chunks; related objects remain in the rail. H1 is 46px/720 and H2 is 18px/700, so hierarchy is strong but off-canon. **A queue (`#view-queue`):** a full 1,100px table becomes list + drawer; 4px tab gaps and shared columns create continuity. The zero-width closed drawer makes the state transition legible without a separate page.
- **B Call (`#view-call`):** 24px main padding; 750/388 grid with 18px gap; 18px object-header padding. H1 34px/700 is closest to the 36/700 canon; H2 varies between 17px and 22px. The bordered header, two panels and timeline group correctly, though borders do work that spacing could do. **B queue (`#view-queue`):** one bordered common region, 4px tab gaps and a right sheet preserve list context; this is the best queue composition.
- **C Call (`#screen-call`):** object header has 22px padding and a 677/349 grid; body columns use a 24px gap. Money truth is correctly between identity and evidence. H1 is 30px/700 and H2 20px/700. **C queue (`#screen-queue`):** H1 jumps to 43.2px/700, one shadowed panel contains tabs/table/drawer. Grouping is clear, but the Call and queue type scales describe different products.

## 4. Restraint

- **Delete from A:** the five-number strip from a search-first Home; “query absent” badges that cannot change a decision; the permission-matrix launcher from production chrome. Keep exact search, recent objects and saved exceptions.
- **Delete from B:** assignment, live-viewer presence, Snooze, beyond-SLA counts and “Assign next” until a second seat and backing model exist; collapse nine source chips behind Filter; remove the separate “Action flow” nav item.
- **Delete from C:** absent metric cards, decorative sparklines, Reliability/Money/Status admin destinations before their readbacks exist, and alert rows that cannot fire. Keep one honest system-state line and actionable exceptions.

All three correctly avoid generic CRUD, raw-row editing, Clerk security clones and Stripe payout-onboarding clones.

## 5. Consistency with the app

- All preserve the persistent sidebar and the existing Market · Agents · Calls · Credit / Provider / utility groups. **A** adds the smallest Admin group. **B** adds seven peer items, including the implementation-shaped “Action flow.” **C** adds nine, while “Money” conflicts with **Credit** and “Status & incidents” duplicates the existing Status destination.
- Canonical vocabulary is strongest in A and B. C's “Money” should be Credit; all must keep Provider, Tool, Call, Purchase resolution, Business and Workspace exactly as defined.
- Each HTML draws local status pills. Production must route every state through `getStatusPresentation()`; no fourth status vocabulary is acceptable.
- Each HTML redraws Call/receipt evidence. Production must reuse the buyer-visible Call receipt, money-truth and support-handoff components, adding admin actions around them rather than copying their facts.
- The role switch is a prototype aid, not authority. Production derives `owner_admin | support | reviewer` from `adminMemberships`; an owner-only “preview as” control may lower the view but can never grant a permission.

## 6. Design-review verdict

- **A — strong integrity:** “the object is the unit of work” predicts every major choice. Search, object, related refs, timeline and Danger Zone feel inevitable. Weakness: it cannot reveal work the operator did not know existed.
- **B — strong idea, over-specified team mechanics:** “work arrives; clear it” is coherent. Assignment, presence, snooze and SLA are borrowed features without alpha constraints to justify them.
- **C — coherent interaction loop, feature-list IA:** number → list → object → action is sound; nine Admin destinations and many absent measures spend the budget on a future operations team.

**Obvious in hindsight:** A's object page is the console backbone; B's exception list is its Home; C contributes only a compact, honest health line. That combination exploits the one-operator constraint rather than fighting it.

## 7. Synthesis — the recommended console

Build a search-and-exceptions console, not a dashboard. Home answers, in order: **is the platform configured and healthy; what needs Joel now; what happened to this exact ref?** A's canonical object pages do the investigation, B's oldest-first list exposes work, and C's thresholds contribute one status line only when backed by a real read.

### Wireframe-level specification (six screens maximum)

1. **Home:** (1) honest system-state banner: Convex readback, Formance/x402 “not configured,” never zero; (2) exact-reference search; (3) oldest actionable exceptions, grouped into Purchase resolutions, removal/source review, uncertain Calls and Provider handoffs; (4) recently viewed objects. No charts or vanity totals.
2. **IA, in order:** Admin **Overview**, **Search**, **Purchase resolutions**, **Providers**, **Audit**. Calls and Providers open as object routes but are not duplicate nav items. Support handoff uses existing **Support**; Status stays the existing **Status**.
3. **Shared object-page contract:** identity + canonical ref + status; action-required/money-truth banner; facts and evidence; immutable timeline; related-object rail; owner-only action area at the end. Call pages reuse the buyer receipt. Provider pages include suppression, removal and source-authority evidence.
4. **Shared list/queue contract:** URL-persisted state/filter/search; age, evidence summary and current state; stable columns; row opens a side sheet for evidence and the canonical object for full work. Assignee/SLA stay hidden until real. No unified case abstraction is required.
5. **Guard contract:** every consequential mutation requires structured reason + evidence refs, server-verified fresh `fva`, idempotency/correlation refs and an audit preview. A distinct second `owner_admin` is required only where policy says so; with one owner, the button remains disabled rather than self-approving.
6. **Role behaviour:** `owner_admin` sees permitted actions; `support` reads and annotates triage only; `reviewer` is read-only. Previewing a lower role changes rendering only. Routes and mutations re-check authority server-side.

**Deferred and trigger:** Credit/payout/reconciliation views until Formance and x402 are live plus cross-account aggregates exist; incident authoring until a hosted status vendor and incident command exist; assignment/SLA/presence until a second seat, case ownership and published SLA exist; APP 12/13 workflow until Joel confirms APP applicability and the disclosure sources; marketplace charts until four weeks of real activity; two-person actions until a second `owner_admin` is provisioned.

## 8. Build plan

| Row · screen | Existing Convex backing | Absent gap | Acceptance assertion | Gate / Joel fact |
|---|---|---|---|---|
| **R-37 · Overview** | `security.readAdminIndexHealth` and `security.readAdminAuditEvents` exist, but index health is one synthetic Business row and Audit is latest-100 | `listAdminExceptions`; real health/worker failure readback; uncertain-Call/removal/source-review feeds | One viewport shows honest configuration state, exact search and oldest real exceptions; unavailable never renders as zero | `route-controller-size`, `copy-vocabulary`, `status-vocabulary` · **Joel:** alert thresholds |
| **R-38 · Search + shared list** | `capabilityCalls.readOwnerCallStatus`, `capabilityCallProjections.listOwnerCalls`, `capabilitySupply.readCapabilityPublication`, `moneyLedger.readPayoutAccountByStripeId` exist but are owner/service scoped | cross-account lookup read; joined Call/Workspace/Agent/Tool/Provider/Stripe search | Exact canonical ref opens one result; partial search is grouped; query persists in URL; non-admin denied | `route-controller-size`, `leaf-purity`, `tsx-type-quarantine` · **Joel:** searchable PII policy |
| **R-39 · Call object** | `capabilityCalls.readOwnerCallStatus`; internal `capabilityCalls.readPurchaseResolution`; existing buyer Call/receipt projections | admin-scoped joined Call → attempt/control → Quote → usage/x402 → receipt/obligation/resolution read | Outcome-unknown Call states whether money moved, disables unsafe retry, keeps ref visible, and reuses receipt evidence | `file-size-ratchet`, `leaf-purity`, `status-vocabulary` |
| **R-40 · Provider object** | `businesses.setBusinessSuppression`, `capabilitySupply.verifyCapabilitySourceAuthority`, `security.closeRemovalDispute`, `capabilitySupply.readCapabilityPublication` | joined admin Provider read; removal/source-review feed; fresh-fva enforcement; second-approval command | owner action cannot submit without reason/evidence/fresh fva; preview equals emitted audit; support/reviewer cannot invoke | `file-size-ratchet`, `copy-vocabulary`, `status-vocabulary` · **Joel:** which actions require second approval |
| **R-41 · Purchase resolutions** | `purchaseResolutionRecords` and internal `capabilityCalls.readPurchaseResolution` exist | admin open queue; immutable decision history; Purchase-resolution disposition/refund command; SLA | Open cases sort oldest first; evidence stays visible; decision is audited; money action stays disabled until its command and money rail are live | `route-controller-size`, `file-size-ratchet`, `status-vocabulary` · **Joel:** outcomes, refund authority, SLA |
| **R-42 · Audit** | `security.readAdminAuditEvents`; `security.grantAdminMembership` and `security.revokeAdminMembership` already emit guarded audit | pagination/search/export; admin-access UI; break-glass authority seam fix | Actor/action/target/time/reason/auth/correlation filters persist in URL; next page is stable; membership mutation appears only after a second seat is needed | `route-controller-size`, `copy-vocabulary`, `tsx-type-quarantine` · **Joel:** retention/export and alpha principal IDs |

Do not expose `use_break_glass` or kernel-incident controls until the authority mismatch is repaired. Keep raw rows, nonces, secrets, contract/binding internals and function execution in Convex Dashboard.

## 9. Open decisions for Joel

1. **Who is alpha admin?** Default: Joel's Clerk principal is the only `owner_admin`; provision no support/reviewer membership yet.
2. **Which actions need two people?** Default: suppression, refunds and commercial-policy change; keep them disabled until a distinct second owner exists.
3. **What are the Purchase-resolution outcomes and clocks?** Default: uphold, refuse and request evidence; display age without “late” until Joel publishes an SLA; refund waits for live money.
4. **Which identifiers may global search accept?** Default: exact canonical refs plus Provider/Tool names; defer email, Clerk and Stripe lookup until a PII-access policy exists.
5. **Do APP requests and incidents belong in alpha?** Default: no; un-defer APP workflow after legal applicability/source mapping, and incident publishing after choosing a hosted status vendor.
