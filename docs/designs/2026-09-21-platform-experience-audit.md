# AEcon buyer experience: basic requirements and blunt review

**Reframed with Joel, 21 September 2026.** This replaces the earlier infrastructure-led framing. The immediate job is to make the ordinary customer experience coherent, comprehensible and usable. The earlier technical annexes are supporting evidence, not the design agenda.

## The verdict

AE has recognisable components and substantial functionality, but the experience does not yet turn them into one obvious customer journey. It repeatedly makes the user interpret the system instead of helping them finish a task.

The first audit made the same mistake: it prioritised complicated implementation boundaries before asking whether the pages make sense. Passing component tests and having the right objects in the backend do not make a coherent product.

The most concrete problems in the current local interface:

- **The showroom speaks marketing; the shelves speak API documentation.** Market's large editorial hero promises easy capability discovery. The cards underneath expose `b64_json`, `pollUrl`, protocol names, payment-option counts and truncated Provider prose. A buyer has to translate those fields into “what will I get?”
- **The card hierarchy promotes a secondary action.** In the observed creative row, Compare is an explicit action while opening the Tool relies on recognising the title as a link. Uneven title/description lengths push price and action positions around. Repeated cards should make the same decision easy in the same place.
- **The promise breaks at the next click.** A freshly opened Suede image Tool led to “Tool details are unavailable.” The previous walk found another unavailable creative Tool. Regardless of cause, a featured card that cannot support inspection fails the basic discovery journey.
- **Agents gives two apparent beginnings.** “Connect New Agent” competes with an already-open “Connect with Codex” procedure. The user must infer whether to press the button or start running commands. The page needs one clear first-use path and a distinct returning-user management state.
- **The navigation mixes ownership meanings.** Market, Agents and Calls describe buyer tasks; My tools leads to Provider operations. “My tools” can plausibly mean saved or connected Tools. The destination needs an unmistakable Provider context.
- **Supporting failures become the main story.** Calls has a good “No Calls yet → Find Tools” empty state, then presents an unavailable monthly summary with a financial-impact explanation. Credit repeats its load failure in a title and alert, then warns about repeating a Call even though the visitor came to manage credit. Generic defensive copy is escaping into unrelated tasks.

These are design-review judgments grounded in the local pages, not claims about measured abandonment. The visual foundation is usable: a shared shell, restrained palette, visible search and consistent primitives. The missing discipline is page purpose, information hierarchy and continuity.

## 1. Start with the customer's job

**Primary job:** “When my agent needs a capability, help me find a suitable Tool, understand what I will get and what it costs, use it, and find the result again.”

**First-use journey:** arrive → describe need → inspect suitable results → compare if useful → choose a Tool → connect/fund only if needed → use through the existing Agent → receive result → find the record.

**Returning journey:** return → find a saved Tool or previous Call → understand current suitability/terms → use again → receive result.

**Interrupted journey:** return to the same choice or Call → understand what happened → take the supported next step. Do not make the person reconstruct their work.

Connection, funding and account setup are conditional branches that return to the task. Comparison is optional. A buyer with an authorised Agent does not need a fresh human checkout for every Call. Provider publishing is a separate journey with a clear entrance.

```text
                         ┌─ connect / fund if needed ─┐
Find → inspect → choose ──┤                           ├─ use → result → history
          ↕ compare      └─ already ready ────────────┘
          ↕ saved                          return with the same selection
```

A journey is complete only when its ending is useful to the customer. Landing on an installation page is not completion of “use this Tool.”

## 2. Requirements at each level

These are AE's baseline acceptance rules. They are deliberately simple; counts and first-impression checks are review conventions, not universal scientific limits.

### Site requirements

| ID | Required behaviour | Pass condition |
| --- | --- | --- |
| S1 | One understandable buyer proposition | A new visitor can explain what they can accomplish and how to start without learning AE's internal architecture. |
| S2 | Navigation names stable destinations | Every primary item names somewhere users return to; no transient wizard step or implementation subsystem earns a slot merely because it exists. |
| S3 | One coherent interaction language | The same kind of action has the same label, appearance and behaviour across pages. Buyer and Provider contexts are distinguishable. |
| S4 | Complete connected journeys | Find → inspect → choose → use → result → history works as a connected task. Setup interruptions return to it. |
| S5 | Context survives ordinary navigation | Relevant search, selection and entered work survive Back, modal close and required sign-in/setup detours. Refresh expectations are explicit. |
| S6 | Essentials precede explanation | Material cost, consequence and limitations are visible at the decision; implementation details and general background are secondary. |
| S7 | Ordinary use works across input modes | Core tasks work on compact screens and keyboard, with labelled controls, visible focus and readable status. |

### Page-group requirements

| Group | Shared job | Requirements across its pages |
| --- | --- | --- |
| Discover and decide | Find something suitable | Search, results, comparison and detail use the same Tool identity, vocabulary and price basis; selected need stays available; Back returns to the same search; each page advances the choice. |
| Set up and use | Make the chosen Tool usable | Show only the missing prerequisite; explain its purpose; retain the choice; one next step per state; explicit completion and return. |
| Results and repeat | Know what happened and continue | History, Call detail and result agree on names/status; output is easy to find; repeat and recovery actions are clearly different; details are secondary to outcome. |
| Account and help | Manage the service without losing the task | Personal/workspace scope is explicit; settings, credit and help have stable entrances; save/cancel/return work consistently. |
| Provider workspace | Publish and maintain supply | Entry clearly changes context; list, add and detail share the same status/action language; a published Tool has a buyer-facing destination. |

### Every page must meet this contract

1. **Job:** one sentence naming what the user came to accomplish.
2. **Entry:** where the user arrived from and which context they bring.
3. **Orientation:** a recognisable title, current object and current state.
4. **Decision information:** the few facts needed to choose the next action, in decision order.
5. **Primary action:** one visually dominant action for this state, with a label that predicts its result. Lists may repeat the same item action; this is not “one button per page.”
6. **Exit:** a clear Back/cancel/return path and a named successful next destination.
7. **States:** useful loading, empty, error and success behaviour; retain valid work; never leave an unexplained disabled button or dead end.
8. **Hierarchy:** related information/actions grouped together, secondary details disclosed, consistent alignment and action placement across the page family.

**Delete or move any section that cannot explain which decision on this page it supports.** A correct fact does not automatically deserve first-screen placement.

### Repeated-component requirements

Cards, rows and forms must use consistent field order, units, labels and action placement. Card titles identify a capability; summaries explain an outcome; technical schema keys belong in technical detail. Optional Compare and Save do not obscure opening the item. Forms keep labels, errors and actions next to the fields they affect. Use spacing to distinguish groups before adding more boxes.

## 3. Derive navigation from destinations

The stable buyer destinations are **finding Tools**, **managing connected Agents**, and **reviewing Calls/results**, supported by **account/credit/help**. Provider operations is a distinct working context. These responsibilities can use the existing routes.

| Destination or state | Existing route | Why it belongs there |
| --- | --- | --- |
| Find Tools | `/market` | Persistent discovery home; results, collections and saved views are states of this destination. |
| Inspect one Tool | `/tools/$toolRef` or `/tools/$providerHost/$slug` | Stable item detail, reached from results or a shared link; not another global navigation item. |
| Compare a selection | Existing Market comparison | Temporary decision view; keep within discovery unless a durable shared-comparison task is demonstrated. |
| Manage Agents | `/agent-access` | Stable connection/control destination; first-use setup is one state within it. |
| Review access | `/agent-access/authorize` | Contextual task with a clear return, not global navigation. |
| Review Calls/results | `/activity`, `/calls/$callRef` | Collection → item relationship users can learn once and reuse. |
| Manage account | Existing settings, workspace, team and credit routes | Supporting destinations reached through a consistent account entry. |
| Publish/manage supply | `/owner/operations` and its add/detail routes | Distinct Provider context; entry must say what is owned/managed. |
| Ask for help finding a Tool | Existing chat routes | An alternate discovery interaction which returns to the same Tool and use journey. |

A stable object or destination gets a path; shareable search/filter state belongs in validated query parameters; temporary disclosure state stays local. Do not create a route for every button or copy backend module names into navigation. Existing URLs can remain while hierarchy and labels improve.

This is an AE customer-task judgment. It does not depend on guessing another product's signed-in navigation.

## 4. Page requirements and current verdicts

The [page checklist](../operations/platform-experience-register.md) is the execution document. Start with its buyer rows in journey order. For each page, record the job, necessary content, primary action, next destination and observed result against S1–S7 and the eight page rules.

Three simple compositions set the standard:

```text
RESULTS
Your search / edit search
Relevant filters and result count
Repeated rows/cards: capability → outcome → meaningful price basis → View Tool
Optional: Save / Compare
No results: change this constraint or browse a relevant category
```

```text
TOOL DETAIL
Tool name + what it does + Provider
What you provide → what you receive
Price basis + limitations that matter to this choice
[Use with your Agent] OR [Connect your Agent] OR a specific unavailable action
Details: inputs, technical contract, evidence
[Back to results]
```

```text
AGENTS — FIRST USE
Connect your Agent
Choose your app → one set of instructions → check connection
Success: connection shown → continue to selected Tool / Find Tools
AGENTS — RETURNING
Your connected Agents + status + spending/access summary
[Connect another Agent] / manage an existing Agent
```

“Use with your Agent” is a required understandable continuation, not permission to invent a browser execution engine. If the supported mechanism is copy-and-paste into an existing harness, say exactly what to copy, where to put it, and what will happen. Keep the selected Tool visible throughout.

## 5. Copy rules: useful truth without a wall of caveats

- Lead with outcome, then action, then the explanation needed to make that decision.
- Put a limitation next to the affected fact. Do not turn every page into a disclaimer about the whole system.
- Use Tool, Agent and Call consistently; explain an unfamiliar term in context once. Do not rename canonical objects casually.
- Use plain error copy: what failed, what the user can do. Mention money only where the failed action could affect money.
- Never shorten away a material price, permission or consequence. Shorten the surrounding implementation narrative.

Examples of the target style, subject to actual state:

| Current observed/source copy | Better communication requirement |
| --- | --- |
| `Returns created · data · b64_json` | Explain “Returns an image” when the source supports it; leave exact fields in technical detail. |
| `13 Provider payment options` on a browse card | Show the price basis relevant to choosing; disclose alternate payment details only where needed. |
| Long comparison preamble | One local price note and clear fact labels; no repeated platform explanation above every comparison. |
| Credit error warning about repeating a Call | “We couldn't load your credit information. Try again.” Show a separate transaction warning only if there is a relevant pending transaction. |
| Connection confirmation paragraph | Distinguish “Connected” and “Spending access” as clear states with the appropriate next action. |

## 6. Apply proven methods with the existing stack

Use **JTBD** to define the outcome, **journey mapping** to connect the whole task, **information architecture** to identify stable destinations, **page contracts** to define each screen, and **heuristic review plus task testing** to check the result. They are successive levels of one method.

[Nielsen's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) support the baseline: familiar language, consistency, visible status, recognition over recall, relevant information and constructive recovery. Gestalt review checks whether grouping, alignment and visual weight communicate those relationships. Apply them to what is rendered, not merely to the existence of components.

Reuse current Base UI/shadcn and AE components for interaction; TanStack Router for destinations/state; Clerk for account/organisation controls; existing schema forms for Tool inputs; Stripe-hosted funding/onboarding where already supported. The missing work is composition, content and connected behaviour. No new framework is required to establish these basics.

## 7. The work order

1. Agree each buyer page's one-sentence job and successful next destination using the checklist.
2. Review one connected Find → results → detail → use → result → history journey. Mark each page Pass, Fail or Not checked. Fix broken basics first.
3. Make cards, page headers, primary actions and copy consistent across that journey using current components.
4. Walk the same task as a new user, returning user and interrupted user, including keyboard and compact layout.
5. Then apply the same contracts to account/help and Provider pages. Broader ranking, tax, settlement and roadmap analysis stay outside this basic UX pass unless they directly block the task.

A reviewer gives the task, not operating instructions. If the reviewer has to explain which button to press, why a page appeared, or how to get back, record the failure. Test counts do not substitute for this observation.

## Evidence boundary

Fresh local desktop inspection on 21 September 2026 at `127.0.0.1:3024`: Market hero/cards, Suede Tool detail, Agents first-use state, Calls empty state, Credit load error. Prior same-day inspection covered another unavailable Tool and Provider activation. Comparison/detail normal-state requirements use current component source where runtime inspection was blocked. No purchase or account mutation was performed. Source anchors remain in the three earlier [buyer](../improvements/2026-09-21/platform-experience/buyer.md), [Provider](../improvements/2026-09-21/platform-experience/provider.md) and [structure](../improvements/2026-09-21/platform-experience/structure.md) annexes; their broader priorities do not govern this reset.
