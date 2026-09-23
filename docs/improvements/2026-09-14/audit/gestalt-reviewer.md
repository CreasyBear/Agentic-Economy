# Gestalt audit

**Scope:** Visual hierarchy and perceptual continuity across the alpha journey.

**Result:** 17 findings — 10 high, 7 medium.

## High severity

| Source | Principle and evidence | Recommendation |
| --- | --- | --- |
| `src/routes/_operator/activity.tsx:30` | **Similarity:** Calls appears in global, footer, and owner navigation while peer destinations are distributed differently. | Give each navigation level one job; keep the complete customer workflow in one workspace region. |
| `src/routes/_operator/owner.credit.tsx:38` | **Continuity:** Mobile primary is Calls, Agents, Provider Tools; Balance is omitted. | Include Balance and preferably Market; separate Supply behind mode/overflow. |
| `src/components/ae/layout/AeOperatorPage.tsx:223` | **Proximity:** Shared content has no standard sibling rhythm, allowing alerts, summaries, tables, and administration to collapse together. | Establish a page-stack rhythm with tighter within-group and larger between-group spacing. |
| `src/components/ae/operator/AeOperatorDataTable.tsx:185` | **Continuity:** Generic View/Open is prepended before object identity, interrupting left-to-right scanning. | Put identity and facts first, trailing action last; link identity where appropriate. |
| `src/components/ae/console/AeOwnerCredit.tsx:163` | **Figure-ground:** Balance and explanation have equal visual weight. | Make available AUD the dominant figure with subordinate state and adjacent Add credit. |
| `src/components/ae/console/AeOwnerCredit.tsx:180` | **Similarity:** Funding cards and a separate Call table claim to be one Balance history but form two unrelated visual systems. | Use one chronological ledger row pattern or explicitly label separate coverage. |
| `src/routes/calls.$callRef.tsx:292` | **Continuity:** Receipt switches from owner shell to public shell and loses Calls location/back context. | Preserve the owner shell or add a persistent breadcrumb/back action restoring exact list context. |
| `src/routes/calls.$callRef.tsx:328` | **Similarity:** Issue, recovery form, and copied agent command appear as peer next steps. | Compose one state-derived Resolve this Call region; subordinate optional technical actions. |
| `src/components/ae/console/AeAgentApprovalsSection.tsx:53` | **Figure-ground:** Raw Tool reference is foreground; familiar decision identity is absent. | Foreground Agent, Tool, task/consequence, AUD ceiling, and data release in one approval card. |
| `src/components/ae/supply/AeSupplySourceNativeStart.tsx:12` | **Continuity:** Workflow sections accumulate at equal weight with no current/completed stage treatment. | Use a connected four-stage progression and collapse completed stages into editable summaries. |

## Medium severity

| Source | Principle and evidence | Recommendation |
| --- | --- | --- |
| `src/components/ae/console/AeCreditTopUpPanel.tsx:255` | **Closure:** Authoritative totals are inside a bordered quote, but the committing action sits outside it. | Put preview and Pay/Add credit action in the same common region. |
| `src/routes/_operator/activity.tsx:209` | **Figure-ground:** Usage/Spend have headings and cards; recent Calls is an unheaded table. | Compress summaries and foreground a visibly titled Calls/attention section. |
| `src/routes/calls.$callRef.tsx:374` | **Continuity:** Six equal cells form an ambiguous sequence, especially in a two-column grid. | Use one connected vertical/horizontal stepper and emphasize the current/attention stage. |
| `src/components/ae/console/AeAgentOperatorConsole.tsx:153` | **Proximity:** A standalone Credit section interrupts setup → approvals → Agents. | Replace with contextual blocker/action only when funding prevents work. |
| `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx:505` | **Closure:** Consent facts are enclosed, but Approve/Decline sit outside the decision region. | Attach the decision bar to the consent summary. |
| `src/components/ae/offerings/AeOwnerOfferings.tsx:113` | **Similarity:** Lifecycle, availability, blocker, next action, access, and readiness restate one status in several visual forms. | Consolidate customer-visible status and reason; retain one trailing next action. |
| `src/components/ae/market/DirectoryComparison.tsx:26` | **Continuity:** Scrolling separates values/actions from Tool headings; mobile horizontal scroll loses labels. | Keep headers and fact-label column sticky; attach Inspect to each Tool identity. |

## Visual contract for alpha

- One foreground job per screen.
- Identity precedes evidence; action follows the facts that justify it.
- Terms and their commit action share a common region.
- Sequential work uses an explicit axis and current-stage emphasis.
- Buyer and Provider modes are separate perceptual groups, not adjacent mandatory work.
