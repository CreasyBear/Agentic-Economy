# UX coverage protocol

**Status:** the assignment guide. One pass. Every page. Then rewalk the INDEX.  
**Date:** 2026-09-21  
**Map:** [`ux-full-walk-2026-09-21/INDEX.md`](./ux-full-walk-2026-09-21/INDEX.md)  
**Page law:** [`buyer-journey-baseline.md`](./buyer-journey-baseline.md)  
**Journey proof (last pass only):** [`buyer-journey-protocol.md`](./buyer-journey-protocol.md)

The walk found the same lie on many pages, and many pages never seen signed-in. Hunting the worst FAIL first (compare, inspect) is how we skip the rest. Routing each FAIL to an owner is how we play whack-a-mole.

We untangle by **coverage passes**. A pass is one treatment applied to every page it applies to. Easy treatments first. Gaps in the map before gaps in the product. After every pass we walk the **whole INDEX**, not the page we touched.

---

## How to use this

1. Open the **current pass** (only one is current).
2. The pass has **one rule**. Every INDEX row that the rule applies to is in scope. Rows it does not apply to are still rewalked.
3. Assign the **whole pass** to one lead. Existing EX / JI / W / DS IDs review invariants. They do not each take a symptom.
4. Write a one-page freeze (template below). Joel signs the rule, the page list, and out of scope.
5. Sluice the freeze. `bypass` for SEE. `fast` if the pass stays in one projection. `main` if two surfaces. `deep` if three+ or the family must agree.
6. Implement until the **pass walk** holds on every in-scope page.
7. **Rewalk the INDEX.** Update every row. New damage on a page you did not mean to change is a failed pass, not a later ticket.
8. Then the next pass. Do not start it because a later FAIL looks worse.

Do not open a FAIL and ask who owns it. Ask which **pass** has not yet treated that page.

---

## Current pass

**SEE** — fill the signed-in holes. No product change.

---

## The passes (easy → hard)

Each pass is one sentence. If you need a second sentence, you are smuggling the next pass.

### 0. SEE — current

**Rule:** Every INDEX row has a signed-in pixel verdict for the states that exist, or an explicit reason it cannot (no published business, no paid Call).

**In:** the “Still unseen” list and every CODE-ONLY / BLOCKED / NOT CHECKED row.

**Out:** product edits, dest-count, restyle.

**Pass walk:** Sign in. Open every path in the INDEX. Record empty, error, and populated when they exist. Do not invent a Call or a Listing.

**Done:** INDEX has no “unsigned only” hole that a session can close. Family rollups may still FAIL. That is expected.

This pass is how we start. It is the missing half of the audit, not a delay.

### 1. NAME

**Rule:** The unsigned gate names the destination you asked for. Buyer dests are not “manage Tools.” Provider dests say you are entering supply.

**In:** every `/owner*` gate, `/sign-in`, `/sign-up`, `/onboarding` intercept, `/agent-access` unsigned. One projection (`projectSignInCopy` and dest titles).

**Out:** funding, inventory, dest-count, inspect.

**Pass walk:** Unsigned, hit every gated path. Credit says credit. Agents say Agents. Operations says publish / supply. Overview does not call a buyer a Provider.

**Done:** NAME holds on every gate, including ones this pass did not expect to touch.

### 2. REACH

**Rule:** Every named control that claims a destination opens it, and carries the object already in the URL.

**In:** chrome, empty-state exits, help, funding return, settings entrance, recovery hrefs. Mount what already exists (settings dialog). Fix dropped `callRef`. Do not invent dests.

**Out:** new destinations, compare, inspect admission, ABN save.

**Pass walk:** From every INDEX page, take the labeled exit. Land where the label said. Help `?callRef=` still has the ref on Calls. Funding cancelled returns to the task that started funding, not Market-as-agent. Dead `/owner/supply/connections` is gone or the href is gone.

**Done:** No labeled exit in the INDEX is a 404, a dropped query, or an unmounted dialog.

### 3. HOLD

**Rule:** Empty and error keep this page’s job. A supporting failure is one local line, never the story, never money on a page with no money object.

**In:** every empty and error state in the INDEX (Calls month summary, Credit Call warning, unsigned onboarding load, Discovery artifacts, funding dummy).

**Out:** populated dashboard redesign, inspect, publish.

**Pass walk:** Every empty and error row still states the page job. Primary action is the page’s next step, not Refresh / Retry-the-subsystem.

**Done:** HOLD holds on every empty/error, including pages this pass did not edit.

### 4. SEND

**Rule:** Editorial pages are doors. One proposition. One leave. Destinations do the work.

**In:** `/`, `/about`, `/for-agents`, `/for-providers`, `/terms`, `/privacy`, `/developers/*` as public shells.

**Out:** Codex procedure rewrite, Scalar, dest-count, Market cards.

**Pass walk:** Each door can be left in one click to Market, Agents, or supply. No door contains a second start that competes with the dest. `/for-agents` does not run the Agents job.

**Done:** SEND holds on every editorial row.

### 5. AGREE

**Rule:** Inside a family, the same object has the same name, the same facts, and the same next step.

**In:** Discover (Market, cards, compare, listing, Saved, ask). Results (Calls, receipt, help). Supply (landing, operations, add, detail) only after buyer discover agrees, unless Joel opens supply.

**Out:** new purchase principal, dest-count, chat-can-buy, listed-price-as-Quote.

**Pass walk:** The FIND stage walk in the journey protocol. Then Calls / receipt / help agree on one Call. Compare exists and survives refresh. A featured card opens that Tool or an honest unavailable — never a featured lie.

**Done:** The family walk passes without a reviewer explaining the UI. This is the first hard pass. We did not start here.

Invariant reviewers: EX-01 inspect; JI-04b chat is not a buyer; x402 indexed ≠ callable.

### 6. CARRY

**Rule:** A Tool survives FIND → ALLOW (if needed) → USE → RECORD.

**In:** the journey protocol, first-use and returning.

**Out:** dest-count, Provider publish as the campaign, AU record completeness.

**Pass walk:** The ordinary task, end to end, without a reviewer narrating.

**Done:** Journey done as defined in the journey protocol.

---

## Rewalk ritual

After every pass, including SEE:

1. Walk **every** INDEX row (unsigned always; signed-in for every state SEE already opened).
2. Update the row verdict and one-liner in place. Do not start a new dated walk folder unless the site shape changed.
3. A pass that fixes its rule but breaks NAME, REACH, or HOLD on another page has **failed**. Stay on that pass.
4. PARTIAL / FAIL that belong to a later pass stay on the INDEX. They are not this week’s work.

The INDEX is the coverage board. The experience register is evidence. Neither is a bug queue.

---

## How we assign

| Assign | To whom |
| --- | --- |
| **The pass** | One lead (one Composer / one PR / one well). |
| **The freeze** | Lead writes it. Joel signs rule / pages / out. |
| **Invariants** | Named EX / JI / W / DS reviewer on AGREE and CARRY. They may block a collapse. They do not receive a private queue. |
| **Channel** | Sluice on the **pass**. SEE is `bypass`. NAME is `fast` if it stays in `projectSignInCopy` + dest titles. REACH is `main` if chrome + help + funding. AGREE is `deep` or `main`. |

Do not assign “Credit copy this week, help `callRef` next, compare when we feel brave.” That is issue-hopping inside a coverage exercise.

---

## Freeze template (one pass)

```text
Pass:
Rule (one sentence):
Pages the rule applies to (from INDEX):
What we will change (file budget):
Out (later passes + invariants):
Pass walk (copy from this protocol):
Rewalk: full INDEX after, including pages we did not edit.
```

Fill this before the first edit. If the rule needs a second sentence, split the pass.

---

## Done

**Pass done:** the pass walk holds on every in-scope page, and the full INDEX rewalk did not grow new damage in an earlier pass.

**Coverage done:** SEE through HOLD hold on the whole INDEX. SEND holds on every door. Then AGREE / CARRY are allowed.

A single row flipping FAIL → PASS is not done. A green unit test is not done.

---

## Refuse

- Starting AGREE or CARRY because FIND is the charter failure.
- A queue of FAILs routed to whoever “owns” the symptom.
- Fixing one page’s copy and skipping the other gates.
- Skipping the full INDEX rewalk.
- Treating SEE as optional so we can “get to the real work.”
- A new ID series.
- Dest-count / IA-* during NAME–HOLD.
- Provider publish as a substitute for buyer NAME/REACH/HOLD.
