# Platform objects & states

**Status:** wave 1 register  
**Date:** 2026-09-21  
**Authority:** [PRODUCT.md](../../PRODUCT.md) decision chain and implementation boundary; [CONTEXT.md](../../CONTEXT.md) vocabulary and economic terms; grades follow [`platform-design-package.md`](./platform-design-package.md).  
**Companion:** [`platform-design-package.md`](./platform-design-package.md) part 3. Jobs in [`platform-job-map.md`](./platform-job-map.md); journeys in [`platform-journey-blueprint.md`](./platform-journey-blueprint.md); dests in [`platform-nav-route-map.md`](./platform-nav-route-map.md).

Design around decisions and outcomes. Users must understand a small consistent vocabulary. Payment and refund status remain separate facts from delivery and from purchase resolution. A cancelled Call does not necessarily mean a refund has completed.

No user interviews were conducted for this register. Anxiety and next-action rows infer from charter and source, not fabricated quotes.

**Grades** (required on every object and every material state):

| Grade | Meaning |
| --- | --- |
| `CHARTER` | PRODUCT.md / CONTEXT.md require it; source may not |
| `IMPLEMENTED` | Current source and tests establish it |
| `PARTIAL` | Source exists; journey or states incomplete |
| `SEEN` | Live product page this session |
| `OPEN` | Not decided; do not implement from interpolation |
| `DOCS` | First-party docs named it; not walked on the product |

---

## Five questions every consequential screen must answer

For each material state of a user-facing object, the dest that explains it must make these five facts obvious:

1. **What happened** — the last committed fact (not a hope).
2. **What is happening now** — pending work, wait, or terminal stillness.
3. **Who must act** — Customer, Agent, Provider, platform, or nobody.
4. **What they can do next** — one supported action, or wait.
5. **When to expect an update** — poll, expiry, or “no further change.”

---

## Relationship diagram

Who owns whom. Do not collapse these boxes.

```text
Customer
  owns ──► Account
              ├── prepaid AUD credit (available / reserved)
              ├── Agents ──► credentials ──► Spending policy (versioned)
              │                └── optional Request authorization / Approval (one request)
              ├── Quotes (issued → consumed | expired)
              ├── Calls ──► Charge, delivery observations, Refund
              │               └── Purchase resolution (derived; may stay open)
              └── Service requests (matching eligibility, not a tender)

Provider
  owns ──► Business / Offering (portfolio record; not callable)
              ├── Source (imported contract / endpoint metadata)
              ├── Provider connection (authorised upstream access)
              ├── Publication (admit + seal a Tool version)
              │      └── Tool + Tool version (only callable unit)
              │             └── Listing (catalogue merchandising of that Tool)
              ├── Provider obligation (per Call; ≠ buyer Charge)
              └── Payout (transfer of accrued earnings)

Seller (AE for supported principal-reseller Calls)
  contracts with Customer; does not become the Provider.

Payment recipient
  receives one settlement movement; not inferred from wallet, endpoint, or credential.
```

**Tool vs Publication vs Listing vs Source vs Provider connection**

| Record | What it is | What it is not |
| --- | --- | --- |
| **Source** | Imported contract or endpoint metadata (OpenAPI, MCP, agent plugin, x402). | A callable Tool. Import ≠ admission. |
| **Provider connection** | Authorised upstream access path for a Source. | Provider identity, Seller, or payment recipient. |
| **Offering** | Portfolio / catalogue admission record the Provider manages (`active` / `inactive`). | A Tool. CONTEXT.md: portfolio Service / Offering is not automatically callable. |
| **Publication** | Provider act of admitting and sealing a callable Tool version. | Listing, registry import, or a Call. |
| **Tool / Tool version** | The only callable supply unit. Quote and Call bind a version. | Offering, Publication, Listing, Source, or connection. |
| **Listing** | Catalogue merchandising of a published Tool (`reviewed` / `listed` tier). | Publication lifecycle or execution readiness. |

---

## 1. Customer

**Definition** ([CONTEXT.md](../../CONTEXT.md) § Customers, agents and accounts): the person or legal entity that owns the objective, grants permission and bears the economic result of the purchase.

**Relationships:** owns the Account; grants Spending policy / Request authorization; is not the Agent; login identity does not by itself establish who is buying. Quote stores `legalCustomerRef` (`capabilityQuotes` in `src/modules/capability-execution/internal/convex-schema.ts`).

**State machine:** no purchase lifecycle. Identity is durable. A team member or administrator may act *for* the Customer.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Present as legal customer on a Quote | Quote bound `legalCustomerRef` | Quote may still expire unused | Agent may Call; Customer funds/authorises | Honour Quote or abandon | Quote `expiresAt` | **PARTIAL** — field stored; buyer-facing Seller/tax identity still **CHARTER** ([PRODUCT.md](../../PRODUCT.md) § Current implementation boundary) |
| Missing legal customer | Quote refused `commercial_policy_unavailable` / `legal_customer_required` | Call blocked | Customer / owner | Confirm legal customer; then re-quote | Immediate on save | **IMPLEMENTED** — `projectToolQuoteRefusal` in `src/modules/capability-execution/quote.ts` |

**NOT:** the signed-in administrator; the Agent; the Account; a wallet.

**Grade + cite:** **PARTIAL** — CONTEXT.md Customer; `capabilityQuotes.legalCustomerRef`. Complete Australian buyer-facing identity **CHARTER**.

---

## 2. Agent

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the durable technical identity acting for a Customer through an Account. Credentials and agent apps may change without changing that identity.

**Relationships:** bound to one Account; acts under a Spending policy (or a Request authorization); never supplies `accountRef` on Call ([PRODUCT.md](../../PRODUCT.md) § Agent operating model). Operator directory status is a *projection*, not a second identity.

**State machine (grant / credential):**

```text
active ──► revoked
   └──► expired

Operator directory (presentation): connected | attention | expired | disconnected
Credential row (operator): active | stale | revoked
```

Internal OAuth grant statuses (`pending` → `issuing` → `approved` → `delivery_claimed` → `consumed`, forks `denied` / `expired`) are **internal**. User-facing label: **waiting for approval** / **approved** / **denied** / **expired**. Do not show `delivery_claimed` or `issuing`.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Active / connected | Grant `lifecycle: active`; credential usable | Agent may quote/call within policy | Agent | `tool.quote` → `tool.call` | Immediate | **IMPLEMENTED** — `AGENT_ACCESS_LIFECYCLE_VALUES` in `src/modules/agent-access/policy.ts` |
| Attention | Connected, but a source read is unavailable | Access may still work | Customer | Refresh Agents dest | Retry | **PARTIAL** — `AgentDirectoryItem.status` in `src/modules/agent-access/agent-access-console.ts` |
| Expired | Grant or credential past `expiresAt` | Purchases refused (`grant_expired`) | Customer | Re-authorise / rotate | Immediate | **IMPLEMENTED** — `policy.ts` `AgentAccessLifecycle` |
| Revoked / disconnected | Owner revoked grant or credential | History retained; new Calls refused | Customer | Issue a new grant; do not reuse revoked credential | Immediate | **IMPLEMENTED** — `agent-lifecycle-copy.ts` toasts |
| Waiting for approval (OAuth) | Device/code grant `pending` | Polling | Customer on `/agent-access/authorize` | Approve or deny | ~5s poll (`AGENT_ACCESS_POLL_INTERVAL_SECONDS`) | **IMPLEMENTED** — `AgentAccessOAuthGrantStatus` in `src/modules/agent-access/oauth-state.ts` |

**NOT:** a legal person; owner of funds; a new Agent when a credential rotates ([CONTEXT.md](../../CONTEXT.md)).

**Grade + cite:** **PARTIAL** — identity and grant lifecycle **IMPLEMENTED**; installed-client / hosted acceptance **CHARTER** ([PRODUCT.md](../../PRODUCT.md) § Product language and compatibility).

---

## 3. Account

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the durable customer boundary containing agents, spending policies, shared prepaid credit, budgets and purchase records. A Call’s account is resolved from authentication.

**Relationships:** contains Agents, policies, prepaid credit, Quotes, Calls. Not a wallet, credential, or assumed organisation membership. Clerk org scope (`/owner/*`) is workspace routing, not “permission to buy” ([`platform-nav-route-map.md`](./platform-nav-route-map.md)).

**State machine (balance read):**

```text
active ──► locked
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Active | Balance readable | Credit may be reserved by open Calls | Customer funds; Agent spends within policy | Top up, adjust policy, inspect Calls | On funding/Call | **IMPLEMENTED** — `accountState` in `agentAccountBalanceResultSchema` (`src/modules/agent-access/account.actions.ts`) |
| Locked | Account flagged locked on balance read | Paid Calls should not proceed | Customer / support | Unlock path **OPEN** in UI copy; do not treat as revoked Agent | Until unlocked | **PARTIAL** — `accountState: 'locked'`; owner credit shows locked (`AeOwnerCredit.tsx`) without a complete unlock machine |

**NOT:** prepaid balance; Spending policy; Clerk organisation; USDC treasury.

**Grade + cite:** **PARTIAL** — `agentAccountBalanceResultSchema`; production money disabled until legal gates ([PRODUCT.md](../../PRODUCT.md) § Current implementation boundary).

---

## 4. Spending policy

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the versioned rules granting an Agent permission to buy through the Account, including allowed Tools and hard per-Call and aggregate limits. Limits survive credential rotation.

**Relationships:** attached to an Agent grant (`spendingPolicyDigest`). Distinct from Request authorization / Approval (one request) and from prepaid balance. Settings copy: “Spending permissions” and “Spending limits”.

**State machine:**

```text
Grant: active ──► revoked
              └──► expired

Limits (derived, not stored): in force ──► paused (all three limits = A$0.00)
Version: digest changes on each accepted update (stale callers refuse grant_generation_stale)
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Active, limits in force | Grant active; digest current | Agent may spend up to ceilings | Agent quotes/calls; Customer may edit | Quote will re-check | Immediate on Call | **IMPLEMENTED** — `policy.ts` `admitAgentAccessGrant` |
| Paused (zero limits) | Owner set per-call/daily/monthly to zero | Quotes refuse `budget_exceeded` | Customer | Restore limits on Agents dest | Immediate | **IMPLEMENTED** (derived) — `isSpendingPaused` in `src/modules/agent-access/spending-limit-policy.ts` |
| Revoked / expired grant | Lifecycle left `active` | Calls refuse grant codes | Customer | New grant; history kept | Immediate | **IMPLEMENTED** — `AGENT_ACCESS_LIFECYCLE_VALUES` |
| Stale generation | Policy updated after caller bound | Call/quote refuses `grant_generation_stale` | Agent | Re-authenticate / re-quote | Immediate | **IMPLEMENTED** — `policy.ts` |

**NOT:** Account balance; a one-off Approval; funding; a Call.

**Grade + cite:** **PARTIAL** — grant + limits **IMPLEMENTED**; Request authorization path exists in CONTEXT.md and is not a standing policy prerequisite ([CONTEXT.md](../../CONTEXT.md) § Request authorization). Pause is derived, not a stored enum.

---

## 5. Tool

**Definition** ([CONTEXT.md](../../CONTEXT.md) § Finding and using services): for an AE Call, the exact, versioned callable supply unit with defined inputs, outputs, price, terms, access, data use, external effects, readiness and evidence.

**Relationships:** produced by Publication from a Source via a Provider connection; merchandised as a Listing; bound by Quote and used by Call. An x402 endpoint can be discovered before AE imports or publishes it; that discovery is not execution support.

**State machine (buyer-facing availability):**

```text
setup_required ──► routeable ──► unavailable
                       │
                       └── reasons: inspection_required | temporarily_unavailable |
                           readiness_expired | publisher_withdrew | under_review |
                           updated_terms_require_review | not_supported_by_ae
```

Owner-facing Tool inventory (`ProviderToolState`) is a *different* machine — see Publication.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Routeable | Publication active and readiness current | Discoverable; Quote allowed | Agent / Customer | Compare or Quote | Readiness `validUntil` | **IMPLEMENTED** — `publicToolAvailabilitySchema.posture` in `src/modules/capability-supply/tool-schemas.ts` |
| Setup required | Admission or connection incomplete | Not callable as a paid AE Tool | Provider | Finish supply funnel | On publish/recheck | **IMPLEMENTED** — same schema `reason: 'setup_required'` |
| Unavailable (withdrawn / expired readiness / under review / …) | Publication or readiness left routeable | Search may still show metadata; Call must refuse | Provider to restore; buyer to pick another Tool | `tool.quote` refuses `tool_not_ready` / `tool_not_current` | Recheck / republish | **IMPLEMENTED** — availability reasons; quote refusals in `quote.ts` `toolQuoteRefusalCodeValues` |

**NOT:** Offering, Publication, Listing, Source, Provider connection, portfolio Service, or an unverified directory entry.

**Grade + cite:** **PARTIAL** — catalogue posture **IMPLEMENTED**; “effortless matching despite vocabulary” remains **CHARTER** ([PRODUCT.md](../../PRODUCT.md) journey 1).

---

## 6. Tool version

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the identified revision of a Tool’s contract and material terms. It is the version bound by a Quote and used by a Call.

**Relationships:** `toolVersion` on a committed Quote (`toolQuoteResultSchema`); drift vs current Tool fails before reservation ([PRODUCT.md](../../PRODUCT.md) Honour the Quote).

**State machine:**

```text
current (matches published revision) ──► not_current (publication moved on)
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Current | Quote `toolVersion` matches published material | Call may proceed if Quote unexpired | Agent | `tool.call` | Until Quote expiry or republish | **IMPLEMENTED** — `quote.ts` committed result |
| Not current | Provider republished or material digest drifted | Quote/Call refuses `tool_not_current` | Agent | New Quote on the current version | Immediate | **IMPLEMENTED** — `toolQuoteRefusalCodeValues` |

**NOT:** a second Call identity; a Listing tier; “latest” implied without a Quote bind.

**Grade + cite:** **IMPLEMENTED** — `toolQuoteResultSchema.toolVersion`; Call revalidation in PRODUCT.md agent operating model.

---

## 7. Quote

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the expiring decision returned by inspection for one Customer’s Agent, Account, applicable authorization version, Tool version and normalised input. A price estimate alone is not this Quote.

**Relationships:** precedes Call; binds price ceiling, policy refs, evidence digest; optional `parties` (seller / provider / paymentRecipient) — complete principal-reseller party fields remain **CHARTER**. Distinct from SuppliedQuote (upstream).

**State machine:**

```text
(request) ──► refused
          └──► issued ──► consumed (Call accepted)
                      └──► expired
```

Public action result is only `committed` | `refused` (`toolQuoteResultSchema`). Stored row adds `issued` | `consumed` | `expired` (`capabilityQuotes.state`).

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Issued / committed | Quote persisted; `expiresAt` set; no reservation yet | Waiting for `tool.call` | Agent | Call with `quoteRef` + idempotency key, or let expire | `expiresAt` | **IMPLEMENTED** — `quote.ts` `kind: 'committed'`; schema `state: 'issued'` |
| Consumed | A Call accepted this Quote | Quote cannot be reused | — | Inspect the Call | Terminal for the Quote | **IMPLEMENTED** — `consumedCallRef` on `capabilityQuotes` |
| Expired | Clock passed `expiresAt` unused | Call refuses `quote_expired` | Agent | New `tool.quote` | Immediate | **IMPLEMENTED** — schema `expired`; `quote.actions.ts` / `call.actions.ts` invalidation `quote_expired` |
| Refused | Inspection failed (tool, grant, budget, balance, policy, …) | No Quote exists | Depends on code | Suggested next action on the refusal (fund, review access, search, retry) | Immediate or `retryAfterMs` 5s/30s | **IMPLEMENTED** — `toolQuoteRefusalCodeValues` + `projectToolQuoteRefusal` |

**NOT:** a Call; a completed purchase; funding; authority; an upstream SuppliedQuote.

**Grade + cite:** **PARTIAL** — issue/consume/expire and spending checks **IMPLEMENTED**; explicit Provider/Seller fields on the DTO **CHARTER** ([PRODUCT.md](../../PRODUCT.md) § Agent operating model).

---

## 8. Call

**Definition** ([CONTEXT.md](../../CONTEXT.md)): one accepted use of a Tool version under a Quote and the applicable authorization path. Logs, Usage and Spend are views of the same Call.

**Relationships:** owns execution identity; links Charge, delivery, payment, recovery, Suggested next action, Outcome records, and (when admitted) Purchase resolution. Recovery actions: `call.status`, `call.cancel`, `call.reconcile` only when not terminal ([PRODUCT.md](../../PRODUCT.md)).

**State machine (user-facing list):**

```text
pending ──► completed
        ├──► refused
        ├──► reconciliation_required ──► completed | refused | cancelled
        └──► cancelled
```

Source: `callStateValues` in `src/modules/capability-execution/call-history.actions.ts`.

**Internal status protocol** (do not show raw tokens; labels from `foundStatusLabel` in `call-receipt-view.ts`):

| Internal `CallStatusState` | User-facing label | Notes |
| --- | --- | --- |
| `gathering_information` | Preparing request | Pre-authority |
| `awaiting_authority` | Waiting for approval | Owner Approval |
| `authorized` | Authorized | Internal |
| `leased` | Preparing provider call | Internal lease |
| `in_progress` | Provider call in progress | Possible dispatch |
| `retryable` | Safe retry available | Same Call only |
| `reconciliation_required` | Reconciliation required | Outcome uncertain |
| `terminal` | Call finished | May lack completed result |
| `cancelled` | Cancelled | Not a refund |
| `invalidated` | No longer valid | Authority/generation |

Result kinds (`callResultKindValues`): `completed` | `pending` | `needs_authority` | `reconciliation_required` | `refused`. Machine result uses `outcome_unknown` instead of `needs_authority` / `reconciliation_required` (`callMachineResultSchema`) — **internal**. Buyer purchase *presentation*: `Open — pending` | `Open — outcome uncertain` | `Resolved — delivered` | `Resolved — refunded` | `Resolved — failed` (`BuyerCallPurchaseStatus`).

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Pending / in progress | Call accepted; Provider attempt may be underway | Delivery and payment still open | Platform worker; Agent polls `call.status` | Wait or cancel if allowed; never a fresh Call | `retryAfterMs` / worker | **IMPLEMENTED** — `callStatusStateValues`; `call-recovery.actions.ts` |
| Waiting for approval | Result `needs_authority` | Call parked | Customer | Approve or deny on Agents dest | Until decision / expiry | **IMPLEMENTED** — `callResultKindValues` |
| Safe retry | Attempt failed before unsafe dispatch | Same Call eligible | Agent / Customer | Retry *this* Call | Immediate after action | **IMPLEMENTED** — `retryable` |
| Reconciliation required | Boundary may have been crossed; outcome not conclusive | Purchase stays open | Agent/owner submit evidence; or wait for worker | `call.reconcile` only | Until evidence or auto-reconcile | **IMPLEMENTED** — recovery contracts; J-B08 |
| Completed | Canonical result + usage recorded | Delivery observed complete; payment may still differ | Customer uses output in harness | Inspect receipt; do not retry | Terminal for delivery | **IMPLEMENTED** — `result.kind === 'completed'`; purchase resolution may still be **open** |
| Refused | Ended without completed result | See Charge/refund separately | Customer / Agent | Next action on refusal; new Call only from Tool with fresh identity | Terminal for this Call | **IMPLEMENTED** — `callRefusalCodeValues` |
| Cancelled | Cancellation recorded | Refund/release may still be pending or inapplicable | Platform money path | Watch Charge/Refund; do not assume refund | Until receipt `refundState` | **IMPLEMENTED** — cancel action; refund is a **separate fact** |
| Invalidated | Authority/generation no longer valid | Cannot continue | Customer | New Quote/Call if still needed | Terminal | **IMPLEMENTED** — status `invalidated` |

**NOT:** Action execution; a second purchase record; proof that payment settled; purchase resolution; a refund.

**Grade + cite:** **PARTIAL** — lifecycle and recovery **IMPLEMENTED** (`call-recovery-contracts.ts`, `call-history.actions.ts`, `CallRecoveryPanel.tsx`); complete AU production record **CHARTER**.

---

## 9. Purchase resolution

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the final, explainable outcome joining the Tool, customer and agent, permissions, quote, price, delivery and any remedy. Show “Purchase status” and the actual outcome rather than the internal closure model.

**Relationships:** derived from one Call’s linked facts (`buildPurchaseResolutionRecord`). Not a second product. Stays open while delivery or payment is unknown.

**State machine:**

```text
open (not materialized)
  ├── delivery unknown | payment unknown | not terminal
  └── admitted terminalState:
        completed | refunded | released | disputed
```

Independent axes on the record: `deliveryState` = `delivered` | `not_delivered` | `unknown`; `paymentState` = `settled` | `released` | `unknown` | `not_applicable`.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Open — pending | Call not terminal or facts incomplete | Worker may still materialize | Wait | `call.status` | Worker / poll | **PARTIAL** — `buildPurchaseResolutionRecord` returns `kind: 'open'`; UI uses `BuyerCallPurchaseStatus` even when no row exists |
| Open — outcome uncertain | Delivery or payment `unknown`, or reconcile required | Must not be labelled complete | Agent/owner reconcile | `call.reconcile` | Until both axes known | **IMPLEMENTED** (projection) — `projectFoundCallPurchaseStatus` |
| Resolved — delivered | `terminalState: completed` *or* presentation when result completed | Closed as delivered | Customer uses output | Explain on Call dest | Terminal | **PARTIAL** — presentation **IMPLEMENTED**; persisted `purchaseResolutionRecords` only when materializer admits (`purchaseResolutionMaterialize.ts` can no-op) |
| Resolved — refunded | Payment released / receipt refunded / obligation reversed | Closed as refunded | — | Keep `callRef` | Terminal | **PARTIAL** — same |
| Resolved — failed | Call refused/cancelled/terminal without completed result | Closed as failed *in presentation* | — | Do not assume refund | **Trap** if refund still pending | **PARTIAL** — `BuyerCallPurchaseStatus.failed` can fire on `cancelled` before refund completes |
| Released (internal terminal) | Refused + not delivered + payment not applicable, or refundState released | No buyer Charge kept | — | Label as released / refunded, not “success” | Terminal | **IMPLEMENTED** — `derivePurchaseTerminalState` |
| Disputed | Provider obligation `disputed` | Open commercially | Support / Provider | Follow obligation | Until obligation leaves disputed | **IMPLEMENTED** in builder; buyer dest **PARTIAL** |

**NOT:** cash settlement finality; the buyer’s accounting judgement; delivery; payment; a Call state.

**Grade + cite:** **CHARTER** as one explicit production record ([PRODUCT.md](../../PRODUCT.md) § Current implementation boundary). **PARTIAL** in source — `purchase-resolution.ts` `purchaseTerminalStateValues`; `materializePurchaseResolutionRecord` in `convex/lib/callLifecycle/purchaseResolutionMaterialize.ts`.

---

## 10. Provider

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the party offering and performing the service. For supported resale purchases, it owes upstream performance to AE. An endpoint alone does not establish identity.

**Relationships:** owns Offerings, Sources, connections, Publications; performs the Tool; holds Provider obligations and Payouts. Not Seller.

**State machine:** no single Provider-row lifecycle. Inventory and offboarding are on child objects. Offboarding case (workspace leaving the market):

```text
Freezing → Draining → Waiting for obligations → Revoking connections → Verifying cleanup → Retired
    ├── Action required (resume)
    └── Cancelled
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Operating (no case) | Publications may be active | Receive Calls | Provider | Publish / withdraw / earnings | Continuous | **PARTIAL** — workspace **IMPLEMENTED**; demand inbox **CHARTER** |
| Offboarding in progress | Case opened; routeability freeze may be on | Blockers listed | Provider resolves blockers; platform drains | `supply.offboarding.status` / `resume` | Per step | **IMPLEMENTED** — `ProviderOffboardingState` in `src/modules/capability-supply/provider-offboarding.ts` |
| Action required | A step blocked (`routeable_tools_remain`, `calls_remain`, `obligations_remain`, `payout_resolution_required`, …) | Frozen until facts change | Provider | Resume after fixing blocker | After drain/settle | **IMPLEMENTED** — `ProviderOffboardingBlocker` |
| Retired / Cancelled | Case finished or cancelled | No longer supplying | — | Historical earnings only | Terminal | **IMPLEMENTED** — `projectStatus` in `convex/lib/providerOffboarding/caseState.ts` |

**NOT:** Seller; payment recipient; a Source URL; “the listing.”

**Grade + cite:** **PARTIAL** — offboarding machine **IMPLEMENTED**; journey 4 “reach relevant buyers” **CHARTER**.

---

## 11. Seller

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the party contracting with the customer and responsible for the stated delivery condition and buyer remedy. AE is the Seller for supported principal-reseller purchases.

**Relationships:** distinct from Provider and payment recipient. Constant `AGENTIC_ECONOMY_SELLER_REF` in `purchase-resolution.ts` when a resolution record is built.

**State machine:** none. Identity fact on a purchase, not a lifecycle.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Bound on resolution | Seller ref written | Explainable as AE sale | — | Show on receipt when record exists | At materialize | **PARTIAL** |
| Missing on Quote DTO | `parties` optional | Buyer may not see Seller | — | Do not invent | **CHARTER** gap | **CHARTER** |

**NOT:** the Provider; whoever received USDC; Agentic Economy-as-runtime.

**Grade + cite:** **CHARTER** for complete buyer-facing Seller identity ([PRODUCT.md](../../PRODUCT.md) implementation boundary); **PARTIAL** — `AGENTIC_ECONOMY_SELLER_REF`.

---

## 12. Payment recipient

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the party receiving a particular payment. It may differ from both Provider and Seller. Do not infer a commercial role from a wallet address.

**Relationships:** `paymentRecipientRef` on purchase resolution; collision with seller/provider refs is refused (`party_role_collision`).

**State machine:** none.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Distinct on resolution | Three party refs differ | Settlement may still be pending | — | Show as recipient, not Provider | At materialize | **IMPLEMENTED** (guard) — `buildPurchaseResolutionRecord` |
| Collided | Builder refuses | No resolution row | Platform / support | Fix publication identity | Until republish | **IMPLEMENTED** |

**NOT:** Seller; Provider; “the wallet.”

**Grade + cite:** **PARTIAL** — guard **IMPLEMENTED**; buyer-visible recipient on every receipt **CHARTER**.

---

## 13. Charge

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the buyer-facing ledger event that bills the caller’s Account for one Call.

**Relationships:** one Call; distinct from payment rail settlement, invoice, and Refund. `ChargeState` on usage.

**State machine:**

```text
(none yet) ──► free_tier | paid | insufficient_credit | outcome_unknown
 paid ──► refunded
 outcome_unknown ──► paid | refunded | (stays unknown)
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Free tier | A$0.00 usage recorded | Balance unaffected | — | Use output | Terminal | **IMPLEMENTED** — `ChargeState` in `src/modules/money/internal/money-types.ts` |
| Paid | Buyer consideration booked | Payment rail may still be settling Provider leg | — | Inspect receipt | Usually terminal for buyer Charge | **IMPLEMENTED** |
| Insufficient credit | Call stopped pre-effect | A$0.00 charged | Customer | Fund, then new Quote | Immediate | **IMPLEMENTED** |
| Outcome unknown | Money movement not conclusive | Do not assume Charge or refund | Agent/owner | Reconcile same Call | Until usage updates | **IMPLEMENTED** |
| Refunded | Charge reversed | See Refund / reserved release | — | Confirm available credit | Until reserved released | **IMPLEMENTED** — still not purchase resolution by itself |

**NOT:** payment; invoice; debit; Provider obligation; purchase resolution.

**Grade + cite:** **IMPLEMENTED** — `strictChargeStateSchema` in `src/modules/money/public.ts`; `callChargeStateSchema` in `call-contracts.ts`. Production money **CHARTER** hold.

---

## 14. Provider obligation

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the amount Agentic Economy owes the Provider under the upstream arrangement for a Tool; distinct from buyer consideration and from its eventual Payout.

**Relationships:** per Call (`moneyProviderObligations`); USDC units; `payoutEligibility: 'ineligible_x402'` in current schema (managed x402 not payout-eligible from this row).

**State machine:**

```text
accrued ──► held ──► payable ──► settled
                 ├──► reversed
                 └──► disputed
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Accrued / held | Upstream obligation recorded | Not yet payable or held for KYC/threshold | Platform | Wait; Provider watches earnings | Policy | **IMPLEMENTED** — schema union in `src/modules/money/internal/convex-schema.ts` `moneyProviderObligations.state` |
| Payable | Eligible to move toward Payout | Transfer may not have started | Platform / Provider payout setup | Payout dest | Payout states | **IMPLEMENTED** |
| Settled | Obligation closed as paid upstream | Distinct from buyer Charge settled | — | Reconcile earnings to Call | Terminal | **IMPLEMENTED** |
| Reversed | Obligation undone (often with buyer refund) | May block offboarding until clean | — | Confirm Refund separately | Terminal | **IMPLEMENTED** |
| Disputed | Obligation contested | Purchase resolution can be `disputed` | Support / Provider | Do not payout | Until resolved | **IMPLEMENTED** (state); operator UX **PARTIAL** |

**NOT:** buyer Charge; earnings balance; Payout transfer; delivery.

**Grade + cite:** **PARTIAL** — states **IMPLEMENTED**; complete AU obligation + tax documents **CHARTER**. Current payout eligibility pinned `ineligible_x402`.

---

## 15. Payout

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the transfer of accrued Provider earnings off the ledger.

**Relationships:** after obligations are payable; gated by payout account onboarding. Distinct from settlement-as-delivery.

**State machine (account):**

```text
missing | not_started → onboarding_started → submitted → ready
                                              └──► restricted
```

**State machine (payout / transfer):**

```text
review | held_kyc | held_threshold → transfer_pending → paid
                                 ├──► failed | reversed | outcome_unknown
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Not started / onboarding | No ready payout account | Cannot transfer | Provider | Connect payout | Stripe / Connect return | **IMPLEMENTED** — `PayoutAccountState` in `money-types.ts`; `supply-action-schemas.ts` `payoutSchema` |
| Ready + review / held | Earnings exist; held for KYC or threshold | Waiting | Provider completes KYC or waits for minimum | Status poll | Policy | **IMPLEMENTED** — `PayoutState` |
| Transfer pending | Transfer submitted | Rail in flight | Wait | Poll | `transferStatus` | **IMPLEMENTED** |
| Paid | Transfer succeeded | Earnings reduced | — | Reconcile to Calls | Terminal for this transfer | **IMPLEMENTED** |
| Failed / reversed / unknown | Transfer did not complete cleanly | Money may be held | Provider / support | Retry or wait; do not assume paid | Until new status | **IMPLEMENTED** |
| Connect return “verified” | Checkout/onboarding session verified | Account may still be `submitted` / `restricted` | Provider | Confirm `accountState: ready` | Poll | **PARTIAL** — toast trap, see § Ambiguous UI traps |

**NOT:** withdrawal of customer credit; buyer refund; delivery; “settlement” when meaning the buyer Charge.

**Grade + cite:** **PARTIAL** — enums **IMPLEMENTED** (`supply-action-schemas.ts`, `moneyPayoutPolicy.ts` host); full AU payout + tax **CHARTER**. Offboarding blocker `payout_resolution_required`.

---

## 16. Publication

**Definition** ([CONTEXT.md](../../CONTEXT.md) § Supply and recovery): the Provider act of admitting and sealing a callable Tool version.

**Relationships:** seals a Tool version from an Offering + binding + Source/connection. Withdraw/recheck/republish carry `publicationRef` + revision.

**State machine (lifecycle row):**

```text
inactive ──► active ──► withdrawn
                   └──► incompatible
```

Owner inventory projection (`ProviderToolState`):

```text
Draft → Needs setup → Submitted → Under review → Published ⇄ Paused
                         └── Action required                 └── Retired
```

Internal publication disposition (`current` | `withdrawn` | `incompatible` | `superseded`) and health/credential substates are **internal**. User-facing: map `current` → **Published**, `superseded` → **Replaced by a newer publication**.

Publish action result `state: 'Submitted'` means the *command was accepted*, not that the Tool is routeable.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Draft / needs setup / inactive | No sealed callable version | Funnel incomplete | Provider | Preview, connect, attest, publish | Funnel | **IMPLEMENTED** — `ProviderToolState`; `INITIAL_PUBLICATION_LIFECYCLE` |
| Submitted / under review | Publish command accepted | Validation / review | Platform; Provider waits | `supply.status` | Recheck | **IMPLEMENTED** — `supplyPublishResultSchema.state: 'Submitted'` |
| Active / published / routeable | Lifecycle `active`; inventory Published | Buyers can Quote | Provider may pause/withdraw | Watch Calls | Readiness window | **IMPLEMENTED** — `publicationLifecycleSchema` |
| Paused | Owner paused routeability | Not newly callable | Provider | Republish / unpause | Immediate | **IMPLEMENTED** — `ProviderToolState` `Paused` |
| Withdrawn | `supply.withdraw` | Catalogue should stop offering new Calls | Provider | Republish if intended | Immediate | **IMPLEMENTED** — `supplyWithdrawResultSchema` |
| Incompatible | Recheck found drift | Not current | Provider | Fix source, recheck, republish | After recheck | **IMPLEMENTED** — `disposition: 'incompatible'` |
| Action required / retired | Blockers or offboarding | Not selling | Provider | Resume or leave retired | Offboarding | **IMPLEMENTED** |

**NOT:** Listing; registry import; a Call; earnings.

**Grade + cite:** **PARTIAL** — machines **IMPLEMENTED** (`supply-action-schemas.ts`, `provider-tool-status.ts`, `internal/publication/lifecycle.ts`); signed-in publication proof still a programme gap (job map J-P01).

---

## 17. Listing

**Definition** ([CONTEXT.md](../../CONTEXT.md)): catalogue / admission fact distinct from Tool, Publication, Source, and Offering. In source, listing is a **merchandising tier** derived from publication authority, never stored as a lifecycle.

**Relationships:** `listingTier` on the public Tool projection; derived by `listingTier()` from publisher mode.

**State machine:** none as a purchase object.

```text
reviewed   ← provider_owned | ae_curated_external
listed     ← third_party_gateway | observed_external
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Reviewed | 1P or AE-curated provenance | Shown with reviewed merchandising | Buyer inspects terms anyway | Compare / Quote | On republication | **IMPLEMENTED** — `LISTING_TIERS` in `internal/tool-projection-types.ts`; `listingTier` in `internal/publication/provenance.ts` |
| Listed | Gateway or observed provenance | Must not be treated as admitted execution | Buyer | Confirm AE Call support | On import/publish | **IMPLEMENTED** |

**NOT:** Publication lifecycle; readiness; “verified quality”; a Tool.

**Grade + cite:** **IMPLEMENTED** as tier; **CHARTER** as a distinct catalogue fact users must not confuse with Publication. No Listing-object state machine — **OPEN** if a future dest needs one beyond Tool availability.

---

## 18. Source

**Definition** (CONTEXT.md relationship paragraph): catalogue / admission fact for the imported contract. Preview kinds: `openapi` | `mcp` | `agent_plugin` | `x402` (`source-preview.ts`).

**Relationships:** input to Publication; accessed through a Provider connection. Assessment modes `suggest` | `verify` (`source-first-owner.ts`).

**State machine:** no durable Source lifecycle enum. Preview/assessment is a command result, not a stored object state.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Previewed | Source parsed into candidates | Not published | Provider | Connect, attest, publish | Immediate | **IMPLEMENTED** — `supply.source.preview` |
| Changed out from under draft | Upstream digest drifted | Publish blocked | Provider | Re-preview | Immediate | **IMPLEMENTED** — `kind: 'source_changed'` |
| Unpublished import | Directory metadata only | Not executable | Buyer | Do not Call | — | **CHARTER** / **IMPLEMENTED** (admission rule) |

**NOT:** a Tool; a connection; a Publication.

**Grade + cite:** **PARTIAL** — preview **IMPLEMENTED**; Source-as-durable-object states **OPEN** (only command results exist).

---

## 19. Offering

**Definition** ([CONTEXT.md](../../CONTEXT.md)): portfolio record a Provider manages; may describe multiple Tools; not automatically a callable Tool. Included because the relationship diagram requires it (not in the short vocabulary list as a buyer chrome object).

**Relationships:** parent admission record; Publication binds `offeringRef`. Status stored `active` | `inactive`.

**State machine:**

```text
inactive ⇄ active
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Active | Admission current | Bindings may publish | Provider | Publish Tool versions | On eligibility write | **IMPLEMENTED** — `src/modules/capability-supply/internal/convex-schema.ts` offering `status` |
| Inactive | Quarantine / revoke / offboarding | Not a basis for new routeable Tools | Provider | Restore eligibility or retire | Immediate | **IMPLEMENTED** — `offeringStatusAfterBindingQuarantine` |

**NOT:** Tool; Listing; Publication.

**Grade + cite:** **IMPLEMENTED** as `active`/`inactive`; users should hear **offering active** vs **offering withdrawn**, never “Tool deleted” unless the Tool publication is withdrawn too.

---

## 20. Provider connection

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the authorised upstream access path. Not merged with Tool or Offering.

**Relationships:** scoped to a business + Source kind (`http_credential` | `mcp_oauth` | `x402`).

**State machine:**

```text
active ──► reauthorization_required ──► active
      ├──► revocation_pending ──► cleanup_required ──► revoked
      └──► revoked
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Active | Connection usable | Calls may dispatch | Provider | Keep healthy | Health probes | **IMPLEMENTED** — `providerConnectionLifecycleSchema` in `supply-action-schemas.ts` |
| Reauthorization required | Token/authority stale | New publishes/Calls that need the connection fail | Provider | `supply.connection.reconnect` | After OAuth return | **IMPLEMENTED** |
| Revocation pending / cleanup required | Revoke started | Secrets/sessions still draining | Platform + Provider | Wait; do not reuse | Offboarding / revoke worker | **IMPLEMENTED** (internal-ish; show **Disconnecting**) |
| Revoked | Access dead | Tools needing it become setup-required | Provider | New connection | Terminal | **IMPLEMENTED** |

**NOT:** Provider identity; payment recipient; Agent credential.

**Grade + cite:** **IMPLEMENTED** — `providerConnectionLifecycleSchema`. User label for `cleanup_required`: **Disconnecting — finish cleanup**, not “revoked.”

---

## 21. Service request

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the outside contribution an agent needs and the constraints it must satisfy — not the larger project, not an HTTP request.

**Relationships:** journey 5 matching eligibility; 30-day window from original `createdAt`; no auto-purchase ([PRODUCT.md](../../PRODUCT.md)). Actions: `marketDemand.record` / `list` / `status` / `withdraw`.

**State machine (intended user-facing):**

```text
recorded ──► open (matching) ──► matched (candidates; still no purchase)
                           ├──► withdrawn
                           └──► expired (window ended)
```

**Source truth:** create `recorded` | `replayed`; status `open` | `matched` | `not_found`; withdraw `withdrawn`. Stored schema `market-demand-signal:v1` | `market-demand-withdrawn:v1`. Expired and withdrawn **read as `not_found`** on status (`market-demand.actions.ts`). That collapses the machine for humans.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Recorded / open | Bounded query stored; `matchedCount: 0` | Matching eligible 30 days | Platform may later match; Customer may withdraw | Keep searching or wait | Window end = `createdAt + MARKET_REQUEST_ACTIVE_WINDOW_MS` | **IMPLEMENTED** — `marketRequestStatusResultSchema.kind: 'open'` |
| Matched | Status found ≥1 current Tool | Still **not** a Quote or Call | Customer / Agent | Compare / Quote deliberately | Until withdraw or expiry | **IMPLEMENTED** — `kind: 'matched'` |
| Withdrawn | Owner withdrew; query text stripped | Matching stopped | — | New request needs new idempotency key | Terminal | **IMPLEMENTED** (mutation); status **hides** this as `not_found` — **OPEN** for a user-facing withdrawn dest |
| Expired | `now >= createdAt + 30d` | Matching stopped | Customer | Record a new request if still needed | Terminal | **CHARTER** window **IMPLEMENTED** as clock; user-facing **Expired** kind **OPEN** (returns `not_found`) |
| Replayed create | Idempotent recreate | Same `requestRef` | — | Use existing | — | **IMPLEMENTED** |

**NOT:** a public RFP; project memory; an automatic purchase; a Call.

**Grade + cite:** **PARTIAL** — `src/modules/market-demand/market-demand.actions.ts`; schema in `internal/convex-schema.ts`. Provider inbox and proactive notify **CHARTER** / **OPEN**.

---

## 22. Service comparison

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the exact Tool versions considered, which are viable or excluded, and why. Keep provenance and caller-specific restrictions visible.

**Relationships:** precedes Quote; journey 2. API `registry.tools.compare`.

**State machine:** none stored. Comparison is a request/response, not a durable object.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Compared | Normalised projection returned | Reversible; no money | Customer / Agent | Exclude, inspect, Quote, or record no-fit | Immediate | **IMPLEMENTED** (machinery) |
| Invalid set | Validation failed | No comparison record | User | Remove incompatible refs | Immediate | **IMPLEMENTED** |
| Retained comparison record | CHARTER object with exclusions + reasons | Would support explain/repeat | — | — | — | **CHARTER** — no durable comparison row in source |

**NOT:** ranking; a quality score; a Quote.

**Grade + cite:** **PARTIAL** — compare **IMPLEMENTED**; durable service-comparison record **CHARTER** / **OPEN**.

---

## 23. Outcome records

**Definition** ([CONTEXT.md](../../CONTEXT.md)): AE observations and, only where explicitly supported later, customer reports about delivery, payment, latency, use and recovery. Preserve sources.

**Relationships:** attached to a Call; Package 4 automatic observations. Not a universal quality score.

**State machine:** none independent of Call.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Recorded (automatic) | Call completed or refused with evidence | Available on receipt | Customer / Agent | Use for later compare (**CHARTER** consumer) | At Call terminal | **PARTIAL** — `outcomeRecordLabel` in `call-receipt-view.ts` |
| Open / uncertain | Reconcile required | Do not score | Reconcile | Same Call | Until closed | **IMPLEMENTED** (label) |
| Buyer-reported use | — | — | — | — | — | **CHARTER** |
| Allocation aggregates | — | — | — | Repeat match | — | **CHARTER** |

**NOT:** project memory; a star rating; proof of purchase resolution.

**Grade + cite:** **PARTIAL** — automatic Call evidence **IMPLEMENTED**; buyer reports and selection consumer **CHARTER** ([PRODUCT.md](../../PRODUCT.md) § Agent operating model).

---

## 24. Suggested next action

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the single machine-executable next step permitted by a non-terminal response, with durable arguments and retry safety. After possible dispatch, must not offer a fresh Call as a retry.

**Relationships:** metadata on Quote refusal, Call pending/reconcile, funding, supply. Optional customer handoff (e.g. `/agent-access`).

**State machine:** ephemeral. Present or absent on a response. Not a stored object.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Present | Non-terminal result | Exactly one executable continuation | Agent (or Customer if handoff) | Perform that action only | Until state changes | **IMPLEMENTED** — quote continuations; Call `nextAction`; funding `nextAction` |
| Absent (terminal) | Call/quote finished | No continuation required | — | Inspect record | — | **IMPLEMENTED** |
| Illegal “retry as new Call” | — | Must not appear after dispatch | — | — | — | **CHARTER** invariant; recovery UI enforces same-Call actions |

**NOT:** a second Call; a procurement workflow; chat memory.

**Grade + cite:** **IMPLEMENTED** as response metadata; **CHARTER** as the interaction rule.

---

## 25. Prepaid balance (available / reserved)

**Definition** ([CONTEXT.md](../../CONTEXT.md)): AUD-denominated contractual value available to an Account for future AE sales. **Available balance** can be reserved for a new Call. **Reserved balance** is atomically set aside for an accepted Quote/Call until captured or released. Not cash, token, wallet, or authority.

**Relationships:** Account-level; shared across Agents; Spending policy still applies. Corporate USDC treasury is not this balance.

**State machine (user-facing money):**

```text
available ──► reserved (on accepted Call) ──► captured (Charge paid / free_tier)
                                        └──► released (refund / cancel without capture)
pending top-up: pending | outcome_unknown
account: active | locked
```

Ledger addresses `accounts:…:available` and `calls:…:buyer_reserved` are **internal**. Owner credit UI currently headlines **Available credit** only.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Available | Credit posted or released | Can reserve for a new Call | Agent Quotes | Quote shows `account.available` | On funding/Call | **IMPLEMENTED** — quote `account.available`; `CreditAccountViewSchema.balance` |
| Reserved | Call accepted; capacity set aside | Concurrent Calls cannot use it | Wait for Call money path | Do not top-up-as-fix for this Call | Until capture/release | **CHARTER** + ledger **IMPLEMENTED**; **OPEN** as a first-class credit-screen field (not in `CreditAccountViewSchema`) |
| Pending top-up | Funding command reserved | Checkout or rail in flight | Customer completes payment | Funding session dest | Poll 5s | **IMPLEMENTED** — `pendingTopup.state` `pending` \| `outcome_unknown` |
| Locked | Account locked | Do not treat as spendable | Customer / support | See Account | Until unlocked | **PARTIAL** |
| Outcome unknown (top-up) | Payment readback inconclusive | Do not double-pay | Customer | Poll same session; contact support | Until ready/failed | **IMPLEMENTED** |

**NOT:** Spending policy; USDC wallet; authority; a Charge.

**Grade + cite:** **PARTIAL** — available + pending top-up **IMPLEMENTED** (`src/modules/money/public.ts` `CreditAccountViewSchema`; `AeOwnerCredit.tsx`); reserved as user-visible split **CHARTER** / **OPEN**. Production money **CHARTER** hold.

---

## 26. Refund

**Definition** ([CONTEXT.md](../../CONTEXT.md)): the ledger reversal of a Charge. Not a chargeback or clawback.

**Relationships:** follows a Charge; receipt `state: refunded` and `refundState` `released` | `not_applicable` | `unknown`. May run **after** Call `cancelled`.

**State machine:**

```text
(none) ──► refunded (Charge reversed)
              └── refundState: unknown → released | not_applicable
```

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Unknown | Refund initiated or implied; release not confirmed | Reserved credit may still be held | Wait | Same Call receipt | Worker | **IMPLEMENTED** — `refundState: 'unknown'` |
| Released | Reserved credit returned to available | Balance should rise | Customer | Confirm Available credit | Near-term balance refresh | **IMPLEMENTED** — `call-receipt-view.ts` moneyMovement |
| Not applicable | No Charge to reverse (e.g. never reserved / free tier) | Call may still be cancelled | — | Do not expect a credit increase | Terminal | **IMPLEMENTED** |
| Refunded Charge | `chargeState: refunded` / receipt `refunded` | See refundState | — | Purchase status may show refunded | Until release | **IMPLEMENTED** |

**NOT:** Call cancellation; purchase resolution; chargeback; Provider obligation reversal (related but separate).

**Grade + cite:** **IMPLEMENTED** — `callReceiptStateValues`, `refundState`; **PARTIAL** UX if cancel is shown as failed/complete before `released`.

---

## 27. Funding session

**Definition:** the customer-facing top-up handoff that adds prepaid credit. Not in the short CONTEXT vocabulary list; it is the object dest `FLOW-FUNDING` explains. Config asserts `payerGainsAuthority: false`.

**Relationships:** increases Available balance; never grants Spending policy.

**State machine:**

```text
(create session) → awaiting_payment → processing → ready
                                 ├──► expired
                                 └──► failed
```

Create result is `kind: 'funding_session'` with **`success: true`** while unpaid — that flag means “session created,” not “credit posted.”

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Awaiting payment | Session + checkout URL created | Unpaid | Customer (or payer) | Open checkout | `pollAfterMs: 5000`; `expiresAt` | **IMPLEMENTED** — `fundingHandoffStatusResultSchema` in `src/modules/money/funding-handoff-schemas.ts` |
| Processing | Rail accepted or still confirming | `paymentStatus` unpaid or paid | Wait | Poll | 5s | **IMPLEMENTED** |
| Ready | Paid and usable amount posted | Credit available | Agent may Quote | Continue work | Terminal | **IMPLEMENTED** |
| Expired | Unpaid past expiry | No credit | Customer | Create new session | Terminal | **IMPLEMENTED** |
| Failed | Payment failed | No credit | Customer | Create new | Terminal | **IMPLEMENTED** |

**NOT:** authority; a Call; Seller onboarding Connect (different session).

**Grade + cite:** **IMPLEMENTED** — `funding-handoff-schemas.ts`; `PublicFunding.state` in `funding-return.view-model.ts`. Production checkout **CHARTER** hold.

---

## 28. Request authorization / Approval

**Definition** ([CONTEXT.md](../../CONTEXT.md)): authorization bound to one specific customer request; may be a recorded Approval. Unlike a Spending policy, it does not grant reusable permissions.

**Relationships:** can admit a Call without a standing policy being universal. Owner handoff `kind: 'authorize'` on some Call refusals.

**State machine (Approval as a decision):** approve | deny (plus expiry of the request). OAuth grant statuses above remain **internal**.

| Material state | What happened | Happening now | Who acts | Next | Update | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Required | Call/quote needs Approval | Blocked | Customer | Approve or deny | Until expiry | **IMPLEMENTED** — `call-approval.functions.ts` `decision: 'approve' \| 'deny'`; Call `needs_authority` |
| Approved | Approval recorded | That request may proceed | Agent | Continue same Call | Immediate | **IMPLEMENTED** |
| Denied / expired | Not granted | No Call effect | Agent | Do not retry as a new silent Call | Terminal for that request | **IMPLEMENTED** |

**NOT:** Spending policy; Quote; funding.

**Grade + cite:** **PARTIAL** — Approval path **IMPLEMENTED**; not every acquisition path requires a standing policy ([CONTEXT.md](../../CONTEXT.md)).

---

## Separate facts table

Funding ≠ authority ≠ purchase ≠ delivery ≠ payment ≠ purchase resolution.

Valid combinations (do not “simplify” these into one badge):

| Funding | Authority | Purchase (Call) | Delivery | Payment / Charge | Purchase resolution | Valid? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Available > 0 | No grant | None | — | — | — | Yes | Funded ≠ allowed |
| Available = 0 | Active policy | None | — | — | — | Yes | Allowed ≠ funded |
| Reserved for Call A | Active | Pending / in progress | Unknown | Outcome unknown | Open | Yes | Money and delivery both open |
| Reserved | Active | Cancelled | Not delivered | Refund unknown / pending | Open or presentation “failed” | Yes | **Cancel ≠ refund complete** |
| Released back | Active | Cancelled | Not delivered | Refunded + released | Released / refunded | Yes | Only now is money closed |
| Available unchanged | Active | Refused `insufficient_credit` | Not delivered | Insufficient credit / N/A | Released if materialized | Yes | No Provider effect |
| Captured | Active | Completed | Delivered | Paid / settled | Completed (if materialized) | Yes | Happy path |
| Captured | Active | Completed | Delivered | Paid; Provider obligation held | Completed buyer-side; payout later | Yes | Buyer close ≠ Provider paid |
| Any | Active | Completed | Delivered | Outcome unknown | Open (`payment_unknown`) | Yes | Do not show Complete as purchase-closed |
| Any | Active | Reconciliation required | Unknown | Unknown | Open | Yes | Suggested next action = reconcile |
| Pending top-up | Active | None | — | Funding processing | — | Yes | `success: true` on session create is not credit |
| Ready credit | Locked account | Blocked | — | — | — | Yes | Account lock ≠ policy revoke |
| Any | Paused (zero limits) | Quote refused | — | — | — | Yes | Policy pause ≠ empty wallet |
| Any | Active | None | — | — | — | Yes | Service request matched ≠ purchase |
| Any | Active | Call refused | Not delivered | N/A | Released | Yes | Failed purchase, no refund needed |
| Any | Revoked mid-flight | Invalidated | Unknown | Outcome unknown | Open | Yes | Reconcile; no fresh Call |

Illegal collapses (never present as one state):

- “Success” = funding session created
- “Complete” = Call result completed while payment unknown
- “Cancelled” = refunded
- “Published” = `supply.publish` returned `Submitted`
- “Matched” service request = Agent may Call automatically
- “Available credit” = Agent may spend (missing policy)
- “Paid” Provider payout = buyer Charge settled

---

## Screen question checklist

Every **KEEP dest** and consequential **PAGE** in [`platform-nav-route-map.md`](./platform-nav-route-map.md) must answer the five questions for the objects it explains.

| Dest ID | Objects it must explain | Five questions focus |
| --- | --- | --- |
| `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET` | Tool, Tool version, Listing, Service request (gap), Service comparison | What is callable vs imported; why this shortlist; no-fit vs empty catalogue |
| `DEST-PUBLIC-FOR-AGENTS` | Agent (door only) | How connection differs from a Customer login |
| `DEST-PUBLIC-FOR-PROVIDERS` | Provider, Publication (door) | Suitability before setup; not a published Tool |
| `DEST-BUYER-AGENTS` | Agent, Spending policy, Request authorization, Approval | Who may spend; paused vs revoked; funding still separate |
| `DEST-BUYER-CALLS` | Call, Charge, Refund, Purchase resolution, Outcome records | List must not use one “status” for delivery+payment+resolution |
| `DEST-BUYER-CREDIT` | Prepaid balance, Funding session, Charge history, Refund | Available vs reserved (**OPEN** gap); pending top-up ≠ ready |
| `DEST-PROVIDER-SUPPLY` | Source, Provider connection, Offering, Publication, Tool, Payout, Provider obligation, offboarding | Submitted ≠ published; earnings ≠ payout |
| `DEST-SHARED-OVERVIEW` | (fold candidate) | Must not invent a sixth status object |
| `DEST-SHARED-TEAM` | Customer actors on an Account | Membership ≠ spending authority |
| `DEST-SHARED-WORKSPACE` | Customer / legal customer | Legal facts ≠ Seller completeness |
| `DEST-SHARED-ACCOUNT` | Agent credentials, recovery | Rotation ≠ new Agent |
| `RES-TOOL` | Tool, Tool version, Listing, Quote (entry) | Price display ≠ Quote; setup_required ≠ buyable |
| `RES-CALL` | Call, Charge, Refund, Purchase resolution, Suggested next action, Outcome records | Five questions in full; cancel vs refund |
| `RES-ASK-THREAD` | Service request / comparison (ephemeral), Tool | Chat “done” ≠ purchase |
| `FLOW-FUNDING` | Funding session, Prepaid balance | Session success ≠ credit ready |
| `RES-PUBLIC-BUSINESS` | Provider, Listing | Shop front ≠ Publication |
| `FLOW-AUTH` / `FLOW-ONBOARDING` | Customer, Account | Login ≠ funded, ≠ authorised |
| `CTX-BUYER-PROVIDER` | Account dual role | Buying vs supplying — **OPEN** placement |
| `DEST-OPS-DISCOVERY` | Tool (API) | Discovery ≠ Call |
| `DEST-OPS-CATALOG-HEALTH` | Publication / Listing health | Operator, not Provider self-serve |
| `DEST-OPS-AUDIT` | Call / Agent / money evidence | Readback, not a user lifecycle |

Consequential dests that are **not** header dests still owe the five questions: `RES-CALL`, `RES-TOOL`, `FLOW-FUNDING`, authorize page under `DEST-BUYER-AGENTS`.

---

## Ambiguous UI traps (source or charter)

These already exist or are licensed by current copy. Do not add more.

| Trap | Why it misleads | Cite | Grade |
| --- | --- | --- | --- |
| `success: true` on funding session create | Session exists; payment unpaid; credit not posted | `createFundingHandoffResultSchema` in `src/modules/money/funding-handoff-schemas.ts` | **IMPLEMENTED** trap |
| Funding config `success: true` | Means config loaded, not that the payer may spend | `fundingHandoffConfigResultSchema` | **IMPLEMENTED** trap |
| Publish result `state: 'Submitted'` | Command accepted; Tool may still be Draft/Needs setup | `supplyPublishResultSchema` in `supply-action-schemas.ts` | **IMPLEMENTED** trap |
| Receipt `complete: true` when `result.kind === 'completed'` | Delivery/output recorded; purchase resolution / payment may be open | `projectCallReceipt` in `call-receipt-view.ts` | **IMPLEMENTED** trap |
| Badge “Complete” on Call summary | Same collapse | `CallSummarySection.tsx` uses `receiptView.complete` | **IMPLEMENTED** trap |
| `BuyerCallPurchaseStatus` `failed` on `cancelled` | Cancel is not a finished refund | `projectFoundCallPurchaseStatus` | **IMPLEMENTED** trap |
| Success-styled “A$0.00 charged” on reconcile blockers | Sounds like a happy money outcome while evidence cannot be submitted | `CallRecoveryPanel.tsx` `ReconciliationBlockers` | **IMPLEMENTED** trap |
| `financialImpactTone` treats any “A$0.00” as success | Insufficient credit and unknown money can be A$0.00 | `CallReceiptPrimitives.tsx` `financialImpactTone` | **IMPLEMENTED** trap |
| Service request status `not_found` for withdrawn and expired | Customer cannot tell “you withdrew” vs “window ended” vs “never existed” | `market-demand.actions.ts` status handler | **IMPLEMENTED** trap; user-facing kinds **OPEN** |
| Toast “Request recorded” on privacy removal | Request submitted, not completed correction | `useRemoveBusinessPage.ts` | **IMPLEMENTED** trap (adjacent dest) |
| Toast “Payout setup verified” | Connect return ≠ `accountState: ready` or `payoutState: paid` | `AeConnectReturnPoller.tsx` | **IMPLEMENTED** trap |
| Toast “Provider profile saved” / “Pricing revision published” | Save/attest ≠ routeable Publication | `useSupplierOnboardingWizard.ts`; `usePriceRevisionForm.ts` | **PARTIAL** trap |
| Market search `status.kind === 'success'` | Search returned items, not a purchase | `tools-search-page.contracts.ts` | Internal; keep off buyer copy |
| Quote refusal `requiredActions[].status: 'required' \| 'pending'` | “Pending” is owner homework, not a paid Call pending | `quote.ts` `requiredActionSchema` | Label carefully |
| Owner credit “Available credit” only | Reserved capacity invisible; looks like full spendable headroom | `AeOwnerCredit.tsx`; `CreditAccountViewSchema` | **CHARTER** / **OPEN** gap |
| Charter “Purchase status” vs internal `terminalState` | Customers must not learn `released`/`disputed` as product jargon | CONTEXT.md Purchase resolution | **CHARTER** |
| Directory import shown as Tool | Metadata ≠ callable | PRODUCT.md x402 clarification; CONTEXT.md Tool | **CHARTER** |

---

## OPEN states that blocked a complete machine

These prevented a closed user-facing state machine. Do not interpolate.

1. **Service request Expired / Withdrawn** — clock and withdraw exist; status API maps both to `not_found`. No dest can answer “what happened” honestly today.
2. **Prepaid reserved** — ledger reserve is real; credit dest has no reserved field. Available-only UI collapses funding states.
3. **Purchase resolution production row** — builder and table exist; materializer may skip (canary, missing quote, `kind: 'open'`). Charter still requires one explicit production record.
4. **Service comparison record** — no stored exclusions/reasons object.
5. **Listing lifecycle** — only a derived merchandising tier.
6. **Source lifecycle** — command results only.
7. **Account unlock** — `locked` is readable; unlock path not specified for humans.
8. **Spending policy paused** — derived from zeros; fine if copy says “paused,” but there is no stored `paused` enum to sync across dests.
9. **Provider match notification** — journey 5 consumer **CHARTER**; do not invent “notified” as a Service request state.
10. **Seller / payment recipient on Quote** — `parties` optional; roles have no lifecycle and incomplete buyer visibility.
11. **`CTX-BUYER-PROVIDER`** — mode switch dest **OPEN**; same Account owns buyer and supply objects.

Internal states users must not see raw: Call `leased`, `gathering_information`, `invalidated` (use labels above); OAuth `issuing`, `delivery_claimed`; publication `superseded`, readiness credential/health substates; Formance account addresses; `payoutEligibility: 'ineligible_x402'` as customer copy.

---

## Sources

- [CONTEXT.md](../../CONTEXT.md) — definitions and collapse traps  
- [PRODUCT.md](../../PRODUCT.md) — chain, modes, implementation boundary  
- Call — `src/modules/capability-execution/call-recovery-contracts.ts` `callStatusStateValues`; `call-history.actions.ts` `callStateValues`; `call-contracts.ts` `callResultKindValues`, `callReceiptStateValues`; `call-receipt-view.ts`  
- Quote — `src/modules/capability-execution/quote.ts`; `internal/convex-schema.ts` `capabilityQuotes.state`  
- Purchase resolution — `src/modules/capability-execution/purchase-resolution.ts`; `convex/lib/callLifecycle/purchaseResolutionMaterialize.ts`  
- Supply — `src/modules/capability-supply/supply-action-schemas.ts`; `provider-tool-status.ts`; `provider-offboarding.ts`; `internal/publication/lifecycle.ts`; `tool-schemas.ts` `publicToolAvailabilitySchema`  
- Spending / Agent — `src/modules/agent-access/policy.ts`; `spending-limit-policy.ts`; `oauth-state.ts`; `account.actions.ts`  
- Credit / Charge / obligation / payout — `src/modules/money/public.ts`; `internal/money-types.ts`; `internal/convex-schema.ts` `moneyProviderObligations`; `funding-handoff-schemas.ts`; `src/components/ae/console/owner-credit/`  
- Service request — `src/modules/market-demand/market-demand.actions.ts`; `internal/convex-schema.ts`  
- Payout policy / offboarding — `convex/moneyPayoutPolicy.ts`; `convex/lib/providerOffboarding/caseState.ts`  
- Companion dests — [`platform-nav-route-map.md`](./platform-nav-route-map.md)
