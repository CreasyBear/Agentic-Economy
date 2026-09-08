# Package 7: trust and account lifecycle

Status: RECONCILED CANDIDATE — vocabulary source dependency accepted; Package 7 re-review and implementation approval remain
Date: 2026-09-05; dependency status reconciled 2026-09-08
Owner: Package 7 delivery task; Joel owns product direction
Audience: product, engineering and operations
Work record: [WF-20260905-package-7](../workflow/work/WF-20260905-package-7.md)
Authority: [PRODUCT](../../PRODUCT.md) and [Package 7 roadmap](../../IMPLEMENTATION_ROADMAP.md#7-trust-legal-and-data-governance--planned)

## Direction

Build the **complete pre-launch baseline** as familiar account management:
understand what AE offers, control access, get business records, resolve problems
and leave with money and data accounted for. AE aims for a mature Australian
equivalent of familiar Locus and Nevermined, with Whop supporting ordinary
account, billing, remedy and support patterns. Intuitiveness and enablement
precede uniqueness; the market opportunity is accepted. Adapt those mechanisms
to Australian business customers, AUD prepaid credit and service purchases.

Study whole journeys: setup, normal use, changes, interruption, failure, recovery
and offboarding. Default to official SDKs, native components and hosted commodity
systems. Depart only for an applicable Australian requirement, correctness or
safety need, or a demonstrated reference weakness; record the reason and customer
benefit. Existing internal machinery alone does not justify a novel concept or
bespoke workflow. The full reference platforms guide maturity; this package stays
within its complete 7A–7D trust and account-lifecycle scope.

Joel's direction for scoping: regulatory requirements are work the platform must
navigate as it develops. An unresolved decision needs an owner, a next step and
the specific action it affects. It must not become an automatic stop on all work.

The proposed customer experience is:

```text
Understand AE → manage Account and agent access → use and inspect records
    → download or correct information → resolve money and open Calls
    → close the Account → receive a record of closure and remaining obligations
```

These are proposed extensions to existing Settings, Calls, money, Connections
and public pages. The full package remains 7A privacy, 7B terms, 7C trust and
7D lifecycle; delivery proceeds in usable increments.

## Accepted vocabulary and remaining implementation approval

[CONTEXT](../../CONTEXT.md) defines the accepted Tool, Quote, Call and spending
policy language. The [vocabulary source closeout](../workflow/work/WF-20260905-vocabulary.md)
records the completed source cutover and its verification at `5f3131297` /
`d5fb0a220`. The [dated glossary proposal](../../research/VOCABULARY-PROPOSAL-20260905.md)
is historical evidence. The earlier “tool probably” discussion is superseded;
there is no remaining glossary-choice gate.

Package 7 still requires reconciliation of its proposed interfaces, exports,
retained-record selectors and recovery behavior against that accepted source,
focused review of affected portions, and its own implementation approval.
The vocabulary sprint does not approve new Package 7 schemas, vendor selection,
policy publication, deployment or retained-data migration. Its hosted, installed
commercial-execution and data/restore proof limits remain explicit.

Preserve login deletion, Account closure and Provider retirement as separate
actions. Keep funding separate from permission, payment separate from delivery,
and retained records separate from active access or content retention.
Read-only research and plan reconciliation may continue during this hold.
Regulatory decisions still have an owner, next step and specifically affected
action; the Package 7 approval boundary does not create a blanket regulatory halt.

| Task | Naming/migration dependency | Findings that remain valid unchanged |
|---|---|---|
| T1 | Account/identity/authority references, public request interfaces, route names and proposed lifecycle/privacy records | Restricted access, verified requests, revocation and audited decisions |
| T2 | Export schemas/column names, Call/quote/service references, retained record selection and historical identity mappings | Scoped downloads, exact money, bounded jobs, durable useful exit evidence |
| T3 | Account/agent/Provider commands, shared action-execution versus customer Call IDs, stored workflow/receipt references | Atomic freeze, safe recovery, late-event handling; login deletion is not Account closure or Provider retirement |
| T4 | Table/category inventory, record selectors, holds, erasure markers and restore/backfill boundaries across retained data | Active-data expiry, holds, downstream cleanup and restore suppression |
| T5 | Accepted product/policy terms, public and machine wording, acceptance schema and historical agreement references | Versioned acceptance, truthful disclosures, verified support; preserve previously accepted terms and their evidence |
| T6 | Migrated fixtures, generated interfaces, consumer contracts, retained-record continuity and the final deployment revision | Full-journey behavioral proof, review/fixes, relevant documentation and scoped closeout |

Reconcile this candidate with the accepted glossary/source and the remaining
retained-data and release boundaries. Perform focused engineering/design
re-review of changed contracts, exports, policies, authority and recovery paths;
reuse unaffected discovery. Then seek the single Package 7 direction approval
on that reconciled revision before T1–T6 begins.

### Package 6 handoff remains open

[Package 6 review](../reviews/package-6-review.md) and its
[implementation follow-up](../reviews/package-6-review-implementation.md) record local
transition fixes and focused proof, not whole-package closure. Package 6 is to
checkpoint its current bounded fix and hold final closeout. Carry forward its
unresolved native OAuth/resource and tool-auth integration, canonical-origin and
deployment readiness, installed-client/listing proof, authenticated Provider
journeys, support-delivery/accessibility proof and repository import-gate result.
These are carried evidence gaps, not freshly reproduced failures in this update.
Reconcile the latest Package 6 checkpoint before using its shared surfaces in
T1/T3/T5 or claiming the combined T6 journey. Existing Package 4/5 external gates
also remain; do not silently treat an upstream package as complete.

## What we take from the mature references

| Reference mechanism | Familiar AE experience | Australian/product adaptation |
|---|---|---|
| Whop permissions and required actions (WHOP-006); remedy cases with actions and history (WHOP-030) | See who has access, remove it, and follow a problem through to resolution | An agent's access and spending policy stay attached to the business; buyer remedies identify AE's Seller responsibility for supported resale |
| Locus own balance/ledger views (LOCUS-034), credential audit (033), scoped Agent Connections | Read credit, activity and access in the existing Account; download only records you may see | AUD credit and Charges; business, agent and Provider remain attributable without exposing private upstream economics |
| Locus retirement preserves financial history (LOCUS-023) | Closing access does not erase purchases or unresolved money | Separate Account closure, personal-data cleanup and retained business evidence; the Locus endpoint is specifically for test/integration end users, so its pattern informs rather than supplies AE's full live exit design |
| Nevermined Router ledger exports JSON/CSV and separates payment-leg states | Download useful records and see whether a payment or remedy is still in progress | Export AE's buyer-facing AUD records and linked Call outcomes; keep Provider obligations and corporate treasury separate |
| Nevermined research found product/terms drift at its research date | Plain terms describe the agent product people are actually using | Explain delegated spending, the buyer-facing Seller, data sent to Providers, refunds and exit; update terms with the corresponding product change |

Source records: [Whop maturity](../../research/WHOP-AE-MATURITY.md),
Whop findings (local benchmark record: `../../.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md`),
[Locus maturity](../../research/LOCUS-AE-MATURITY.md),
Locus findings (local benchmark record: `../../.planning/locus-docs/LOCUS-SCAVENGE-PAPERCUTS.md`),
Nevermined maturity (local benchmark record: `../../.planning/nevermined-docs/05-MATURITY-AND-OPPORTUNITIES.md`).
These are dated mechanism studies, not fresh vendor audits or integration choices.
Current AE source takes precedence over their historical parity assessments.
The mechanism summaries above remain usable if the local research corpora are
absent from another checkout. Original references include [Whop permissions](https://docs.whop.com/developer/guides/permissions),
[Whop remedy cases](https://docs.whop.com/api-reference/beta/resolution-center-cases/list-resolution-center-cases),
[Locus own ledger](https://docs.paywithlocus.com/api-reference/widget/own-ledger-end-user),
[Locus retirement](https://docs.paywithlocus.com/api-reference/end-users/retire-a-test-or-integration-end-user-without-deleting-financial-history)
and [Nevermined ledger export](https://nevermined.ai/docs/products/catalog/router/ledger).

## Reuse and buy decisions — latest direction

Joel asked to avoid hand-rolling and confirmed the existing support address is an ordinary
email inbox with no support system configured. Preserve the complete self-service
outcome while delegating commodity mechanics to the installed platforms.

| Capability | Configure/reuse/buy | AE still owns |
|---|---|---|
| Profile, sessions, authentication, step-up and identity deletion | Existing Clerk UserProfile and verified SDK/webhooks | Business Account ownership, authorisation and cross-system exit consequences; Clerk Organisations would duplicate the canonical Account model |
| Durable exit, export steps, retries, waiting and restart | Installed Convex Workflow/Workpool; native status, event and paginated step APIs | Exact admissions, what counts as closed, safe retry eligibility, stable business request and terminal receipt |
| Support forms, assignment, correspondence, customer history and notifications | Recommended hosted support inbox connected to the existing support address; Help Scout is the evaluated candidate | Verify who can request a business/data action, link the conversation to the AE request and carry out the domain action |
| Billing details, payment methods and existing invoices | Stripe Customer Portal where these objects actually exist; current Checkout/refund APIs | AUD prepaid credit, unused-credit disposition and linked Call remedies; subscription cancellation is not Account closure |
| Provider retirement and credential removal | Existing Provider offboarding and agent revocation commands | Compose them into Account closure and keep recovery authorised |
| Exports and evidence | Existing authorised queries, platform document downloads, Convex storage; native pagination | Caller-safe manifest, record selection/redaction, exact money, download authorisation and useful post-exit records |
| Policy publication and optional analytics | Versioned static content, current UI primitives, installed PostHog controls | Actual Australian commercial/data terms and preference enforcement; no legal-policy CMS or generic consent engine |
| Security logs, rate limiting and operation monitoring | Existing audit/Sentry and Convex rate-limiter components | Safe event vocabulary, scopes, due-action alerts and operational response |

The installed Workflow 0.4.6 source exposes `status`, `listSteps`, `sendEvent` and
`cleanup`; its journal already owns steps, arguments/results and progress. Remove
the bespoke `privacyRequestItems` queue/journal. Use native Workflow steps for
multi-stage exports/data requests and Workpool for independent bounded work.
Retain a compact request row for authorisation, business status and outcome; it
must survive native execution-log cleanup. Steps carry refs and bounded summaries,
not raw export payloads. Include component journals in the retention inventory.

Replace the proposed custom `/admin/privacy-requests` inbox with a hosted support
inbox and a narrowly authorised AE case-action screen. Conversation assignment,
threads, response reminders and customer correspondence belong to the inbox.
AE stores an external conversation reference and verified action/result evidence,
not a second copy of the support system. Support email is not authority to export
or delete; operators still use the authenticated AE action after verification.
Do not expose all company conversations to a contact by default.

Help Scout documents forms/inbox history and an authenticated customer portal;
these are evaluated capabilities, not installed AE features. Confirm its selected
plan, authentication/visibility and data-processing terms before adoption. An
ordinary inbox can continue during setup with a named owner and recorded replies;
the required response/verification journey still needs a launch rehearsal. No
custom helpdesk is the fallback. Hosted support selection is the one new-service
choice in this proposal; all other orchestration/database capability is installed.
[Help Scout contact forms](https://docs.helpscout.com/article/1233-manage-beacon-contact-settings),
[customer portal](https://docs.helpscout.com/article/1777-set-up-and-manage-customer-portal),
[secure history](https://docs.helpscout.com/article/1229-support-history-security-options),
[Stripe portal scope](https://docs.stripe.com/customer-management),
[Convex Workflow](https://www.convex.dev/components/workflow).

The remaining custom work is the product: Account-scoped access, purchase
resolution, authorised export/redaction, versioned business acceptance and actual
retention/hold decisions. Native tools reduce mechanics; they do not establish
those AE-specific facts automatically. Table counts below are provisional data
records, not a target for reducing scope.

## Inverse premortem: what must be true in a mature product?

Assume a business has used AE for a year, changes staff, disputes a Call and
eventually leaves. The baseline succeeds only if all of these remain true:

| ID | Mature expectation | Required build / failure we prevent |
|---|---|---|
| P7-01 | I know which business I am acting for and can remove access | Visible owner/member/agent context; current authority checks; revocation readback. A removed employee or old credential cannot continue spending |
| P7-02 | I can get usable business records | Authorised CSV/JSON plus available document files and accepted-term snapshots; opening/closing credit, top-ups, fees, Charges and adjustments reconcile. Links alone cannot strand evidence after exit |
| P7-03 | I can exercise privacy rights without an active login | Verified individual/representative request, acknowledgment, status, reasoned decision, correction and escalation; no public GitHub ticket containing personal data |
| P7-04 | My content is not kept forever because a receipt is retained | Routine per-category expiry for active Accounts too; separate inputs/outputs, logs and analytics from required purchase evidence |
| P7-05 | My business accepted the terms that actually governed its purchases | Initial/versioned acceptance, notice of material changes, owner reacceptance, refusal/exit path; old quotes preserve old terms |
| P7-06 | Leaving stops new work without losing old work or money | Transactional freeze, linked Provider retirement, exact financial recovery, durable status and closure receipt |
| P7-07 | A late payment, refund or correction still reaches my records | Continue accepting authentic observations for previously created work; append a closure-receipt amendment; never reopen spending |
| P7-08 | Suspension is understandable and contestable | Reason where disclosable, scope, review route and restore conditions; restricted access to records/remedies survives suspension |
| P7-09 | Provider data promises mean something operationally | Admission-bound data use, locations, retention and cooperation terms; changed conditions require a new service revision and quote |
| P7-10 | Help reaches someone who can resolve the matter | Small accountable privacy/lifecycle queue, response target, escalation and delivery evidence; synthetic incident/complaint drill |
| P7-11 | My deleted data does not reappear after recovery | Minimal erasure markers, processor evidence, independent recovery copy and tested restore procedure |
| P7-12 | The experience works with real auth, retries and assistive technology | Native Clerk sandbox, real backend jobs, money sandbox, keyboard/mobile checks; no local-preview-only completion |

Independent CEO challenge found eight omissions in the earlier candidate:
request completion, ordinary data expiry, terms changes, involuntary suspension,
late arrivals/lost owners, durable export evidence, Provider data obligations and
incident response. They are addressed in the contracts below, not deferred out
of the complete baseline. General support/status/notifications remain Package 8.

## Surface and interaction contract

Keep the present primary navigation: Calls, Agents, Credit, Operations, Account.
Add local Account navigation rather than a second top-level compliance dashboard.
Proposed URL/file names below are implementation targets, not existing routes.

| Surface | Extension and key interactions |
|---|---|
| `/owner/settings` | Retain Clerk profile/sessions and security history. Add business identity/role, links to Agents and Provider Connections, Data & records and Account lifecycle. Explicitly label personal-login versus business actions |
| `/owner/settings/data` (new) | Choose business export or personal-information request; show scope and format; submit once; see generation progress, available files, expiry, correction/complaint history and retained-data explanation |
| `/owner/settings/lifecycle` (new) | Preview closure or leave membership. Show credit, open Calls, Provider roles and consequences; confirm with fresh owner proof; return stable request reference. Preview can be abandoned without effects |
| `/account/requests/:requestRef` (new) | Restricted request/status/receipt surface outside `_operator`, so suspension does not cause a sign-in loop. Show completed steps, one current next action, review/complaint path and receipt amendments |
| `/activity`, `/owner/credit` | Add contextual export/request links using their existing filters and exact readbacks. Show unresolved money and late adjustments. Account-wide export remains in Data & records; no second ledger |
| `/agent-access`, `/owner/offerings` | Link closure impact to existing agent revocation and Provider offboarding status. Keep access, authority and Provider connection distinct |
| `/privacy/requests` (new), `/support` | Private request entry for access/correction/deletion/complaint and authorised representatives. Initial submission discloses no Account existence. Signed-out verification and correspondence are completed through the verified private support channel |
| `/terms`, `/privacy`, `/trust` (new trust route) | Readable summary followed by complete versioned text, effective date and historical versions. Link the relevant request action at the point where the policy explains it |
| Hosted support inbox + restricted AE case action | Inbox owns assignment, correspondence, reminders and customer history. A deep-linked AE request shows only verified action, authorisation, current result and permitted fulfil/correct/refuse/hold controls; use existing admin admission/audit |

`owner.settings.tsx` currently renders AccountSettingsSection for every path
classified as Account; adjust that exact-match/Outlet decision for new children.
Preserve legacy settings redirect routes. Reuse AeOperatorShell/AeSection,
existing Table, Alert, Dialog, Button and form primitives. Use DESIGN.md's
Host Grotesk, mono amounts, white/neutral surfaces, near-square shape and
violet-blue focus; no new palette, dashboard card grid or UI kit.

```text
Account & security
  ├─ Profile / sessions (Clerk)       ├─ Agents (existing)
  ├─ Data & records → request → status → download / decision / appeal
  └─ Account lifecycle → preview → confirm → restricted status → receipt
Public Privacy / Help → verified request ────────────────────────┘
Hosted support inbox → verified AE case action → source readback → request status
```

| Interaction | Loading / empty | Error / partial | Success and navigation |
|---|---|---|---|
| Export | Keep scope visible; “Preparing your records”; no prior requests offers one Create export action | Failed category identified, retry same request; partial export explicitly lists omissions; no download before access check | Files, cutoff, expiry and manifest; expired files offer Regenerate; navigating away does not cancel generation |
| Closure | Preview lists each dependency as checking, empty or current; unknown balance is never displayed as zero | Stale preview requests refresh; lost submit response retrieves same case; after freeze cancellation is unavailable with explanation | “New activity stopped”, progress and next action; finish with receipt, not a celebratory animation |
| Privacy/complaint | Explain required identity evidence and avoid soliciting secrets; receipt after durable submission | Validation focuses the field; unavailable submission retains form; refusal includes reason and review route | Status, response target, correspondence and decision; appeal links to original case |
| Changed terms | Summary of changes, effective date and full text | Reacceptance affects new covered purchases/publication only; records, refund/recovery and exit remain accessible | Owner acceptance receipt or decline/leave; no automatic acceptance by an agent |
| Suspension | Visible restriction, affected capabilities and review contact | Sensitive reason may be withheld with a safe explanation; identity verification can continue privately | Restoration is explicit and never resurrects revoked credentials or deleted supply |

At 375px, use one column, labelled row summaries and full-width consequential
actions; keep the next action visible without horizontal table scrolling. At
tablet/desktop, retain persistent navigation and aligned amounts. Use 44px touch
targets, visible focus, heading/landmark order, text status plus colour, focus
return after dialogs, `aria-live=polite` for status changes, and reduced motion.
Show one primary action per state. Reauthentication returns to the same preview;
it does not silently resubmit. No percentages for work with an unknown duration.

## Backend and authority contract

### Ownership and dependencies

Keep lifecycle decisions in `src/modules/principal-account/account/lifecycle/`
and rights/data-handling decisions in `src/modules/security/privacy/`. These are
proposed subfolders of existing owners. Thin Convex adapters coordinate public
domain operations; the Account domain must not import money or Provider internals.
Use ports supplied by the coordinator and update the existing module-boundary
manifest only for actual new public entry surfaces.

```text
Browser / server functions / versioned machine reads
    → authenticated Convex adapters
        → Account lifecycle decisions / privacy decisions
        → existing Account, authority, money, Call and Provider public owners
        → Workflow (cross-system exit) / Workpool (bounded data jobs)
        → provider APIs, protected storage, existing audit events
```

Clerk remains identity owner; Convex 1.45.0, Workflow 0.4.6 and Workpool 0.4.10
are already installed. No new orchestration framework/database is proposed. A hosted support inbox is
the proposed service addition described above. Reuse the
signed service-auth transport, consequential owner proof and rate limiter.

### Commands and permissions

Proposed adapter exports, each with explicit validators/returns:

| Adapter and commands | Caller and effects |
|---|---|
| `convex/accountLifecycle.ts`: `previewClosure`, `requestClosure`, `readCase`, `cancelBeforeFreeze`, `requestMembershipExit` | Authenticated current owner for Account closure; member for their own membership exit. Preview/read do not mutate money. Request binds exact account/ownership revision, preview digest, idempotency key and fresh proof |
| `convex/accountLifecycleWorkflow.ts` | Internal-only freeze/drain/revoke/close orchestration. Stores existing child operation references, awaits completion/readback and reconciles uncertain effects before retry |
| `convex/privacyRequests.ts`: `createRequest`, `readRequest`, `listOwnRequests`, `submitVerification`, `recordDecision`, `requestReview` | Subject or authorised business owner for their scope; signed-out intake is service-verified and initially unverified; external conversation refs link correspondence without copying it; operator decisions require explicit privacy permission and audit |
| `convex/privacyExports.ts`: `startExport`, bounded worker and `downloadPart` | Current export grant checked both at generation and each download; document/term snapshots accompany records where available |
| `convex/privacyRetention.ts`: due-item/hold/erasure processing | Internal workers; restricted operator hold/release with reason, scope, review date and evidence. A policy boolean cannot serve as an actual hold record |
| `convex/platformTerms.ts`: `readRequiredTerms`, `acceptTerms`, `readAcceptance` | Human with current authority for the Account or Provider agreement. Immutable version/digest, effective time and acceptance context; affected consequence reads current requirement |

Add the existing action-contract projection for lifecycle/terms restrictions to
HTTP/MCP/CLI responses: stable case/reason, at most one machine continuation and
one owner handoff. Agents can read their permitted status; owner-only acceptance,
Account deletion and full business export do not become agent powers. This work
does not introduce another CLI binary or installation flow.

**Restricted access is a separate, narrow admission path.** Current
`convex/interactiveAuthority.ts:694` rejects `account.lifecycle !== 'active'`;
the normal `_operator` layout relies on Account admission. Do not relax that
shared check globally. The new request route checks authenticated issuer/subject,
canonical identity binding and the request's explicit access grant. For a
suspended Account, the current owner may read status/records and resolve old work.
After closure, the initiating owner gets a narrow exit-archive grant with expiry
and revocation. It serves only the immutable archive prepared before closure,
the closure receipt and authorised amendments for that same prior activity;
it never authorises general Account queries or fresh Account-wide exports.
Bind the grant to the canonical person, request and permitted artifact refs.
An ordinary business export still requires current authority. A removed member cannot use a cached
link or a previous request grant to regain business records.

The current interactive resolver expects one access fact. Lifecycle processing
must enumerate all bindings in bounded pages for personal deletion; it must not
silently pick one when multiple exist. A general multi-business switcher is not
introduced here. A last owner leaving must either complete closure or use the
existing ownership-transfer/recovery rules; `no_transfer` remains meaningful.

If a Clerk identity disappears first: invalidate that identity's bindings and
credentials; freeze affected sole-owner Account activity; preserve other owners
and unrelated Accounts; open an operator recovery case. Recover only through the
existing authorised recovery/ownership path with verified evidence. If that
cannot establish a successor, keep commercial resolution and private assistance
open without inventing ownership. Same email on a new login is not proof. Before AE-initiated personal-login
deletion, deliver the closure receipt and offer the prepared exit archive through
the verified channel; a failed required delivery keeps that deletion step pending.
Deleting the identity revokes its archive grant. Subsequent retained-record or
amendment requests use verified assistance and authorise only the requested
records, never a restored business session. External Clerk deletion instead
starts the loss-of-identity recovery path above.

### Lifecycle state and financial boundaries

```text
preview (read only)
   → requested ──cancel before freeze──→ cancelled
   → frozen → resolving → closing → closed
                 ↕
             action_required

Account: active → suspended → closed   (existing lifecycle)
Case can remain in resolution; Account is not falsely marked closed.
Later valid financial observation → retained record + receipt amendment
                                  (no transition back to active)
```

Creating one live case is transactional by Account; identical requests replay,
changed arguments under one key conflict. Freeze updates the Account and case
revision atomically. Every new consequential admission must observe that fence
in its committing transaction, including invocation/reservation, credentials and
Mandates, funding-session creation and Provider publication/connection changes.
Existing accepted work uses internal recovery authority; queued unaccepted work
cannot slip through using an old cached owner session.

Current canonical agent authority and several billing/Provider checks already
require active Accounts. The acceptance test must cover all entrances, rather
than assuming those checks compose correctly. Provider routeability additionally
uses its existing offboarding freeze. Begin each affected Provider child under
the closure admission before ordinary owner writes become inaccessible; subsequent
steps run internally and reference that admission. Close only after the selected
credit disposition, known Calls and Provider obligations meet their exit rules.

Use the AccountRegistry transition contract through a Convex store adapter; no
existing production AccountRegistry adapter was found in the inspected Convex
code. Implement `convex/lib/accountRegistryPersistence.ts` against the existing
transaction interface rather than duplicating its transition/ownership rules.

Cancel only before transactional freeze wins. After freeze, any restoration is
a separate verified action; it does not re-enable revoked credentials. Operator
suspension uses the same existing recovery/consequence machinery with scoped
reason, notice and review; no new fraud/risk engine.

Funding sessions created before freeze may complete afterwards. Expire/cancel
them where the rail permits, but keep the durable incoming payment observation
path alive. Reconcile authentic late money once to the liability/refund record;
do not lose it because customer actions are disabled. Later chargebacks, refunds
and corrected documents amend history and notify through the verified contact.
They do not create a new funded/spendable Account. Do not copy amounts into a
second authoritative ledger or automatically retry an uncertain refund.

### Data handling and export mechanics

AE data-action requests have `received → verifying → queued → working → completed`,
with `waiting_customer`, `waiting_external`, `refused` and `cancelled` branches.
Every accepted submission has a durable reference, assignment, next-action date,
status and recorded delivery outcome. Completion includes a reasoned decision;
complaints/reviews live in the hosted inbox and link any resulting AE action.
Response targets are operating-policy fields, not
an invented universal legal deadline. Representatives have subject-specific
verification; authenticated business ownership is not blanket access to other
people's personal information.

Inventory active data as categories: identity/contact; membership/authority;
commercial records/documents; inputs/outputs; operational logs/security evidence;
analytics; support submissions; generated exports. For each, record purpose,
source owner, recipients, permitted use, retention trigger, deletion/restriction
and downstream assistance. Inspect actual stored payloads: Invocation schema
contains `inputJson` and completed result `output`, so hashes alone are not the
complete inventory. Check share/projection caches and logs before claiming erasure.

Export is a manifest plus bounded CSV/JSON parts and available document files,
not one unbounded ZIP in memory. Proposed limits: 100 rows or 2MiB per work batch,
parts capped at 2MiB, one in-flight export per scope, seven-day artifact expiry.
These are operational defaults to prove and tune, not statutory periods.
Use a fixed request cutoff and per-source watermark; immutable financial/event
records filter to it. Mutable profiles are captured once, with captured-at time;
the manifest explicitly describes source capture times rather than falsely
claiming an atomic cross-system snapshot. Append-only later corrections belong
to the next export or receipt amendment. A category is completed, empty, omitted
with reason, or failed; never silently drop it.

Serve bytes through an authenticated HTTP action/adapter with an opaque part
reference, current permission/expiry check and `Cache-Control: private, no-store`.
Do not expose `storage.getUrl()` as an expiring private link: Convex documents
that its file URLs allow unauthenticated reuse. Native HTTP actions have a 20MB
response limit, so the proposed 2MiB parts fit without a new object-store service.
Sanitise spreadsheet-formula prefixes in CSV, preserve exact AUD decimal strings,
and exclude credentials, raw private Provider economics and other subjects.
[Convex file-serving contract](https://docs.convex.dev/file-storage/serve-files).

Scheduled category expiry runs independently of Account closure. Hold checks are
transactional with deletion admission and scoped by subject/record/category.
Unresolved work can retain the minimum required recovery evidence under its rule;
it is not a reason to retain every raw payload. Record correction provenance and
applicable recipient follow-up. Releasing a hold reschedules eligible cleanup.

Erasure marks are minimal pseudonymous suppression records, with scope, policy,
completed time and external outcome refs. Mirror them to the existing protected
operational evidence/recovery store independently of a Convex backup before
declaring restore-safe cleanup complete. The exact existing destination and
permissions must be resolved in the retention slice; if none is suitable, propose
the bounded storage change then. Restore stays isolated until the newest markers
are reapplied and the independent marker source is reconciled. Git and public
exports are never the destination for subject erasure markers.

### Terms, notices and data preferences

Versioned legal text lives in reviewed repository content, rendered to pages and
hashed into acceptance records. No policy CMS or generic approval engine. Add
human Account acceptance before its first covered commercial action and Provider
agreement acceptance before covered publication. Use the exact current owner
authority, not a checkbox stored only in Clerk metadata.

For material changes: publish version/change summary/effective date, deliver
notice, request authorised reacceptance, and gate only the covered new action
after the effective date. A declined revision preserves old purchase recovery,
export and exit. Do not infer historical acceptance during backfill. Distinguish
privacy notice delivery from consent to optional analytics or marketing.

Use the installed PostHog SDK preference APIs after verifying their exact current
behaviour, rather than a separate consent store/engine.
PostHog currently initialises with sessionStorage and session recording disabled;
that is not itself a preference control. Provide an optional analytics switch,
honour it before capture, and keep request/closure/export routes out of analytics
payloads and URLs. Store the browser choice locally; materialise an Account
preference only if cross-device behaviour is included. Essential security and
transaction evidence remain governed by their stated purpose.

## Schema and database changes

Use the existing Convex database and module schema composition. Six proposed new
tables below have distinct persistent jobs; Workflow owns its execution log,
and the existing audit table owns event history. No parallel money/identity tables.
All refs are validated canonical strings (or native typed Convex IDs where used),
timestamps milliseconds, revisions safe integers. Validators use discriminated
unions; missing/ambiguous ownership refuses before effects.

| Table / owner | Core fields | Required access indexes |
|---|---|---|
| `accountLifecycleCases` / Account | caseRef, accountRef, kind, requesterPrincipalRef, ownershipRef/revision, accountRevision, phase, version, commandDigest, idempotencyRef, requestedAt, frozenAt?, workflowId?, nextActionAt?, reason/disclosure, exitArchiveGrant/expiry/revocation, closureReceiptRef? | `by_caseRef`; `by_accountRef_and_phase`; `by_requesterPrincipalRef_and_idempotencyRef`; `by_phase_and_nextActionAt` |
| `privacyRequests` / security privacy | requestRef, kind (business_export/access/correction/deletion); externalConversationRef; workflowId; verifiedDecisionRef, scope union (Account or individual), requester/representative binding, verification status/ref, state, dueAt, cutoff?, policyVersion, idempotency/digest, outcome?, deliveryState, parentRequestRef? | `by_requestRef`; `by_requesterPrincipalRef_and_createdAt`; `by_accountRef_and_createdAt` for Account scope; `by_state_and_dueAt`; `by_requesterPrincipalRef_and_idempotencyRef` |
| `privacyExportParts` / security privacy | requestRef, partRef, category, sequence, storageId, mediaType, byteCount, rowCount, checksum, capturedAt, expiresAt, state | `by_requestRef_and_sequence`; `by_partRef`; `by_state_and_expiresAt` |
| `privacyHolds` / security privacy | holdRef, subjectScope, category/record selector, reason, authorityEvidenceRef, createdBy, state, reviewAt, releasedAt? | `by_holdRef`; `by_subjectKey_and_state`; `by_state_and_reviewAt` |
| `privacyErasureMarkers` / security privacy | markerRef, pseudonymousSubjectKey, scope/category, policyVersion, completedAt, externalResultRef?, recoveryMirrorState/ref | `by_markerRef`; `by_pseudonymousSubjectKey_and_completedAt`; `by_recoveryMirrorState_and_completedAt` |
| `platformTermsAcceptances` / security | acceptanceRef, accountRef, actorPrincipalRef, ownershipRevision, agreementKind, version/digest, acceptedAt, authorityEvidenceRef, idempotency/digest | `by_accountRef_and_agreementKind_and_version`; `by_acceptanceRef`; `by_actorPrincipalRef_and_idempotencyRef` |

Every named index field must actually exist on its validator; materialise
`subjectKey`, `createdAt`, and Account-scope `accountRef` alongside the scope union.
Unverified requests use an opaque intake identity in place of a canonical principal
until verification; bind that identity server-side, never from a client assertion.
Limit free text and evidence counts; store growing items/events in rows, not arrays.
Use internal request digest plus indexed query/insert in one mutation to enforce
idempotency and the one-live-case rule; indexes alone are not uniqueness constraints.

Extend existing account ownership/membership and credential lifecycle via their
owners. Add a parent case reference/index to Provider offboarding only for its
real Account-closure caller. Extend the versioned `privacy_retention` policy with
category rules while preserving the existing evidence setting for its current
consumers; the new rules become the single owner for migrated categories.
Materialise due-expiry fields/indexes on relevant high-volume source tables as
each category is adopted. Do not scan every table on every cron tick.

Roll out additively: tables/optional fields → bounded backfills and staged indexes
on existing large tables → new readers → protected commands → workers → surface
activation. Existing acceptance is marked unknown, never fabricated. Verify old
readers/new writes during rollout. Rollback disables new requests and destructive
workers while keeping frozen-state enforcement, incoming observations and case
readback alive. Never roll back by deleting cases or reactivating Accounts.

## Policies and operating documents to write

Write plain product-aligned drafts alongside implementation. Use reviewed
`src/content/legal/` versioned content for published text and existing
`docs/operations/` for internal runbooks; these are proposed locations. Add only
targeted Git visibility when creating a currently ignored durable document.
Do not publish generated placeholder entity names, contacts or approval claims.

| Document | Required contents and where it appears |
|---|---|
| Platform terms + acceptable-use section | Contracting entity, Business/Agent authority, permitted Operations, Seller/Provider roles, prices, responsibility, suspension/termination/review, liability and preserved applicable statutory rights; `/terms` and acceptance flow |
| Payments, refunds and Account closure schedule (terms annex) | AUD credit and fees, reservations, failed/uncertain Calls, remedies/disputes, unused credit, late payments, closure and records access; link from Credit and exit preview |
| Provider agreement + data-handling schedule | Admission/publication obligations, performance/data use, permitted reuse, recipients/locations, retention, incident and correction/deletion cooperation, payments/remedies and offboarding; Provider acceptance/publication |
| Privacy policy + short collection notices | Categories/purposes, person versus business records, service disclosure, analytics, recipients/overseas handling, retention, access/correction/deletion requests and complaints; `/privacy` plus forms/inspection where data is collected or released |
| Trust facts, subprocessors and vulnerability reporting | Verified security practices and environment, processors versus independently acting Providers, meaning of verification, report channel/handling; `/trust`, privacy links and Help. Facts page, not certification claim |
| Data handling/retention/holds runbook and schedule | Actual store/category inventory, minimise/delete/restrict rules, holds/release, external cleanup, export expiry, backup suppression/recovery; engineering + operator reference |
| Privacy requests and complaints runbook | Verification/representatives, assignment, response targets, corrections/refusals, delivery, escalation/review and closure evidence; support inbox and AE action instructions |
| Incident and data-breach response runbook | Triage, contain, establish affected parties, preserve minimum evidence, assess applicable notification, communicate, remedy and rehearse; integrate existing recovery owners |
| Account exit and residual money runbook | Freeze, Provider/Call drain, credit/refund decisions, late observations, last-owner loss, restricted access, amendments, operational recovery |
| Terms-change/publication procedure | Version/digest ownership, review, notice/effective date, acceptance thresholds, historical availability and claim freshness; maintained with affected release |

The acceptable-use and payment schedules can remain sections/annexes rather than
independent policy sites. A standalone customer DPA is needed only if the actual
processing relationship/contracts call for it; establish that through the same
data-role analysis, rather than copying a vendor's generic DPA. Required Provider
data obligations are in scope now.

Australian design inputs: [OAIC policy content](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-1-app-1-open-and-transparent-management-of-personal-information),
[access/correction and complaints](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-13-app-13-correction-of-personal-information),
[cross-border disclosure](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information),
[breach preparation](https://www.oaic.gov.au/privacy/notifiable-data-breaches/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response),
[ACCC remedies](https://www.accc.gov.au/consumers/problem-with-a-product-or-service-you-bought/repair-replace-refund-cancel)
and [contracts](https://www.accc.gov.au/business/selling-products-and-services/contracts).
Draft against these actual relationships; do not impose blanket “no refunds”,
erase statutory rights, or assume business customers remove all consumer-law
questions. Final operating facts affect the relevant publication/action, not all
engineering work. Evidence checked 2026-09-05; not a legal approval receipt.

## Keep decisions moving

Track each unresolved decision in the existing work/backlog system with an owner,
next step, affected capability and evidence needed. The rows below are initial
assignments by role, not claims that an external adviser has accepted work.

| Decision/work | Owner and next step | Work that proceeds / specific dependent action |
|---|---|---|
| Credit remaining at exit | Money owner with Joel: confirm existing refund/disposition rules and rails | Build preview, freeze, readback and recovery; automatic credit disposition waits for that rule |
| Retention by category and holds | Joel with relevant adviser; engineering maps actual stores and existing policy controls | Build export and cleanup mechanics with test policies; activate customer-data erasure after the applicable rule is established |
| Entity, terms, processors and destinations | Joel owns operating facts; engineering traces deployed services and purchase boundaries | Build versioned pages/acceptance and verified disclosures; final affected terms or claims await the missing facts |
| Shared ownership and externally deleted identity | Engineering: trace existing membership, consequence checks and Clerk settings/events | Build Account-scoped journeys; dependent identity-removal action waits for safe ownership/recovery handling |

Use existing release controls at their real consequence boundaries. An unresolved
row is not a universal “platform unavailable” state. After the shared vocabulary dependency and Package 7 direction approval, each
slice can be built, tested and demonstrated while its specific production
action is being resolved.
Package completion still requires the complete baseline, including operable
request handling and the required publication/launch decisions.


## Implementation tasks and proof

| Task | Owned change areas | Acceptance / dependencies |
|---|---|---|
| T1 — lifecycle and request foundations | New Account lifecycle subfolder and Convex adapters; privacy tables/commands; existing consequence/public entry exports; request route outside `_operator` | P7-01/03/08. Prove restricted reads cannot become general owner access; signed-out intake/verification and operator decisions work. Establish request identifiers before other tasks |
| T2 — records and personal-data service | Privacy workers/storage/download, Settings Data route/components, current authorised Call/money/document read models | P7-02/03/04. Manifest reconciles credit, includes available evidence, and survives logout; bounded/empty/partial/expired/cross-scope cases. Depends T1 |
| T3 — Account and identity lifecycle | Registry persistence adapter, Workflow, money/Call/Provider composition, Clerk webhook projection/consumer, lifecycle UI | P7-06/07/08. Transactional admission matrix, cancellation race, restart, late paid funding, Provider drain, owner loss and signed receipt. Depends T1; uses T2 for exit evidence |
| T4 — retention and external data obligations | Category policies, due indexes/bounded workers, holds/markers, active payload owners, recovery runbook and Provider admission terms | P7-04/09/11. Active Account expiry, hold races/release, processor failure, restore suppression; existing storage suitability verified before activation. Depends T1/T2; coordinate touched source owners |
| T5 — policies, acceptance, trust and requests UX | Versioned legal content, terms adapter/table, Account/Provider acceptance boundaries, public pages, Help/hosted inbox links, analytics preference/suppression | P7-03/05/09/10. Initial/change/refusal flows, accessible forms, verified contacts, truthful claims. Read-only policy/source reconciliation may continue during the hold; drafting/build begins after direction approval; final activation uses relevant operating inputs |
| T6 — whole-journey evaluation and closeout | Existing test suites plus specific lifecycle/privacy tests; relevant guides/runbooks/registers; scoped review/fixes/commits | All P7 criteria. Real Clerk/Convex and financial sandbox, authorised exit archive after Account closure and verified assistance after identity deletion, synthetic incident/complaint and restore exercise; record revision/environment/results |

This is a substantial cross-domain package (L), delivered as these bounded slices;
no invented time/speed multiplier. More than eight files is justified by real
existing ownership and distinct surfaces. Do not reduce the mature baseline to
fit a file-count rule or build a universal workflow engine to hide that count.
T2 and T5 can progress after T1 contracts; T3/T4 share source/authority areas and
should be sequenced or assigned nonoverlapping ownership. No parallel agents or
worktrees are required for implementation by this plan.

Tests extend existing Account registry, Clerk webhook, settings security-history
and Provider offboarding suites. Add focused behavioral suites under
`tests/unit/principal-account/account/`, `tests/unit/security/`,
`tests/integration/`, and authenticated `tests/e2e/authenticated/` only for new
behaviors. Use Convex-test and the existing Workflow/Workpool test harness.
No private-call mocks or test-per-internal-function requirement.

| Proof group | Happy, boundary and failure cases |
|---|---|
| Authority and restricted surfaces | Fresh owner versus member/agent/wrong Account; stale proof/revision; suspended status; revoked former-member download; same-email replacement identity rejected |
| Data requests/exports | Individual, representative, business scope; zero and large records; duplicate and lost response; permission removal mid-job; category failure; CSV injection; expiry; unauthenticated part retrieval denied |
| Lifecycle | Clean and Provider Accounts; new invocation/funding/publication racing freeze; cancel before/after fence; restart midway; pending refund; late funding webhook applied once; no authority resurrection |
| Terms/Provider changes | First acceptance, changed version, future effective date, old quote, decline, machine owner handoff; changed Provider data destination requires new revision |
| Retention/recovery | Ordinary expiry, unresolved Call evidence, hold race/release, external timeout, post-delete event replay, independent erasure-marker restore and suppressed content stays absent |
| Operator/public/UI | Verify→assign→respond→appeal; undelivered reply visible; synthetic incident triaged; 375/768/1440 layouts, keyboard/focus, no sensitive analytics, actual contact delivery |

Implementation checks: `npm test -- <owned test files> --no-file-parallelism`,
`npm run typecheck`, relevant existing import/schema/UI-contract checks and
`npm run test:e2e:authenticated -- <new Package 7 spec>`. Use explicit file lists
at each slice; the final journey binds all slices on one deployed sandbox revision.
Native Clerk event delivery, hosted support operation, processor cleanup and restore need named environment
receipts; fixture/unit passes do not substitute. No app-wide test suite during
this planning turn and no production deletion or deployment is authorised here.

Operate with bounded metrics: oldest due AE action, stuck work,
unverified external cleanup, expired artifact backlog, undelivered decisions and
unmirrored erasure markers. Log only stable refs/reasons; reuse existing Sentry
and audit machinery. Scale first through indexed due queues and bounded pages;
do not poll every Account or load all Provider children in a document.

## Scope, risks and review disposition

**Approach confirmed by Joel:** mature self-service. Alternative operator-only
handling is smaller but misses that outcome; a separate governance SaaS adds
another authority/integration and has no established need. Keep native identity,
financial rails and job primitives; AE implements their commercial composition.

**Not in scope:** new wallet/ledger; general multi-business navigation; whole
helpdesk or public status platform (Package 8); certifications; global data
sovereignty expansion; speculative DPA/regulatory modules; broad folder cleanup;
rebuilding mature controls in Package 3/4/5. Necessary caller/schema/boundary
extensions above are part of Package 7, not deferred debt.

CEO HOLD review covers architecture, failure/recovery, security, data/interaction
edges, code ownership, tests, performance, observability, rollout, long-term
maintenance and UX. Engineering review covers architecture, code quality, tests
and performance. Design review covers hierarchy, all interaction states, journey,
visual restraint, DESIGN.md alignment, responsive/accessibility and unresolved
choices. The draft fixes source-backed design issues; it does not label the
unimplemented package or its runtime safe.

Known operating decisions carried into implementation: actual entity/contacts,
unused-credit rule, category retention/holds, independent recovery destination,
terms/effective dates and Provider data commitments. Each has a concrete dependent
action in the decision table; no single global policy-complete flag. These do not
independently prevent architectural progress; the Package 7 contract re-review
and implementation approval above remain outstanding.


## Review evidence and remaining limits

The following reviews, sketch checks and 47-test result are dated 2026-09-05
evidence from before this reconciliation. Reviewed candidate SHA-256:
`31f4298fec25aad8e2ebac4f10c0901eca57e96e7558380653e5a1d5ffe9a3aa`.
Its native snapshot is retained unchanged. The tests ran on the recorded dirty
source revision, not on this revised plan or a migrated implementation. No tests,
live checks or native plan reviews were rerun for this documentation update.

- CEO inverse-premortem/spec challenge: three rounds; eight baseline omissions
  and two archive/delivery clarifications addressed; final independent PASS, 9/10.
- Engineering: source-backed authority fence/restricted access, native component
  reuse, scoped exports, domain records, rollback, bounded workload and acceptance
  matrix reviewed. Native implementation sections were read from the shared
  gstack source when the Codex copy's section reference was absent.
- Design: all seven passes completed against DESIGN.md and the interaction-state
  contract. Initial design completeness 5/10; reviewed plan 8/10. The gstack design
  binary was absent; used its HTML-wireframe fallback. This is an interaction
  sketch, not approved production styling or proof of real authentication.
- Sketch: `~/.gstack/projects/CreasyBear-Agentic-Economy/designs/package-7-20260905/self-service.html`.
  Exercised export/navigation persistence, closure preview cancellation and
  confirmation, status/completion and terms acknowledgment. No console errors;
  at 375px the document width remained 375px. Desktop closure visually inspected
  in the Codex browser. No exhaustive accessibility or native-auth proof claimed.
- Foundation verification: `npm test -- tests/unit/principal-account/account/account-registry.test.ts tests/unit/server/clerk-security-webhook.test.ts tests/unit/settings/account-security-history.test.tsx --no-file-parallelism`
  passed 3 files / 47 tests on 2026-09-05, starting HEAD `91a4fff6f`, dirty shared
  workspace. An initial direct wrapper call could not locate Vitest; using the
  repository npm entry point resolved it. New Package 7 acceptance remains unrun.
- Reviews target this plan, not the shared branch's unrelated application changes.
  Existing direction/scoping answers were reused; per-section proposals are
  consolidated into the single final approval agreed with Joel.

## GSTACK REVIEW REPORT — dated pre-reconciliation evidence

| Review | Runs | Status | Findings / remaining |
|---|---|---|---|
| CEO `plan-ceo-review` | 1 review / 3 spec rounds | Ready for direction | Mature baseline completed in plan; independent 9/10 |
| Engineering `plan-eng-review` | 1 | Ready for direction | Native-first architecture, database/authority contracts and acceptance plan; runtime proof belongs to implementation |
| Design `plan-design-review` | 1 | Ready for direction | Seven passes; HTML sketch; final plan completeness 8/10 |
| Separate cross-model/Codex CLI review | 0 | Not run | Independent Codex subagent spec challenge above is not a separate cross-model review |
| Dedicated devex review | 0 | Not selected | Existing installed clients retained; machine restriction/status parity included in engineering acceptance |

**CURRENT DISPOSITION:** Earlier reviews remain historical evidence. This
reconciled candidate has accepted vocabulary/source dependencies; affected-portion
re-review and the single Package 7 implementation direction approval remain. No application
code, database migration, vendor signup or policy publication occurred.

**UNRESOLVED DECISIONS:**
- Reconcile/re-review Package 7 against the accepted vocabulary source and remaining data/release boundaries, then obtain its implementation direction approval. Self-service and native reuse remain selected.
- Select/configure the hosted support inbox; Help Scout is evaluated and recommended, not installed.
- Resolve listed operating inputs before their affected production actions/publications.
