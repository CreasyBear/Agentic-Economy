# Destination leftover-map

**Status:** Polar Bear design gate. Complete for every FOLD / DEMOTE in this wave.  
**Date:** 2026-09-21  
**Protocol:** [`ia-rationalisation-protocol.md`](./ia-rationalisation-protocol.md)  
**Authority:** NN/g / Kalbach leftover maps; dest IDs in [`platform-nav-route-map.md`](./platform-nav-route-map.md)

After dest law changes, old mental models need **signage**, not a restored dest. Do not add dests to satisfy leftovers. Every row resolves to an existing path.

This map is the oneshot brake. Chrome does not move until each row has a resolver.

---

## Folds (path dies as a dest)

| Leftover | People still try | Resolver | Must not happen |
| --- | --- | --- | --- |
| `/owner/market` | Bookmarks, rail “Market”, tests on that pathname | Keep serving during expand. Then in-app alias / `beforeLoad` preserving Market query. HTTP 301 only at contract. ⌘K “Tools Market” already → `/market`. | Second catalog; sibling `/models` dest |
| `/owner/` Overview | Rail “Overview”, `roleHomeHref.owner === '/owner'` | **Survivor is `/market`.** Remap `roleHomeHref.owner` in the same Flips as dest-count. Do not keep an empty Overview dest. | New “Home” dest; 301 before `roleHomeHref` moves |

## Demote (path lives; primary chrome dies)

| Leftover | People still try | Resolver | Must not happen |
| --- | --- | --- | --- |
| Header / mobile **My tools** | DS-36/37 memory | **KEEP** `/owner/operations`. Visible mode/menu or existing scent **before** the Flip: ⌘K “My tools”, disclosed Supply group, `/for-providers` door. Crumbs + workspace title may stay **My tools** (DS-30). | Delete the route; mint `/my-tools`; equal-width 4th tab labelled “List tools” |
| `CTX-BUYER-PROVIDER` | “Where did hosting go?” | Mode/menu → `/owner/operations`. Public **For providers** stays a marketing PAGE and a legal **anchor**. Placement pixel **OPEN**; dest law is already “not a peer.” | Fourth tab; `/for-providers` as signed-in working dest |
| Credit on mobile | Older rail habits | Path `/owner/credit` stays. Rail or account. ⌘K “Balance & Credit.” | Promote Credit to fill the hole |

## ⌘K aliases (known-item search ≠ Market ask)

| Current label | href | After dest law |
| --- | --- | --- |
| Tools Market | `/market` | Keep. Alias **Market**. Never `/owner/market`. |
| Calls & Activity | `/activity` | Keep. Alias **Calls**. |
| My tools | `/owner/operations` | **Must keep resolving** after header demote. Also alias List tools / supply / publish. |
| Balance & Credit | `/owner/credit` | Keep. Alias **Credit**. |
| Agent Access & Keys | `/agent-access` | Keep href. Alias **Agents**. Keyword `keys` is leftover scent only — not dest law. |
| Provider Workspace | `/for-providers` | Public door. Signed-in “go to my supply” aliases to `/owner/operations`. Two aliases, existing dest IDs. |

⌘K stays known-item navigation (`AeAppShell`, DS-35). Market ask stays J-B01 on `/market`. Inventory filter stays query on Market. Do not merge the three to replace a demoted tab.

## Shell leftovers

| Leftover | Resolver |
| --- | --- |
| Operator rail Buy group | Collapse dests that are now header. Credit stays rail. `/owner/market` and Overview gone (redirect). My tools leaves the **peer** rail; route remains. Admin/developer rail unchanged. |
| Org-switch on a deep supply URL | Stay on `/owner/operations`. Do **not** retarget to Market. |
| Deep links `/tools/…` `/calls/…` `/t/…` `/fund/…` | PAGE-not-dest. Unchanged. |

## Signage we refuse

Search / Keys / Trips / Messages / Wishlists. OpenRouter modality dests. A dest named List tools (that is the **mode label**). Empty Overview “so the rail isn’t sad.” A second Market.

## Recognition-before-demote (Johnson)

Miller: do not make them remember where Supply went. IA-02 must characterize reachability of `/owner/operations` **without** a header peer (command item and/or disclosed Supply group and/or For-providers door). If characterization fails, grow scent on **existing** surfaces. Then IA-04 may drop the fourth peer.
