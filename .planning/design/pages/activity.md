# `/activity` | Activity

## Register & scene

**Register:** product.

**Scene:** A person returns in the same browser after asking for help, wants to reopen recent work or recover a private record link, and does not want to create an account. The scene is calm and local: warm canvas, one white reading surface, ink, slate, and eucalyptus only for the current action.

## Job & IA position

**One job:** help a signed-out visitor reopen recent session-local threads or find a record using a private link.

- **Route class:** public discovery under IA-1; canonical route `/activity`.
- **Header projection:** `Ask`, `Businesses`, `Activity`, `For agents`; `Activity` is current.
- **Entry points:** shared public navigation, direct URL, or return from a recent thread.
- **Exits:** recent `/t/:threadId` links, validated `/t/:threadId?k=…#record` links, `/` to start a new ask, and `/registry` to browse businesses. <!-- stupid-shit: S1 -->
- **R0 covenant:** no account, sign-in prompt, identity gate, or cross-device promise. Signed-in activity is later scope and is not represented here.
- **Blueprint:** DESIGN.md customer IA pillar; IA-6 focused `max-w-3xl`; LAW-2 durable thread links; private-link boundary from JOURNEY §6.3.

## Layout

**Skeleton:** `AePublicShell` with one `max-w-3xl mx-auto px-4 md:px-6` rail. Section rhythm is `space-y-12`; rows use dividers, not cards. The page has no dashboard sidebar, tabs, metrics, or account chrome.

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AE                 Ask  Businesses  [Activity]  For agents                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                 ACTIVITY                                                     │
│                 Continue from this browser                                   │
│                 Activity here is not an account history.                     │
│                                                                              │
│                 NEEDS ATTENTION                                               │
│                 Need · Needs you · record state             [Open record]    │
│                                                                              │
│                 RECENT WORK                                                   │
│                 Need · Reply received · updated             [Open record]    │
│                 Need · thread state · updated               [Open thread]    │
│                                                                              │
│                 FIND YOUR RECORD                                              │
│                 [Private link................................] [Find record]  │
│                 A handle never grants access; link/session is rechecked.      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile, ≤375px

```text
┌───────────────────────────────┐
│ AE                      [Menu]│
├───────────────────────────────┤
│ ACTIVITY                      │
│ Continue from this browser    │
│ Not an account history.       │
│                               │
│ NEEDS ATTENTION               │
│ Need summary                  │
│ Needs you · record state      │
│ [Open record]                 │
│ ───────────────────────────── │
│ RECENT WORK                   │
│ Need summary                  │
│ Reply received · updated      │
│ [Open record]                 │
│                               │
│ FIND YOUR RECORD              │
│ [Private link...............] │
│ [Find record]                 │
└───────────────────────────────┘
```

## Section anatomy

1. **Page header**
   - **Content:** eyebrow `Activity`; headline `Continue from this browser`; support `Activity on this device is a convenience, not an account history. Records still require their private link or a valid session.`
   - **Data source:** static PRODUCT/DESIGN-authorized copy.
   - **Astryx:** `AePageHeader`, `Heading`, `Text`.
2. **Recent work and records**
   - **Content:** at most the session-local thread and validated-record summaries. Rows show a customer-safe need summary, friendly record state, last meaningful update, and event labels `Reply received` or `Needs you` when authoritative. `Needs attention` groups actionable rows first; it MUST NOT manufacture urgency from age alone. Never show a business reply body, contact details, or private-record payload here.
   - **Data source:** access-safe current-browser/session index of thread references plus non-secret record handles minted by the server only after a validated record visit. This is local convenience state, not account history or access authority.
   - **Astryx:** grouped semantic `<ol>`, `<li>`, `Heading`, centralized `AeStatusBadge`, shared `AeTimestamp`, router-linked `Button`; rows separated by borders.
3. **Find your record**
   - **Content:** labelled private-link field, explanation that the complete link is required, `Find record`, and link-safety copy. Do not ask for a record ID or access key separately.
   - **Data source:** user-entered same-origin `/t/:threadId?k=…` URL, parsed and validated server-side by the thread route's record projection. Legacy `/i/:threadId?k=…` input is accepted only to follow its `301` redirect to the canonical shape. <!-- stupid-shit: S1 -->
   - **Astryx:** `FormLayout`, `TextField`, `Button`, field-local error, `Banner` only for a returned access failure.
4. **Task exits**
   - **Content:** `Start a new ask` and `Browse businesses` when no recent thread is useful.
   - **Data source:** shared route registry.
   - **Astryx:** router-linked `Button` variants; neither imitates sign-in.

## States

- **Loading:** preserve header, one `Needs attention` row shell, one recent-work row shell, and find-record form geometry. Never skeleton a fake need, business, reply, or success state.
- **Empty:** `No recent work is stored in this browser session.` Supporting copy: `If you have a private record link, paste it below. You can also start a new ask.` Actions: `Start a new ask`, then `Browse businesses`.
- **Storage unavailable:** omit recent rows and say `Recent threads are not available in this browser. Private links still open their records.` The find-record form remains usable.
- **Invalid link:** field error `Paste the complete private record link.` Preserve input and focus the field.
- **Access failure:** use the key-granted thread projection’s non-enumerating result: `This record is not available from this link.` Do not reveal whether the thread exists.
- **Temporarily unavailable:** preserve local rows and input. `We couldn’t check that record link right now.` Action `Try again`.
- **Zero JS / SEO:** server-render page copy and task exits. Recent session state may progressively enhance after hydration; its absence is the honest empty state. The form uses a normal GET/navigation to the validated thread route. `/activity` is indexable as a public task page, but recent content is never indexed or emitted in metadata.

<!-- sim: G3 -->
## Record-aware session-index producer contract

The Activity list is a bounded, session-local convenience projection. Its producers and access boundary are locked:

| Authoritative event | Row effect |
|---|---|
| Successful durable thread creation | MUST insert or update one row keyed by `threadId`, after the thread exists. |
| Meaningful validated visit to `/t/:threadId` | MUST update the thread row only after participant-safe status is available. |
| Successful validation and participant-visible render of `/t/:threadId?k=…#record` | The server MUST mint or resolve a non-secret, opaque record handle bound to the record, access context, and session. Activity MAY store that handle and a safe row projection; it MUST NEVER store the raw key or private URL. | <!-- stupid-shit: S1 -->
| Meaningful record event observed after validation | MUST update the handle row’s safe state and event label only when the semantic revision changes. A business reply produces `Reply received`; an authorized customer action produces `Needs you`. |

- The index MUST contain at most 20 rows per browser session. Rows with a current `Needs you` event MUST appear under `Needs attention` at the top; remaining rows order by last meaningful session observation descending. Hydration, time formatting, focus, scroll, polling, retry counters, and projection-version-only changes MUST NOT reorder rows.
- Reobserving a `threadId` or record handle MUST update its single row, never duplicate it. Capacity eviction removes the oldest non-attention row first; ties evict by stable opaque-handle/thread-ID ordering. An unresolved `Needs you` row MUST NOT be silently evicted while a non-attention row remains.
- A record row MAY contain only the opaque handle, participant-safe need/business label, friendly record state, safe event label, last meaningful observation time, and an access-reprompt destination. It MUST NEVER contain `k`, a private-record URL, reply body, customer contact field, sent payload, or internal record identity.
- Opening a record handle MUST NOT grant access. It MUST re-prompt for the private link unless a still-valid session access context can be revalidated server-side. Success resolves the handle to the key-granted thread projection only after that check; failure uses the same non-enumerating result and MUST NOT reveal whether the record exists.
- Storage clearing or session expiry MAY evict every row and invalidates local handle discovery. No account history, background sync, cross-device reconstruction, or handle-to-key recovery may repopulate it.
- Session-local honesty copy MUST remain visible: `Activity on this device is a convenience, not an account history. Records still require their private link or a valid session.`

## Interactions

- `Open thread` is ordinary link-out navigation to the stored stable thread URL; it does not mutate or sync history.
- `Open record` submits only the opaque record handle to the server. It MUST revalidate existing session access or show `Use your private link to open this record`; the handle itself never authorizes reading.
- `Find record` accepts the same-origin canonical `/t/:threadId?k=…` shape and the legacy `/i/:threadId?k=…` redirect shape, strips no key before server validation, and never writes the raw URL or `k` to analytics, logs, local/session storage, traces, error reports, or referrers. <!-- stupid-shit: S1 -->
- On valid submission, navigate to the thread route's key-granted record projection; that route owns validation, key-safe history behavior, focus, and non-enumerating errors.
- Clearing browser/session storage removes only this convenience list; it does not delete threads or records. Do not offer a destructive `Delete records` control.
- Recent rows are grouped with unresolved `Needs attention` first, then ordered by last meaningful session observation. Hydration and formatting changes do not reorder them.
- No background sync, polling, notification permission, sign-in prompt, cross-device merge, or handle-based access grant occurs.

## Copy voice

- **Eyebrow:** `Activity`
- **Headline:** `Continue from this browser`
- **Support:** `Activity on this device is a convenience, not an account history. Records still require their private link or a valid session.`
- **Labels:** `Recent work`, `Needs attention`, `Reply received`, `Needs you`, `Find your record`, `Private link`, `Updated`, `Current status`.
- **Actions:** `Open thread`, `Open record`, `Find record`, `Start a new ask`, `Browse businesses`.
- **Boundary:** `A record handle is not access. Use your private link when asked. Anyone with that private link can read the information it allows. Keep it private.`
- Never say account, inbox, synced, saved everywhere, history across devices, all activity, or recovered unless the corresponding capability exists.

## Responsive

- `max-w-3xl`; `px-4 md:px-6`; one column at every width.
- At ≤375px, each row stacks need, status/time, then a full-width action of at least 44px.
- Long need summaries clamp visually to two lines while the accessible link name includes the full safe summary; no private payload enters a tooltip.
- Private-link input wraps neither outside its field nor into page-level horizontal scroll.
- At 200% zoom, actions remain in flow and no sticky element obscures the form or error.

## Accessibility

- Shared header/nav, one `<main>`, one H1, recent threads `<ol aria-labelledby>`, and a labelled `<form>`.
- Status is text-first with centralized mapping; time uses `<time dateTime>`.
- Form errors use `aria-invalid`, `aria-describedby`, and focus-first-invalid. Returned access failure uses one `role="alert"`.
- Navigation moves focus to the destination H1. Back navigation restores focus to the originating row or form control when available.
- Reduced motion makes focus and state changes immediate. No shimmer, auto-scroll, entrance animation, or pulsing activity indicator.

## Rule compliance

- **R0 / no account:** the page works signed out and makes no sign-in or sync claim.
- **LAW-2 / LAW-6:** stable thread and private-record links remain the durable objects; session-local activity is only a convenience index.
- **LAW-4:** friendly status never implies delivery, reply, or confirmation beyond source state.
- **LAW-8 / DS-13:** empty, storage unavailable, invalid link, access failure, and temporary failure remain distinct and actionable.
- **IA-2:** public header is exactly `Ask`, `Businesses`, `Activity`, `For agents` from the shared registry.
- **IA-6 / IA-7:** focused `max-w-3xl`, named gutters, no dashboard shell.
- **DS-1–DS-8:** Astryx behavior, centralized status, shared timestamps, semantic layout, and geometry-preserving loading.

## Anti-slop check

- No dashboard cards, activity feed theatre, avatar stack, account upsell, empty-state illustration, glass, gradients, giant icon, metric, timeline rail, or decorative motion.
- No fake synchronization, global-history, recovery, or notification claim.
- The page is a quiet local index plus private-link entry, not an account centre or inbox.
