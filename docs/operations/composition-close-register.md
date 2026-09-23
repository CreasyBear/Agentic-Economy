# Composition close

Parent-written burn-down. [composition-coverage-register.md](./composition-coverage-register.md) stays the decision. Seen, Approach, and Morph are not rewritten here.

A row is **Built**, **Cited**, **Refused**, or **Stale**. Open means the slice has not closed it yet.

## Platform constructors

- **Cited.** Truncating `AeRecordHeader` title. `src/components/ae/layout/AeRecordHeader.tsx`.
- **Cited.** Operator main focus ring on `:focus`. `src/components/ae/layout/AeOperatorPage.tsx`.
- **Cited.** Select trigger `text-base` until `md`. `src/components/ui/select.tsx`. Menu items stay `text-sm`.
- **Cited.** FAQ drops the second `px-6` inside `ae-rail`. `src/components/ae/website/AeSiteFaq.tsx`.
- **Cited.** Utility document: article first, company links after, section headings `tabIndex={-1}`. `src/components/ae/website/AeSiteUtilityDocument.tsx`.
- **Built.** Caption token `0.75rem` and shared price label `text-caption`. `src/styles/globals.css`, `src/components/ae/market/AeToolPrice.tsx`. `text-pretty` on body stays Refused.
- **Built.** Shared button press scale `0.96`. `src/components/ui/button-variants.ts`. Auth-panel and Clerk scales stay `0.98`.
- **Built.** Public document focus after client navigation, skipping the first paint, only `main#main-content[data-shell-mode]`. `src/components/ae/layout/AeAppShell.tsx`. Ask’s main has no `data-shell-mode`.
- **Built.** Auth stage: browser overflow visible on the stage, panel drops `p-page`. `AeSiteAuthStage.tsx`, `AeSiteAuthPanel.tsx`.
- **Cited.** Nested radius on `InputGroup`: child buttons and the `sm` group button use `rounded-[calc(var(--radius)-5px)]`. `src/components/ui/input-group.tsx`. Shared button press scale stays `0.96` on `button-variants.ts`.
- **Built.** Signed-in chrome. One `h1` in `AeAppHeader` from the operator title. `UserButton` is the only header account trigger. `AeOrganizationSwitcher` mounts once in the sidebar footer. `AeOperatorPage` does not paint the breadcrumb band or a sticky `AeRecordHeader`. Description, actions, and `secondaryBar` sit in `operator-page-stack`. Account chips stay in the body. Public pages, Ask, and the minimal shell have no title slot.
- **Stale.** `AeAdminReadbackPanel` and `/admin/index-health` are not in the tree. Live audit is `AdminAuditPage`. No panel is rebuilt.

## `/market`

- **1. Built.** Hero scale is `motion-safe:`. `DirectoryHero.tsx`.
- **2. Built.** “Load more” and “View collection” stay inside the accessible name.
- **3. Built.** The result count is a live region. The comparison tray is a named section. The document title follows the view.
- **4. Built.** An invalid filter marks the field and moves focus to it. Clear and Show results stay pinned.
- **5. Refused.** No second pager.
- **6. Built.** Collections is first and paints only `DirectoryHomeDiscovery`.
- **7. Built.** Clear filters and Show results stay outside the scrolling sheet body.
- **8. Built.** Hero says listed Tools. “Used recently by other agents” stays.
- **9. Built.** Home empty and empty collections say See all Tools. Filtered empty stays.
- **10. Cited.** Caption token and the card price label use `text-caption`.
- **11. Built.** Facet find inputs dropped `text-xs`.
- **12. Refused.** Contrast was not measured.
- **13. Cited.** Shared press scale is `0.96`. Card hover lift stays.
- **14. Built.** The second discovery system and the facet column are gone. Save, Compare, search, and the rails stay.

## `/tools/…`

- **1. Cited.** Inspector focus ring. `AeToolInspector.tsx`.
- **2. Cited.** One status region. `AeDirectoryToolCanonicalPage.tsx`.
- **3. Built.** Price is before the description.
- **4. Cited.** The header is not inside an outer `ae-rail`.
- **5. Cited.** The exit says Browse Market.
- **6. Cited.** Loading says “Loading this Tool…”. The status action says Check status.
- **7. Cited.** The price label uses `text-caption`. `text-pretty` on body stays Refused.
- **8. Refused.** Copy/Check stays a swap.
- **9. Built.** Navigate is “Connect an Agent”. The copy path is “Continue with your Agent”.

## `/t/new`, `/t/$threadId`, `/s/$shareToken`

- **1. Built.** Rename and Delete reveal on `group/item`.
- **2. Built.** Enter still sends. The field says Shift+Enter inserts a newline.
- **3. Built.** Pending status says “Loading conversation…”. The stage title is a heading. Focus stays in the composer.
- **4. Built.** A share that is not finished shows Load earlier messages and advances the cursor.
- **5. Built.** Pending skeletons use the `max-w-3xl` transcript column.
- **6. Built.** Empty title is “Find Tools for an Agent.” The exit is Browse Market.
- **7. Built.** The empty line is compare and inspect, then use one with an Agent. The execute card no longer says “canonical result”.
- **8. Built.** The share URL field uses the shared input size.
- **9. Refused.** Copy/Check and Send/Spinner stay a swap. The nested radius is Cited on `InputGroup`.
- **10. Built.** Empty Ask has no second title. An execute card is one status line and an off-session handoff. No Quote or Call on this session.

## `/agent-access`

- **1. Built.** Revoke modes are radios in the tab order. Both modes stay.
- **2. Cited.** Operator main focus ring. `AeOperatorPage.tsx`.
- **3. Built.** Connect stays enabled until the request starts. An invalid name is marked and focused. Environment is a named group. The name helper and count are described.
- **4. Built.** Empty Connect is the one filled start. The install funnel stays and is not a second filled start.
- **5. Built.** Key reveal scrolls the body. Done stays outside that scroll.
- **6. Built.** The label is Connect an Agent. Spending policy, Edit limits, and Graceful drain are sentence case.
- **7. Built.** The two self-links unmount on this page. The `/for-agents` strings stay.
- **8. Cited.** Caption token and heading scale. Not restyled on Agents alone.
- **9. Built.** Spend inputs dropped `text-sm`. The shared input stays 16px until `md`.
- **10. Built.** Resume Return stays filled. Returning Connect is outline.
- **11. Built.** The waiting dot uses `bg-warning`. The warning alert body was not repainted.
- **12. Built.** One empty start. Approve once stays above the roster.

## `/agent-access/authorize`

- **1. Built.** Approve stays enabled except when targets are unavailable or the request is in flight. The in-flight label stays Approve.
- **2. Built.** Search is marked invalid, the alert points at the field, and Enter runs the search.
- **3. Built.** Focus moves to the outcome when the form is replaced.
- **4. Built.** The grant body scrolls. The decision bar stays on the card, under the facts.
- **5. Built.** Duration reads “for 7 days” on a 7-day grant. The page says Agent. Limits say Calls. A zero-result search says “No Tools match the query”.
- **6. Built.** Truncated tool refs keep `truncate` and set `title` to the full ref.
- **7. Built.** The fact list stays. Application, limits, and duration stay. The bar is not moved above them.

## `/owner/credit`

- **1. Built.** Available credit, then Add funds, stay in the fund section. The monthly cap is outside that stack.
- **2. Built.** Pay is the one filled action. Add card, auto-recharge Save, and resume are secondary. Spend bands stay on the shared warning color.
- **3. Built.** Credit, Credit unavailable, Credit history, Add funds, Set limit, Edit limit.
- **4. Built.** Invalid amounts mark and focus the field. Pay stays disabled until a quote exists.
- **5. Built.** Each switch row is the label and a 44px hit target.
- **6. Cited.** Card initials stay on the caption ledger. Add funds is `text-sm font-medium`.
- **7. Built.** The cap is no longer a peer of Add funds. Invoice and credit history stay. No reserved figure.

## `/activity`

- **1. Built.** Export count, CSV, and JSON leave the opening filter bar. The chips stay.
- **2. Built.** The month summary unmounts when there are no Calls. Load more still appends. No second pager.
- **3. Cited.** One polite live region and stable busy labels stay the shared constructor. Not rebuilt on this page.
- **4. Built.** “Needs attention”, “Last 7 days”, “Last 30 days”, and Calls. “Needs review” stays its own fact.
- **5. Built.** The row leads with the Call, then the Agent, then the Tool, then the receipt. Status, purchase, and payment stay distinct. The chip bar is the only filter.

## `/calls/$callRef`

- **1. Built.** Delivery, payment, and purchase lead as three facts. The filled control is the safe next step. Check status, Get help, and reuse are not that step.
- **2. Built.** Uncertain settlement uses the attention stage. A conclusive settlement stays complete. Refunded or released may keep success.
- **3. Built.** Try again on this Call became Check status. Confirm cancellation became Cancel Call. owner-scoped is gone from the record-read sentences.
- **4. Built.** Copy controls name the fact they copy. Copy/Check stays a swap.
- **5. Cited.** The record title exposes the full name. The 11px command and the shared select size stay the ledger. Not restyled on this receipt.

## `/owner/operations`

- **1. Built.** Empty keeps the wizard. The empty-state Add Tool is not a second start. Header Add Tool is outline until inventory exists.
- **2. Built.** The wizard step is the one filled control on empty. Skip stays outline.
- **3. Built.** Inventory stays first. One row exit opens the Tool. Availability, earnings, and settings stay under the list. Pages replace.
- **4. Built.** The add label is Add Tool. Steps are Provider identity, Payout account, and First Tool. Earnings is not the Stripe blurb.
- **5. Built.** An invalid identity field is marked, described, and focused. Continue stays enabled until the save starts. The connect-return poller can be paused and keeps one status region.
- **6. Built.** Name, website, and ABN dropped `text-sm`. Caption-sized step durations stay the ledger.

## `/owner/operations/new`

- **1. Built.** The completed-step check uses `text-on-brand`. The progress strip stays.
- **2. Built.** Source fields, then Find Tools. A stage change focuses the new `AeSection` heading.
- **3. Refused.** Terms stay one group. Price stays off discover. Candidates replace.
- **4. Built.** Validation marks, describes, and focuses the field. Continue with selected server stays disabled until a remote is chosen. Continue to review stays enabled until the request starts. Remote, candidate, price, connection, and classification groups are named.
- **5. Built.** Person-facing strings say Find Tools and Agentic Economy.
- **6. Built.** The sticky terms price uses `tabular-nums`. The 10px progress numerals cite the caption ledger.

## `/owner/operations/$toolRef`

- **1. Built.** The playground control is Recheck source and stays outline. On a published Tool, Withdraw is the filled action and stays under the facts. Overview, the state heading, and source health stay.
- **2. Cited.** The maintenance step stays under the overview. The header `h1` truncates with `title={title}`. This page does not paint a second rail.
- **3. Built.** The exit is Return to Tools. Confirm labels are Withdraw Tool and Republish Tool. Playground chrome is sentence case. Person-facing errors say Agentic Economy.
- **4. Built.** The document title is the publication name when the Tool is available, and Tool status otherwise. Playground syntax errors stay untied. Load and Reset stay `h-7`.
- **5. Built.** The JSON textarea drops `text-xs`. The shared Textarea stays 16px on a phone.

## `/owner/supply/connections/new`

- **1. Built.** Connect stays enabled until the request starts. An empty submit marks the credential field. A failed HTTP Cancel is shown the same way the MCP panel shows it.
- **2. Built.** Finished copy says start again. The unavailable page does not wear the pending description. Sign in matches the button. Person-facing errors say Agentic Economy.
- **3. Cited.** The header truncates `Connect {hostname}`. The origin stays inline. There is no second heading.
- **4. Refused.** The form and the status panel stay exclusive. `currentPath` stays the focus registration for Add Tool. The environment badge stays.

## `/owner/supply/connections/oauth/callback`

- **1. Built.** The refusal says “This Provider connection was not completed. Return to Add Tool.” The action is “Return to Add Tool.” `owner-mcp-oauth-callback.contracts.ts:3`, `:4`.
- **2. Refused.** `currentPath` stays the focus registration for Add Tool. This page is not folded into Add Tool.
- **3. Refused.** The environment badge stays above the refusal. `AlertTitle` keeps the shared `line-clamp-1`.

## `/$slug`

- **1. Refused.** The catalogue row has no Tool route. An in-app Tool link is not invented. External route, website, and phone stay on the row.
- **2. Built.** The operation path is outline. Website and phone stay outline.
- **3. Built.** The list says Offerings. The phone control says Phone provider. The exit says Browse Market. Empty keeps the profile.
- **4. Built.** External links name the offering and say they open a new tab.
- **5. Built.** Listed and ready stay on the header. Tools and Ready are off the first-screen strip. Offerings replace.

## `/owner/team`

- **1. Refused.** Invite and change role are not actions on this page. `listDirectory` stays a query. The roster stays.
- **2. Built.** The section heading is Team. The header title was already Team.
- **3. Built.** Copy email names the person. The count stays quiet until the directory is known. Copy and Check stay a remount.
- **4. Built.** The filter search drops `text-sm`.
- **5. Refused.** The directory is one roster. A pager is not added.

## `/owner/settings`

- **1. Built.** Profile, Recovery, and security history lead. Team, Business, Privacy, and email alerts stay. Recovery no longer leaves for Agents or operations. Session revoke stays in Profile.
- **2. Built.** Tax inputs drop `text-xs`. Sign out uses the section heading size. The auth display scale stays on the auth stage.
- **3. Built.** Recovery says sessions and Profile. Alert labels name the email that sends.
- **4. Built.** Tax Save stays enabled until the request starts. An invalid submit marks and focuses the field. The three low-balance amounts are one radio group.
- **5. Built.** The section chips peek. Security history still appends. A pager is not added.

## `/owner/workspace`

- **1. Cited.** Destructive color stays on Close. Transfer’s confirm stays the ordinary primary. The panels stay separate.
- **2. Built.** Close and Transfer each sit behind their own trigger. The workspace name sits beside the confirm field. Close stays disabled until the name matches. Tax stays on Account.
- **3. Built.** Close copy states the consequence and does not invent a balance. Fence lines name the next step. An empty transfer list says nobody else can receive ownership and points at Team.
- **4. Cited.** The resting danger zone is not an alert. A close failure shows inside the dialog.
- **5. Cited.** The panel titles match the Danger zone heading. The transfer select cites the shared select size.

## `/developers/discovery`

- **1. Built.** Artifact status leads. Catalog facts, source, and read paths follow. Per-row code blocks are unmounted. Header artifact buttons are gone. Each row keeps origin, one status, the check time, and one open.
- **2. Built.** The description no longer promises unavailable-capability reasons. Opens are Open schema and Open examples. Fresh and Discovery current are Current.
- **3. Built.** Each open names its artifact. An empty facts rail uses a paragraph title. The rail heading stays.

## `/developers/api`

- **1. Cited.** Public document focus after client navigation, skipping the first paint, only `main#main-content[data-shell-mode]`. `AeAppShell.tsx` `usePublicDocumentFocus`. The API page uses the document `main`. Ask’s main has no `data-shell-mode`.
- **2. Built.** Requests lead, grouped by the OpenAPI tags already in the source: Call gateway, Tool market, Funding, Businesses, Platform. Errors stay a second grid. The list is not sliced.
- **3. Built.** Setup stays on the page after Requests: version, authentication, and ExactAmount. Tool, Quote, and Call stay three nouns.

## `/admin/index-health`

- **1. Stale.** `AeAdminReadbackPanel` is gone. It is not rebuilt.
- **2. Stale.** `AeAdminReadbackPanel` is gone. It is not rebuilt.
- **3. Stale.** `AeAdminCatalogHealthPage` and `AeAdminReadbackPanel` are gone. There is no `/admin/index-health` route. The live admin index is Overview.
- **4. Stale.** Those files are gone. `SourceAuthorityReviewPanel` lives on the provider object, not this heading.

## `/admin/audit-events`

- **1. Stale.** `AeAdminReadbackPanel` is gone. The live table does not use View reference. The panel is not rebuilt.
- **2. Cited.** The resting readback alert is gone with that panel. This page hides the shared count bar, so there is no count paragraph to announce.
- **3. Cited.** The event table already leads. It shows time, event, the existing actor, target, outcome, and correlation. No catalog-health cells. No pager added.
- **4. Built.** The page stays Audit. The section is Audit events. Empty says no audit events. Denial says Admin access is required and returns to Overview.

## `/for-agents`

- **1. Built.** The filled button is Start setup and stays on this page’s setup. Open Agents, Set a Spending policy, and browsing Tools are unmounted. Claude Code and Cursor stay in the disclosure.
- **2. Built.** The alternatives trigger matches the plain troubleshoot trigger. The FAQ inset stays the cited `AeSiteFaq` ledger. The step border stays.
- **3. Built.** The door says Agent, Tool, and Spending policy. Account connection does not set a Spending policy.
- **4. Cited.** The setup kicker uses the caption token. `AeCollectionRail.tsx` `text-caption`. Not bumped on this page.

## `/for-providers`

- **1. Built.** Manage listed Tools is unmounted. Proof titles stay facts and do not open Market. Add Tool stays the one filled start. The requirements stay.
- **2. Built.** The FAQ names Add Tool. Person-facing copy says Agentic Economy. Setup checks are not Calls.
- **3. Built.** The steps block keeps the rail name. The ordered steps stay a list. Proof rows are not numbered.
- **4. Cited.** Rail kickers use the caption token. `AeCollectionRail.tsx` `text-caption`. The FAQ inset stays the cited `AeSiteFaq` ledger. Not bumped on this page.

## `/about`

- **1. Built.** The explanation leads. One onward is Browse Tools. The opening pair and the end pair are gone. The principle cards stay.
- **2. Built.** Customer, Agent, Tool, and Call stay distinct.
- **3. Built.** The ABN link says it opens in a new tab.

## `/privacy`

- **1. Built.** The analytics sentence no longer names a footer control. Complaints email is a mailto link. Section headings already take focus.
- **2. Built.** The privacy request stays the action. Email and the OAIC stay in the prose.
- **3. Built.** The two commercial sentences name Call, Customer, and Provider. The rest of the notice stays.

## `/privacy/remove-business`

- **1. Built.** The path cards are unmounted. The title is Remove a Business. The form and one Submit stay.
- **2. Built.** The empty-note error uses What should change? The default reason is Remove Business. Provider stays Provider on the other reasons.
- **3. Built.** The email field autocompletes. A recorded request is polite status. A field error stays on the field.
- **4. Cited.** The reason select uses the shared select size: `text-base` until `md`, then `text-sm`. `src/components/ui/select.tsx`. Not patched on this page.

## `/terms`

- **1. Cited.** The article leads. Company links follow. Section headings can take focus.
- **2. Built.** The three named sentences keep Agent, Tool, Call, purchase, and Provider distinct.

## `/support`

- **1. Built.** Email support is the one filled action. Open this Call and Open Calls are outline. The public-issue control sits outside the private section and says it opens in a new tab. A brought Call stays on the banner.
- **2. Built.** The status line does not name a Call or a retry when none was brought. The description says Call reference. The Agent control says Review Agent connection.
- **3. Built.** The public-issue link says it opens in a new tab. The link stays.

## `/status`

- **1. Built.** On failure, Refresh is the filled action. Recovery is outline and points at Help. The check list and the per-row times stay.
- **2. Built.** The intro says whether the platform is up. The clock is Last checked. A failed check does not send you to Calls.
- **3. Refused.** A non-operational check keeps the destructive badge. The badge still says Degraded. Color is not the only cue. Unmeasured contrast is not a repaint.

## `/fund/$fundingSessionId`

- **1. Cited.** The invalid link says Open Credit if you own the Account. A settled session leaves with Open Agents. Unconfirmed and refresh-failed copy stays unknown. `funding-return.contracts.ts`. `AeFundingReturnState.tsx`.
- **2. Built.** One `AePageState`. Its text changes with the outcome. Checking moves focus to that title. `AeFundingReturnState.tsx`.

## `/fund/cancelled`

- **1. Built.** The body says no Account credit changed and no authority changed. The filled leave is Open Credit. Open Agents stays secondary. `funding-return.contracts.ts:4`, `:5`. `fund.cancelled.tsx`.

## `/sign-in/$`

- **1. Built.** The title stays Sign in except for an Agent return and a supply return. The default body continues on Market. The methods list is gone. The filled Browse Tools closer is not mounted on this route. `sign-in.contracts.ts`. `AeSignInPage.tsx`.
- **2. Cited.** The shared auth stage overflow and inset. `AeSiteAuthStage.tsx`. `AeSiteAuthPanel.tsx`. Not patched on this page.

## `/sign-up/$`

- **1. Built.** The title stays Create an account. Destination words stay in the body. Provider wording stays on a supply return. The methods list is gone. The filled Browse Tools closer is not mounted on this route. `sign-up.contracts.ts`. `AeSignUpPage.tsx`.

## `/onboarding`

- **1. Built.** Role and workspace helpers are tied to the controls. Continue and Create stay enabled until the request starts. An empty activate marks and focuses the field. Back moves focus to the role control. `OnboardingRoleStep.tsx`. `OnboardingWorkspaceStep.tsx`. `useOnboardingPage.ts`.
- **2. Built.** The Settings promise is off the role cards. Skip does not finish setup. Buyer finish stays Workspace overview. Provider finish stays Provider Operations. `onboarding.contracts.ts`.
- **3. Built.** Skip is unmounted. Create is the one filled action. Back stays outline. `OnboardingWorkspaceStep.tsx`.

## `/`, `/owner`, `/owner/market`

- **Refused.** No page. Nothing to ship.
