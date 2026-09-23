# Unidirectional-flow audit

**Scope:** Authoritative state, event/update direction, retry and continuation across the alpha journey.

**Result:** 12 findings — 8 high, 4 medium.

## High severity

| Source | Evidence | Recommendation |
| --- | --- | --- |
| `src/routes/_operator/owner.credit.tsx:59` — `OwnerCreditRoute` | Balance comes from `readAgentDirectoryServer`; `readAccountFundingServer` is only the payment-session port. Agent authority failure therefore controls a separate funding fact. | Read authoritative Account Balance independently and pass it explicitly; Agent directory has no authority over Balance state. |
| `src/routes/_operator/owner.credit.tsx:88` — `load` | Five unrelated reads share one loading flag/unavailable object. Mount, funding readback, document mutations, signing, and refresh can overlap without generation or cancellation guards. | Split Balance, history, constraints, and administration into independent request states; sequence/abort duplicates per resource. |
| `src/components/ae/console/AeOwnerCredit.tsx:86` — `AeOwnerCredit` | Balance and paid Calls are reconstructed from Agent-directory projection; funding is separate; Calls cover only the first directory page. | Use one paginated Account history projection keyed by transaction/Call identity. |
| `src/components/ae/console/AeCreditTopUpPanel.tsx:56` — `AeAccountFundingPanel` | Independent flags can produce a redirect state where the form disappears and no continuation action renders if navigation does not complete. | Use a discriminated funding state; redirecting retains Open checkout or Check status for the persisted locator. |
| `src/routes/fund.$fundingSessionId.tsx:29` — `FundingReturnPage` | Funding fetches once. Processing never advances; awaiting payment lacks the event/action needed to return to Stripe. | Use explicit check events with bounded polling/manual Check this payment; provide resumable checkout or honest guidance. |
| `src/routes/_operator/activity.tsx:132` — `ActivityAvailable` | `activity`/`cursor` mirror loader data but do not reset when invalidation supplies a new loader snapshot. | Use a paginated reducer keyed by loader/query identity, or store only appended pages. |
| `src/components/ae/market/AeX402Directory.tsx:77` — `loadMoreResults` | A non-OK next response sets `isDone=true`; thrown failure clears loading with no failure state. | Advance only on indexed success; preserve cursor/results and expose retry on refused/unavailable. |
| `src/routes/calls.$callRef.tsx:94` — `CallStatusRoute` | Loader result is mirrored into local state through an effect; route-key changes can render the previous Call under the new URL before synchronization. | Key the stateful controller by `callRef` or reset synchronously by route identity; scope optimistic recovery to that reference. |

## Medium severity

| Source | Evidence | Recommendation |
| --- | --- | --- |
| `src/routes/fund.$fundingSessionId.tsx:31` | Network, malformed, non-2xx, invalid, and expired results all become `funding === null` with no retry. | Tag retryable unavailable separately from not-found/expired; preserve locator and retry only the former. |
| `src/routes/_operator/activity.tsx:288` — load more | Failure is only recorded; the view returns to an indistinguishable idle state. | Model idle/loading/failed-with-cursor and show inline Retry while retaining rows. |
| `src/components/ae/console/AeOwnerCredit.tsx:102` — `documentAction` | One string controls create/open/sign for all documents, globally disabling unrelated actions with generic feedback. | Carry operation kind and document/creation identity through started/succeeded/failed events. |
| `src/components/ae/layout/AeOperatorPage.tsx:139` — `NestedOperatorPage` | Page chrome is copied through two effect-driven stores with identity-sensitive cleanup. | Make the persistent shell the single chrome owner or use one keyed reducer consumed by content and sidebar. |

## State-flow contract for alpha

- One authoritative server resource owns each displayed fact.
- Local state records only interaction state or a deliberate optimistic projection.
- Route identity keys every record-specific reducer and mutation.
- Every async event has visible idle, pending, success, retryable failure, and terminal/unknown outcomes as applicable.
- A failed pagination event cannot mutate a list into false completion.
- Known data survives secondary-source and pagination failures.
- Funding, authorization, Call, and recovery states are discriminated so impossible/actionless combinations cannot render.
