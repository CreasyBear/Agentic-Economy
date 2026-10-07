# Current work

**Reconciled:** 7 October 2026. This is the repository's current queue; reuse the
linked issues instead of creating parallel backlogs. The [roadmap](IMPLEMENTATION_ROADMAP.md)
owns capability requirements and [deployment map](docs/operations/deployments.md)
owns shipped source and environments.

## Remaining work

**Source uprev complete:** the [platform API consistency checklist](docs/operations/mercator-maturity-register.md#7-october-platform-source-consistency-uprev) is closed at source/local qualification: alpha.2, regenerated docs and the uninterrupted source gate pass. Hosted onboarding remains a separate gate.

| Boundary | Next action / evidence |
| --- | --- |
| Production availability | Continue source/readiness observation across evidence expiry; preserve fail-closed RPC/receipt behavior and distinguish unavailable evidence from cash disagreement. |
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
