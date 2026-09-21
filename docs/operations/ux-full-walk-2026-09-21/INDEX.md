# Full UX walk — join

**Date:** 21 September 2026  
**App:** `http://127.0.0.1:3024` · unsigned except where noted  
**Walkers:** [FIND](01-find.md) · [ALLOW](02-allow.md) · [RECORD](03-record.md) · [SUPPLY](04-supply.md) · [SHARED](05-shared.md)  
**Law:** [platform-experience-audit.md](../../designs/2026-09-21-platform-experience-audit.md) site/group/page; [buyer-journey-baseline.md](../buyer-journey-baseline.md)

No purchase. No invented auth. Signed-in happy paths are **NOT CHECKED**, not passes.

**Site:** FAIL. Search exists. Inspect breaks. `/owner*` sign-in calls everyone a Provider. Compare is a thrown exception.

---

## Cross-family (do not fix twice)

| Pattern | Where it showed |
| --- | --- |
| **Inspect dies** | FIND: Suede + second card → “Tool details are unavailable.” Compare never starts (`setComparison is not defined`). |
| **`/owner*` = Provider at the gate** | Credit, Overview, workspace, team, settings, operations, `/owner/market` all: “Sign in to manage Tools.” |
| **Two starts** | Agents first-use (code); `/for-agents` Codex rail + Browse Tools. |
| **Supporting error becomes the page** | Empty Calls monthly-summary money; Credit Call warning; Discovery “Artifacts unavailable.” |
| **Help drops the ref** | Support shows `callRef`, Open Calls goes to `/activity` without it. |
| **My tools / manage Tools vs Saved** | Supply entrance + buyer Saved tab. |
| **Publication ≠ Listing collapsed** | For-providers “published facts” are Market/x402 cards; `/api/businesses` empty. |

---

## Every page

| Path / state | Family | Verdict | One line |
| --- | --- | --- | --- |
| `/` | FIND | **PASS** | Redirects to Market. |
| `/market` Collections | FIND | **FAIL** | Hero is a need; cards are API metadata; Compare is the labeled action. |
| `/market?query=…` Tools | FIND | **FAIL** | Shortlist exists; same card lies; search dies on Saved tab. |
| Compare | FIND | **FAIL** | `setComparison is not defined`. No dialog. |
| Saved | FIND | **FAIL** | Persistence works; still a Tool-shaped indexed card. |
| `/tools/app.suedeai.ai/agent-image` | FIND | **FAIL** | Featured/search card → unavailable. |
| `/tools/agent402.tools/v1-images-generations` | FIND | **FAIL** | Same. |
| `/tools/$toolRef` happy | FIND | **BLOCKED** | No listing yielded a ref. Invalid-ref SEEN. |
| `/t/new` | FIND | **FAIL** | Empty Ask; copy says “call”; code can Quote/Call. |
| `/owner/market` | FIND | **BLOCKED** | Sign-in as Provider. |
| `/agent-access` unsigned | ALLOW | **FAIL** | Gate. |
| `/agent-access` first-use | ALLOW | **FAIL** | Two starts in source (wizard + Codex). Pixels unsigned. |
| `/agent-access` returning | ALLOW | **CODE-ONLY** | Not rendered. |
| `/agent-access/authorize` empty | ALLOW | **FAIL** gate / **CODE-ONLY** empty UI | |
| `/agent-access/authorize?user_code=` | ALLOW | **BLOCKED** | |
| `/owner/credit` | ALLOW | **FAIL** | Sold as Provider. Reserved hidden (code). Call warning on error (code). |
| `/fund/cancelled` | ALLOW | **FAIL** | Says return to agent → Market. |
| `/fund/test-session` | ALLOW | **FAIL** | Same. Honest dummy (no Stripe). |
| `/sign-in` | ALLOW | **FAIL** | Dest copy wrong for Credit; grant collapsed into connect. |
| `/sign-up` | ALLOW | **FAIL** | “Create a Provider account” on `/owner*` returns. |
| `/onboarding` | ALLOW | **FAIL** | Unsigned generic load error; Back overwrite in source; `/owner` → supplier. |
| `/activity` empty | RECORD | **FAIL** | Find Tools good; month summary money steals the page. |
| `/activity` populated | RECORD | **FAIL** contract / **NOT CHECKED** pixels | Dashboard tiles. |
| `/calls/invalid-ref` | RECORD | **FAIL** | Titled “Call receipt”; no Help with this Call. Auth wall this session. |
| `/calls/$callRef` found | RECORD | **FAIL** | IDs first; purpose blank; no fresh-Call retry (good). Pixels NOT CHECKED. |
| `/support` | RECORD | **FAIL** | Switchboard; Provider + credit on buyer help. |
| `/support?callRef=` | RECORD | **FAIL** | Ref in URL/mailto; Open Calls drops it. |
| `/status` | RECORD | **PARTIAL** | Job works; “Retry after…” sounds like a Call. |
| `/for-providers` | SUPPLY | **FAIL** | Clear List a Tool; proof rail is Market cards. |
| `/owner/operations` | SUPPLY | **FAIL** | My tools + manage Tools intercept. |
| `/owner/operations/new` | SUPPLY | **FAIL** intercept / dest NOT CHECKED | ABN asked, not saved (source). |
| `/owner/operations/$toolRef` | SUPPLY | **FAIL** | Dead connections href. |
| `/owner/supply/connections/new` | SUPPLY | **PARTIAL** | Handoff, not a hub. |
| OAuth callback | SUPPLY | **FAIL** | Gate steals it. |
| `/$slug` not-found | SUPPLY | **PASS** | Honest empty. |
| `/$slug` populated | SUPPLY | **NOT CHECKED** | No published business. |
| Earnings section | SUPPLY | **FAIL** | Wizard promises payouts; ABN. |
| `/for-agents` | SHARED | **FAIL** | Door + working Codex dest. |
| `/about` | SHARED | **FAIL** | Two doors restated, not linked. |
| `/privacy` | SHARED | **PARTIAL** | Moments clear; CTA is Provider fix. |
| `/privacy/remove-business` | SHARED | **PARTIAL** | Form works; three names. |
| `/terms` | SHARED | **FAIL** | Product explainer + doors. |
| `/developers/api` | SHARED | **PARTIAL** | Scalar works; iframe / second language. |
| `/developers/discovery` | SHARED | **FAIL** | Ops readback on editorial shell. |
| `/owner/` Overview | SHARED | **FAIL** + **CODE-ONLY** | Provider gate; dashboard → `/owner/market`. |
| `/owner/workspace` | SHARED | **FAIL** + **CODE-ONLY** | No nav slot. |
| `/owner/team` | SHARED | **FAIL** + **CODE-ONLY** | No nav slot. |
| `/owner/settings` | SHARED | **FAIL** + **CODE-ONLY** | Dialog exists, not mounted. |
| `/admin/index-health` | SHARED | **FAIL** + **CODE-ONLY** | Gate. |
| `/admin/audit-events` | SHARED | **FAIL** + **CODE-ONLY** | Gate. |
| Settings from chrome | SHARED | **FAIL** | ⌘K is Find Tools; “settings” → no Tools. |

---

## Still unseen (signed-in)

Populated Agents, healthy Credit, healthy listing, found receipt, published `/$slug`, Add Tool after a real source, settings dialog, admin tables, a paid Call.

Those holes do not rescue FIND. The buyer task dies at compare and inspect while signed out.

---

## Coverage implication

Work order: [`ux-coverage-protocol.md`](../ux-coverage-protocol.md). **Current pass: SEE** (signed-in holes). Do not open compare or inspect first.

FIND failed on pixels. That is pass AGREE, later. The `/owner*` Provider lie is pass NAME. Dropped refs and unmounted settings are pass REACH. Month-money on empty Calls is pass HOLD. Doors that do the dest’s job are pass SEND.

## Still the first move

Sign in. Walk every CODE-ONLY / BLOCKED / NOT CHECKED row. Update this INDEX. No product edit on that pass.
