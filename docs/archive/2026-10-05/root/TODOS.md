> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../README.md) for its successor and remaining limits.

# Current delivery queue

Updated 5 October 2026. [PRODUCT.md](../../../../PRODUCT.md) owns product direction; source
and tests establish implementation. [Current deployments](../operations/deployments.md)
owns deployed identities and acceptance limits. [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256)
tracks the remaining production-alpha decisions.

## One delivery stream

All active implementation is consolidated through
`codex/aecon-consolidation-2026-10-05` into `main`, with matching backend and web
releases. No direct push to `main`. Each release requires `npm run check`, affected
behavior tests and the full `npm run gate`, using Node 22 / npm 11.5.1 locally.
Vercel retains the approved npm 11.19.1 install override.

- First-user remediation and treasury historical-cutoff/reconciliation fixes are
  incorporated through PRs #351, #353 and #354.
- Usage metering foundation and completion (`c5f2b7356`) are incorporated in
  [PR #354](https://github.com/CreasyBear/Agentic-Economy/pull/354). Backfill is explicitly
  invoked; automatic monthly reporting is inactive and external metering disconnected.
- Founder console work (`8cd35d5be`) is integrated in this consolidation stream:
  purchase activity, Accounts, funding-aware metrics and progressive investigation.
  Current Arc tables, exact amounts, permission checks and recovery evidence are retained.
- Arc work through PR #350 is incorporated. The source/acceptance history remains
  in the [Arc protocol](../designs/arc-ui-refactor/protocol.md).
- PR #242 is superseded by the deployed readiness diagnostics. PR #226's surviving
  intent is incorporated; its retired seller-onboarding canary is not restored.
- `wip/openui-compose` is an archived, unwired proposal. It is not a shipped capability.

Unique commits and original founder handoff files are preserved in the consolidation
recovery bundle. Bulk comparable research and historical `.design-system` / `.migration`
audits were moved out of the primary checkout with SHA-256 verification. Small active
research documents linked by Joel's drafts remain. Retained checkouts containing local
credentials, running processes or another chat's files are recovery material, not
independent delivery streams. Do not erase them to make a branch count look tidy.

## Remaining work

| Boundary | Next action / evidence |
| --- | --- |
| Production availability | Observe scheduled treasury and readiness across the evidence expiry window. Preserve fail-closed behavior on unavailable RPC/receipt evidence; distinguish provider availability from cash disagreement. [Deployment map](../operations/deployments.md). |
| Alpha launch decision | [#288](https://github.com/CreasyBear/Agentic-Economy/issues/288): Joel's go/no-go for invitations. Production remains Admin-only; no invitations or audience expansion are implied by consolidation. |
| Paid development chat | [#279](https://github.com/CreasyBear/Agentic-Economy/issues/279): real Base Sepolia journey remains separate from the completed mainnet CLI acceptance. |
| Metering operations | Review any historical measurement backfill, automatic monthly schedule activation, hosted large-period exports and financial-evidence archive operation against their actual environment. [Historical implementation evidence](../operations/usage-metering-completion.md). |
| Public CLI distribution | Installed package and production CLI use are verified; public npm lookup still returns 404 on 5 October. Publication is a separate release action. |
| Full Australian commercial record | Follow PRODUCT.md: explicit buyer-facing Seller, Provider obligation, attributed tax facts, document evidence and purchase resolution must not be inferred from a payment receipt alone. |

The 20 real mainnet payments, reconciliation and scoped failure drills are recorded
in the [readiness record](../production-readiness-plan.md#twenty-real-mainnet-payments).
They do not prove external Customer traction, paid chat, a joint restore of those
purchases or indefinite provider availability. Screening remains explicitly deferred
under the approved alpha policy.

## Datadog workstream

Owner: assigned Datadog executor; Joel owns direction and action approvals.
Wayfinder: reuse [#284](https://github.com/CreasyBear/Agentic-Economy/issues/284)
under [#256](https://github.com/CreasyBear/Agentic-Economy/issues/256), preserving
Sentry/secret-management responsibilities. The proposed Datadog amendment and
[execution prompt / skill chain](../../../adr/0005-datadog-supported-operational-observability.md#prepared-execution-prompt)
live in ADR 0005; no GitHub amendment has been published. No parallel backlog.

State: **awaiting-direction; prepared**. ADR 0005's [engineering review](../../../adr/0005-datadog-supported-operational-observability.md#gstack-review-report)
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

## History and deferred proposals

The [pre-consolidation queue](https://github.com/CreasyBear/Agentic-Economy/blob/a1d9d2d09953681a99db7a4b729ffb77e2c667b7/TODOS.md)
preserves all older WF IDs, Well/Package plans, branch census and paused campaigns.
It is historical evidence, not an instruction to repeat completed cutovers or reopen
paused work. [The existing archive index](../../README.md) locates earlier
closeouts. Revalidate any deferred proposal against current source before resuming it.
