# Shell frame: one job in the open pane

**Status:** proposed. No page code until this is accepted.
**Date:** 2026-09-23
**Thesis:** A signed-in body keeps one job in the eye path. Peer work of similar frequency uses the existing line rail. A second column is the existing sheet. Rare admin is a named disclosure, never a peer tab.

The shell already has the title, the Workspace menu, and the phone bar. The body does not grow a second app.

## The app rule

`TabsList variant="line"` switches peer panels of one page. Settings, Market browse, and a Tool’s Overview / Contract already do this. It is not reserved to settings.

A triage list stays on the open page: Calls, Agents, and the Provider Tool list. Market’s Tools grid sits under a rail because it is one catalogue among Collections, Providers, and Saved. That is browse. It is not the rule for an inventory someone must act on.

Anything that would be a second column uses `Sheet`, the one already on Ask and on a Tool’s schema. Rare administration uses a `<details>` whose summary names what is inside. Credit accounting and Provider administration are that class of work. Neither becomes a tab.

## Spacing, overflow, eye path

Use `gap-intra` (8px), `gap-related` (16px), `gap-section` (32px), and the shell gutter (16px, 26px at the large breakpoint). A change that needs a new step is out of this spec.

Eye path, top to bottom: a status that changes what you can do, then the rail or the list, then the primary action inset by the gutter. The shell header keeps the page title. Credit does not repeat “Credit” in the pane. Ask keeps the title in its own header, because Ask has no operator title slot.

Overflow: a tab label does not wrap. The rail is `max-w-full justify-start overflow-x-auto`. It does not use `overflow-y-hidden`, because the line underline hangs 5px below the trigger and that class clips it. The page scrolls. A panel does not add a second vertical scroller. A table that already scrolls inside its own height keeps that scroll. Ask has one scroll, the transcript, and the composer stays docked.

## Credit

The live page is one `gap-8` stack: balance, top-up, cards, auto-recharge, the monthly cap, invoices, the ledger, then accounting inside a disclosure. The reconciliation warning sits after the ledger.

Three tabs, line rail, one panel in the document, matching settings. Default is Fund.

| Tab | Pane |
| --- | --- |
| Fund | Available credit, then add funds, in the first viewport. Saved cards, auto-recharge, and the monthly cap stay in this pane because they are how money enters and how it is limited. They sit below that viewport at `gap-related`. They are not more tabs. |
| Invoices | Invoice history only. |
| Ledger | Booked credit history only. |

Accounting stays a named disclosure under the rail: “Accounting records and administration”. Documents, reconciliation, and Provider obligations open there. An open reconciliation warning stays above the rail.

The root is `gap-section`. The balance surface is `rounded-card` with gutter padding. `gap-8`, `rounded-xl`, and `border-t` strips inside Fund go away. A hash on first load selects the tab the way settings does. Fund has no nested rail.

## Provider Tools

The Tool list is the page. Add Tool stays the operator action.

Availability and earnings may remain as one status each under the list, at `gap-section`: whether Tools can be called, and whether payouts are connected. The full connection manager and the earnings detail do not expand on the hub. Those actions open a `Sheet`. The live page expands them inline under the summaries. That inline expansion is the second app this spec removes.

Administration stays closed. The summary stays “Provider settings and administration”.

Onboarding uses the parent `gap-section`. The `mb-2` wrapper goes away. This page does not gain a tab rail.

## Ask

The desktop history column comes out. `AeChatPage` is not given a rail. Thread switching is the `Sheet` in `ChatHeader`, at every width. The trigger loses `lg:hidden`.

Eye path: history and new chat in the header, transcript, docked composer. The header keeps `gap-related` and `px-gutter`. Shared read-only chat has no history control.

## Left as they are

- Calls. “Needs attention” stays above “Recent Calls”.
- Agents. A pending approval stays above the directory.
- A Call receipt, including “Use this Tool again”.
- Market rails and its browse rail. A Tool record and its Overview / Contract rail. Settings. Funding return. Add a Tool. Sign-in. Onboarding.
- Workspace close and transfer stay closed.
- Public focus, the legal shell, the FAQ rail, and the auth-stage overflow.
- Spacing on pages this spec does not touch.

## Acceptance

Credit opens on Fund. The balance and add-funds action are in the first viewport. Cards, auto-recharge, and the monthly cap are not. Invoices and Ledger are tabs. Accounting is a named disclosure, not a tab. Provider Tools opens on the Tool list, with availability and earnings as status, and connection or earnings detail in a sheet. Ask has no second column, and the history sheet opens from the header on a wide window. No new component, no new space step, no new radius.
