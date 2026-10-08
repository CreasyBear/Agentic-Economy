# Current work

**Reconciled:** 8 October 2026. This is the repository's current queue; reuse the
linked issues instead of creating parallel backlogs. The [roadmap](IMPLEMENTATION_ROADMAP.md)
owns capability requirements and [deployment map](docs/operations/deployments.md)
owns shipped source and environments.

## Remaining work

**Source uprev complete:** the [platform API consistency checklist](docs/operations/mercator-maturity-register.md#7-october-platform-source-consistency-uprev) is closed at source/local qualification: alpha.2, regenerated docs and the uninterrupted source gate pass. Hosted onboarding remains a separate gate.

| Boundary | Next action / evidence |
| --- | --- |
| Production availability | Alchemy's existing Base project reports exhausted monthly capacity; Infura responds. Joel chose to leave Alchemy unchanged on 8 October. Preserve two-provider agreement and closed payment readiness; the separate US$25/month proposal is not activated. |
| Account monthly cap — High | Authority/finance: [MM-004](docs/operations/mercator-maturity-register.md#mm-004) correction deployed through PR #373; independent source review, full gate and read-only deployed recovery passed. Hosted purchase qualification remains blocked by unchanged RPC readiness. Existing Calls and Plan Holds share one bounded admission fence, preserving accepted identity and recovery. |
| Alpha invitations | [#288](https://github.com/CreasyBear/Agentic-Economy/issues/288): Joel's go/no-go. Production remains Admin-only. |
| Paid development chat | [#279](https://github.com/CreasyBear/Agentic-Economy/issues/279): real Base Sepolia journey, separate from completed mainnet CLI acceptance. |
| Metering operations | Qualify hosted large-period exports, any historical backfill, automatic monthly schedule activation and financial-evidence archive operation in the actual environment. [Runbook](docs/operations/usage-metering.md). |
| Full Australian commercial record | Complete explicit Seller, separate Provider obligation, attributed tax facts, document evidence and purchase resolution; preserve [remaining qualification](docs/operating-model.md#qualification-still-required). |
| Provider-created services | E1–E5 remains [prospective research](IMPLEMENTATION_ROADMAP.md#provider-created-service-supply-and-fiat-purchasing--prospective-extension), with no recruited Provider or paid pilot. Validate the offer and economics before expanding infrastructure. |

The [readiness record](docs/production-readiness-plan.md) retains 20 mainnet
payments, exact reconciliation and scoped failure/recovery evidence. It does not
prove external Customer traction, paid chat, a joint restore of those purchases
or indefinite provider availability. Screening remains explicitly deferred under
the approved alpha policy.

## Performance and resilience — source closeout

Owner: canonical integrator; continue [#256](https://github.com/CreasyBear/Agentic-Economy/issues/256).
P1–P5 source work and independent review are complete: fewer discovery/settings
requests, deferred startup work, stable Convex ownership, Router-owned Market
state, Calls before optional reports, bounded read cancellation and existing REUI
loading states. Account isolation corrections cover cached data, private headers,
portals and delayed notifications while preserving accepted-operation recovery.
`npm run check` and the complete `npm run gate` passed. This lineage was deployed
with [PR #373](docs/operations/deployments.md#8-october-alpha-readiness-release).

The [deployment record](docs/operations/deployments.md#8-october-performance-and-resilience-candidate)
owns measurements, evidence limits, compatibility and rollback. Local public warm
p95 improved from 310ms to 143.1ms; cold-browser p95 is 4.443s mobile and 1.207s
desktop. The initial 6.607s server-start miss is retained. All 25 protected steps
completed with fewer requests, but four journey medians still exceed 200ms.

Next work stays with these owners:

- **Web/DX:** protected-screen latency, hosted hydration, two-Account isolation
  and retained-browser/accepted-operation compatibility. The inherited
  render-time Chat identity ref flagged by the advisory React Doctor hook is
  corrected in the deployed alpha source; its abandoned-render regression passes. Local fixtures and test
  Clerk journeys do not replace Joel's deferred hosted acceptance.
- **Authority/finance — MM-004:** repair the Account monthly-cap race confirmed by
  independent source review and two local guard cases. The correction is now
  deployed and independently reviewed; complete its hosted
  qualification without waiving current payment readiness.
- **Money/infrastructure — MM-041/MM-042:** qualify current RPC allowance and
  payment readiness, then coherent Convex/storage/Formance restoration. Native
  Vercel Sydney/Fluid/skew metadata and cookie emission are verified; expired AWS
  login blocks resource readback. Configuration is not operational qualification.
- **Existing Datadog owner — [#284](https://github.com/CreasyBear/Agentic-Economy/issues/284):**
  current metrics, backup coverage, alert delivery and recovery evidence.

Preserved unrelated whitepaper/strategy drafts and existing worktrees. The web
and backend release is recorded; no paid production Calls, cap/credential/failover
changes, additional infrastructure or archived-worker activation occurred.

The 8 October public loading re-audit retains the 4.275s hosted cold-entry miss.
Five additional fresh anonymous desktop contexts measured 1.401–1.469s to the
same usable marker (median 1.439s), with 178–193ms initial response times. This is
diagnostic sampling, not a p95 or signed-in acceptance. The startup graph fetched
153 JavaScript resources, about 2.16MB decoded excluding unreported cross-origin
Clerk bytes. Web/DX's next bounded package is to remove the unused Discover/Host
chat-recipient read, separate shared chrome contexts from admin recovery UI,
and remove eager animation dependencies from static public surfaces. Then review
off-route loader/contract imports using TanStack's maintained splitting. Compare
emitted imports, bytes and repeated cold/warm timings; preserve disclosure,
keyboard actions, admin recovery and Account isolation. Do not claim timing gains
from source inspection alone. Broad HTML caching, infrastructure changes and
telemetry removal are not part of the table repair.
References: [React lazy boundaries](https://react.dev/reference/react/lazy),
[TanStack route splitting](https://tanstack.com/router/latest/docs/guide/automatic-code-splitting)
and [Motion bundle guidance](https://motion.dev/docs/react-reduce-bundle-size).

## Platform UI upgrade — production journey qualification

Owner: the canonical UI integrator, with Registry, Supply, Identity, Execution
and Admin owners retaining domain authority. Continue [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256).
The [UI execution record](docs/operations/mercator-maturity-register.md#7-october-platform-ui-upgrade)
tracks F01–F16, dependencies and evidence. REUI/Base Nova and Table 9.2.6 are
integrated and deployed through [PR #370](https://github.com/CreasyBear/Agentic-Economy/pull/370).
Independent source review, `check` and the full `gate` passed at `ce7a0e57`.
Preserve the pre-existing Chat 3 work and unrelated whitepaper/strategy drafts.

[PR #372](https://github.com/CreasyBear/Agentic-Economy/pull/372) corrects the global
navigation composition: destinations live in the header dropdown, with no global
sidebar or visibility preference. Chat keeps its own conversation history.
The PR/deployment receipt records release qualification. Verify the actual Clerk
Account popup and guarded switching during Joel's signed-in acceptance.

Next: Joel's signed-in production testing of the coordinated 8 October release.
Joel explicitly deferred authenticated production journey qualification until
after release; keep that separate acceptance
open for the Identity/Supply/Admin owners. Local test configuration was supplied
on 8 October for the performance work; local fixtures and test-identity journeys
do not replace Joel's deferred hosted acceptance. The deployment owner completed the staged inventory rollout: one projection
backfilled, none skipped, both indexes enabled and read back successfully.
[Release evidence](docs/operations/deployments.md#8-october-platform-ui-production-release)
records the matching web/backend tuple. The release preserves the Admin-only payment audience;
public access expansion and paid Calls are outside this release.

Payments remain unavailable: current Base RPC evidence fails and treasury requires
reconciliation, as before this release. Money/infrastructure owners retain that
readiness work; passing UI checks does not authorize paid testing.

The public market recut is part of this UI candidate. UI/Registry own the branded
opening, readable Tool results, explicit Agent handoff, and complete Host-index
lookup. The optional public Host-prefix reader is deployed with its matching web
caller. It reuses an existing index and needs no data backfill.
The populated local browser fixture uses synthetic read-only data. Hosted
qualification stays open under Joel's deferral.

The 8 October table repair replaces the public Tool, grouped Host and Host-index
operator wrappers with the installed [REUI auto-width composition](https://reui.io/components/data-grid/c-data-grid-6).
UI owns the composition; Registry/Money retain ordering, cursors, identity and
price facts. The deployed defect was reproduced: five 150px columns left a 606px
filler and clipped price decimals. Local actual-component checks with captured
public catalogue data pass at six widths for each table, with keyboard Save,
Compare state changes, saved-status failure/recovery, dark mode and horizontal
table scrolling. Twelve affected tests, `npm run check` and the full source gate
pass; hosted table verification remains open. This evidence does not qualify
signed-in persistence or purchases.

The For Providers recut now uses licensed REUI Hero 14, generated Aecon artwork,
the installed Stepper and Arc FAQ. Its supported setup scope is explicit; the
custom gallery and unnecessary backend loader are removed. Source checks, five
affected tests and local public browser navigation pass. The full release gate
subsequently passed with explicit development/sandbox configuration; the earlier
manifest blocker is resolved. Authenticated publication remains unqualified.

The settings recut replaces the second sidebar with licensed REUI Profile 2 and
uses Solution Users 4 for Team invitations. UI owns the composition; Identity
retains membership, invitation, MFA and readback mechanics. Current source checks
and affected settings suites pass; 320–1440px read-only browser fixtures cover
responsive layout, routed focus, member search, keyboard access to scrolled
controls and dialog focus. Authenticated writes remain deferred with the existing
journey hold. The completion pass also fixes stale Team reads, unknown-command
recovery, invitation/rename Account fences and draft loss; receipt amounts and
Notifications composition are repaired. Auth uses licensed REUI Auth 18 around
Clerk. Two independent Sol reviews and 234 affected tests pass. The source and
read-only visual scope and integrated release gate are complete; authenticated
journeys remain open. See the same UI execution record for detailed limits.

## Mercator maturity

Reuse [#256](https://github.com/CreasyBear/Agentic-Economy/issues/256). The
[Mercator maturity register](docs/operations/mercator-maturity-register.md) owns
stable items **MM-001–MM-060**, current coverage, dependencies, success criteria,
end conditions and references. [ADR 0006](docs/adr/0006-mercator-capability-foundations.md)
retains the dated investigation and proposed architecture;
[foundations.md](docs/foundations.md) explains the current product contract.

Register preparation is complete; **capability parity remains open**. Existing
source/local/recorded sub-proof is retained; no item closes without its named
end condition. MM-001–MM-056 are baseline/foundation requirements; MM-057–MM-060
are separately requested reuse-integration criteria, not inferred Mercator features.
The dated sequence covers F1 docs/contracts, F2 maintained SDK qualification and
one conventional async Tool, F3 bounded procurement graphs, F4 partial/selected/artifact
results, and F5 entitled supply and actual task/client/persona acceptance. Plans
landed separately in #362 under the accepted RFC; F2 is not their prerequisite.
Exact rails, incentives, direct wallet
and embedded surfaces remain required/open for unqualified literal parity.

MM-055 now has the coordinated pre-stability canonical contract, preserved
purchase recovery, hard discovery constraints, actionable Provider continuations
and pagination, and an official same-repository Fumadocs app with Scalar Markdown.
The [register's execution record](docs/operations/mercator-maturity-register.md#7-october-pre-stability-execution)
owns findings, local checks, browser/reader evidence and remaining owners. The docs
build exports 228 approved pages from existing owners: all 68 operations are
accounted for, with 61 rendered references and seven exact OpenAPI fallbacks.
Guide-led browser review and source schema repairs are recorded in the
[closeout](docs/operations/mercator-maturity-register.md#7-october-docs-and-contract-closeout);
generated files are not another authored source.

Next acceptance work: qualify a safe public discovery-to-delivery environment,
then the actual installed client/harness and web/backend/contract/docs tuple.
Native Plan and conventional async Provider completion retain their own gates.
Docs/DX also owns qualifying the seven unsupported Scalar renderings with upstream
changes; keep the exact raw OpenAPI fallbacks meanwhile. The coordinated alpha.2
source uprev passed `npm run check` and an uninterrupted `npm run gate`; see its
[acceptance record](docs/operations/mercator-maturity-register.md#7-october-platform-source-consistency-uprev).
A later merge/release candidate must run the same gate. Install docs dependencies with
`npm ci --prefix packages/docs` first. MM-055 and MM-056 remain open. No docs
publishing or application deployment was performed.

Next preparation slice: **MM-057** maintained SDK/counterparty qualification.
Next runtime slice after bounded direction: **MM-022**, projecting the supported
Provider SDK onto current Calls/Workpool with MM-021/MM-023–MM-026 recovery.
No custom job engine is proposed. MCP Events/core streams/Tasks are distinct
client-qualified integrations; see the ADR reuse-fit matrix. Joel owns direction; responsible areas are named per
item. No payment, permission, secret, subscription, publication or deployment
change is implied. Existing #196/#185/#187 and ADR 0004 retain relevant intent;
retired engine tickets stay retired. Datadog remains separately owned below.

## Datadog workstream


Owner: assigned Datadog executor; Joel owns direction and action approvals.
Wayfinder: reuse [#284](https://github.com/CreasyBear/Agentic-Economy/issues/284)
under [#256](https://github.com/CreasyBear/Agentic-Economy/issues/256), preserving
Sentry/secret-management responsibilities. The proposed Datadog amendment and
[execution prompt / skill chain](docs/adr/0005-datadog-supported-operational-observability.md#prepared-execution-prompt)
live in ADR 0005; no GitHub amendment has been published. No parallel backlog.

State: **prepared design integrated; source consolidation authorised 7 October 2026**. ADR 0005's [engineering review](docs/adr/0005-datadog-supported-operational-observability.md#gstack-review-report)
is complete; ADR acceptance, direction and the #284 amendment remain pending.
Later Wayfinder issues retain their own `/plan-eng-review`/direction gate. Account configuration, received
data and acceptance are **not evidenced** by this preparation; the last supplied
inspection is dated context, not current readback. `approved`, `configured`,
`receiving-data` and `acceptance-verified` are separate evidence stages.

Next: resume the canonical ADR from this checkout, confirm current entitlements
and target settings, and prepare the bounded pilot configuration and issue amendment
for the required privacy, cost and activation decisions. The linked plan
owns inventory/coverage, privacy/cost, credential/IAM, Convex, AWS monitors,
Synthetics, optional Vercel, validation, rollback and handoff dependencies. No
activation follows from the Startup Plan or earlier general setup discussion.

Done means the approved five-case scope has current safe delivery, failure and
recovery notification proof, source-expiry/backup-window observations, sensitive
field absence, measured cost within caps, accepted post-credit cost and supported
exit/rollback evidence. Store
runtime receipts in the existing deployment/journey/readiness records and link
them from the issue; unresolved proof keeps the workstream open.

## Completed work and deferred proposals

Consolidated application, Arc, money, metering, founder-console and chat/client
releases and public npm CLI 0.2.1 are recorded in the [deployment map](docs/operations/deployments.md).
Do not repeat their cutovers from an old branch plan. The [archive](docs/archive/README.md)
retains former queues, reviews and deferred proposals with their original limits.
Revalidate a deferred proposal against the current product and source before
resuming it; archived does not mean implemented, rejected or approved.
