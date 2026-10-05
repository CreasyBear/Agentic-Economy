# Current work

**Reconciled:** 5 October 2026. This is the repository's current queue; reuse the
linked issues instead of creating parallel backlogs. The [roadmap](IMPLEMENTATION_ROADMAP.md)
owns capability requirements and [deployment map](docs/operations/deployments.md)
owns shipped source and environments.

## Remaining work

| Boundary | Next action / evidence |
| --- | --- |
| Production availability | Continue source/readiness observation across evidence expiry; preserve fail-closed RPC/receipt behavior and distinguish unavailable evidence from cash disagreement. |
| Alpha invitations | [#288](https://github.com/CreasyBear/Agentic-Economy/issues/288): Joel's go/no-go. Production remains Admin-only. |
| Paid development chat | [#279](https://github.com/CreasyBear/Agentic-Economy/issues/279): real Base Sepolia journey, separate from completed mainnet CLI acceptance. |
| Public CLI distribution | Downloadable/installed CLI 0.2.1 and production use are verified. Complete the separate public npm publishing release and record its result. |
| Metering operations | Qualify hosted large-period exports, any historical backfill, automatic monthly schedule activation and financial-evidence archive operation in the actual environment. [Runbook](docs/operations/usage-metering.md). |
| Full Australian commercial record | Complete explicit Seller, separate Provider obligation, attributed tax facts, document evidence and purchase resolution; preserve [remaining qualification](docs/operating-model.md#qualification-still-required). |
| Provider-created services | E1–E5 remains [prospective research](IMPLEMENTATION_ROADMAP.md#provider-created-service-supply-and-fiat-purchasing--prospective-extension), with no recruited Provider or paid pilot. Validate the offer and economics before expanding infrastructure. |

The [readiness record](docs/production-readiness-plan.md) retains 20 mainnet
payments, exact reconciliation and scoped failure/recovery evidence. It does not
prove external Customer traction, paid chat, a joint restore of those purchases
or indefinite provider availability. Screening remains explicitly deferred under
the approved alpha policy.

## Mercator capability foundation

Owner: delegated foundation reviewer for preparation; Joel owns runtime direction.
Reuse [#256](https://github.com/CreasyBear/Agentic-Economy/issues/256). The
[verified baseline, engineering review and ordered slices](docs/adr/0006-mercator-capability-foundations.md)
own this proposal; [the foundation guide](docs/foundations.md) describes current
actors, setup, Tool Calls and recovery. No separate register or paid execution.

State: **prepared; runtime awaiting-direction**. F1 docs/contracts → F2 one
conventional asynchronous Tool → F3 bounded multi-Tool procurement → F4
partial/selective results and financial readback → F5 entitled supply and actual
persona/client acceptance. Each slice retains evidence, ownership, dependencies
and acceptance in ADR 0006. Existing #196/#185/#187 and ADR 0004 are linked;
retired engine issues are not reactivated. Literal payment rails, incentives and
embedded-client parity remain explicit decisions. Next runtime slice is F2 after
bounded direction; no payments, permissions, secrets or deployment are implied.

## Datadog workstream


Owner: assigned Datadog executor; Joel owns direction and action approvals.
Wayfinder: reuse [#284](https://github.com/CreasyBear/Agentic-Economy/issues/284)
under [#256](https://github.com/CreasyBear/Agentic-Economy/issues/256), preserving
Sentry/secret-management responsibilities. The proposed Datadog amendment and
[execution prompt / skill chain](docs/adr/0005-datadog-supported-operational-observability.md#prepared-execution-prompt)
live in ADR 0005; no GitHub amendment has been published. No parallel backlog.

State: **awaiting-direction; prepared**. ADR 0005's [engineering review](docs/adr/0005-datadog-supported-operational-observability.md#gstack-review-report)
is complete; ADR acceptance, direction and the #284 amendment remain pending.
Later Wayfinder issues retain their own `/plan-eng-review`/direction gate. Account configuration, received
data and acceptance are **not evidenced** by this preparation; the last supplied
inspection is dated context, not current readback. `approved`, `configured`,
`receiving-data` and `acceptance-verified` are separate evidence stages.

Next: review the existing #284 amendment and ADR; record the selected revision
and bounded direction approval, and authorise its issue update. The linked plan
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
releases are recorded in the [deployment map](docs/operations/deployments.md).
Do not repeat their cutovers from an old branch plan. The [archive](docs/archive/README.md)
retains former queues, reviews and deferred proposals with their original limits.
Revalidate a deferred proposal against the current product and source before
resuming it; archived does not mean implemented, rejected or approved.
