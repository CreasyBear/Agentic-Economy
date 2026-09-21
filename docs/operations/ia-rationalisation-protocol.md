# Destination rationalisation protocol

**Status:** PARKED. Dest + path are written. Do not run IA-01–04 until the seven buyer pages in [`buyer-journey-baseline.md`](./buyer-journey-baseline.md) pass. Chrome is not the hole.  
**Date:** 2026-09-21  
**Campaign:** `IA-01`–`IA-04` in [`ia-rationalisation-register.md`](./ia-rationalisation-register.md)  
**Leftover-map (the oneshot brake):** [`ia-leftover-map.md`](./ia-leftover-map.md)  
**Dest table (already written):** [`platform-nav-route-map.md`](./platform-nav-route-map.md)  
**Ideal chrome:** [`2026-09-21-ideal-app.md`](../designs/2026-09-21-ideal-app.md) §4

This is a **destination campaign**. It spends current chrome until it matches the dest set the jobs already named. It is not a visual harvest, not a DS Wave 4 leftover, and not a oneshot header edit.

Frameworks that own this file (do not reconstruct): IceInVein 8-point ([`2026-09-17-user-org-maturity-iceinvein.md`](../designs/2026-09-17-user-org-maturity-iceinvein.md) §2); Polar Bear IA (Rosenfeld / Morville / Arango); NN/g wayfinding leftover maps; Fowler strangler + expand-contract; Brooks *The Design of Design*; Johnson / Hick / Rams dest budget; sluice deep channel (inert first, one Flips).

---

## 1. Destination

Buyer jobs earn three signed-in dests — **Market · Agents · Calls** — and supply becomes a **mode/menu on the existing `/owner/operations` path**, so a fourth header peer and a second Market URL stop existing.

```text
Public:      Market · For agents · For providers
Signed-in:   Market · Agents · Calls  +  supply mode/menu
Keep route:  /owner/operations   (DEMOTE off header + mobile primary)
Rail:        /owner/credit
Fold:        /owner/market → /market
             /owner/       → /market
Reuse:       /market  /agent-access  /activity  /owner/operations  /owner/credit
Do not add:  /trips  /messages  /saved  /wishlist  /my-tools  Rankings  modality dests
```

DS-36/37 shipped **Market / Agents / Calls / My tools**. That is incumbent evidence. This campaign **spends that freeze on purpose**. Job-derived dest law outranks a chrome freeze that made supply a peer tab. Spending it silently is oneshot. Spending it with a leftover-map + expand ratchets + one Flips is the path.

---

## 2. Path

```text
Polar Bear research   already on disk (census, jobs, dest map)
Polar Bear strategy   dest law locks now (organisation A: job-stage)
Polar Bear design     leftover-map  ←  refuse to skip
Expand (inert)        IA-01 census → IA-02 dual Layer A → IA-03 freeze
Recognition           supply scent visible without a header peer
Contract (command)    IA-04 Flips — dest slots only
Polar Bear impl.      redirects, aliases, crumbs already named on the leftover-map
```

**Brake you cannot skip:** leftover-map complete for every FOLD / DEMOTE.  
**Not a brake:** DS-36/37 VERIFIED; signed-in Airbnb; a 40-ID register.  
**Useful on the path, not a veto:** signed-in AE header walk as Layer B scent. Dest law does not wait for it.

---

## 3. Legal verbs

A row is exactly one verb. A path cannot be KEEP dest **and** FOLD. A query view cannot be a dest. OPEN cannot mutate chrome.

| Verb | Requires | Ensures | This campaign |
| --- | --- | --- | --- |
| **KEEP** | Existing dest ID; organising buyer or ops-rail decision | Path and slot remain | `/market`, `/agent-access`, `/activity`; Credit as rail |
| **FOLD** | Two paths, one job; survivor is KEEP | One redirect; no dest link to the dead path | `/owner/market` → `/market`; `/owner/` → `/market` |
| **DEMOTE** | Route must survive; job is real but not a buyer dest | Off header + mobile primary; still reachable | `/owner/operations` → mode/menu |
| **PAGE-not-dest** | Resume / deep-link / share | No header peer | listings, receipts, threads, doors, settings |
| **OPEN** | Named missing fact | Query only | exact menu pixel; Airbnb signed-in switch |
| **PARK** | Owned elsewhere or withdrawn | No IA ID implements it | Search / Keys / Trips; DS-39; J-B04 as dest |

**Loud violations (halt):** inventing a path; renaming dest labels (DS-30 **My tools** stays on the supply route); minting Search/Keys/Trips; DEMOTE that deletes `/owner/operations`; dest mutation on IA-01–03.

---

## 4. Anti-compaction

1. One dest law. Replay must not mint a second header.
2. Jobs earn dests. Journey 4 is a mode, not a fourth buyer tab.
3. Path = dest or resource; query = view; dialog ≠ dest.
4. No invented destinations or chrome names. `CONTEXT.md` vocabulary.
5. Search / Keys / Trips unused.
6. Shipped freeze is evidence, not a ban. Supersession only through expand-contract.
7. Expand before contract. Target law exists before chrome moves.
8. Queries do not mutate dests. Only IA-04 is a dest command.
9. Owners stay in their lanes. IA changes **where a dest sits**, not inspect, chat principal, ABN, billing, or tokens.
10. Gate 6 is “jobs earn dests,” not sibling-of-discover.
11. Skills are files. Naming a skill without reading it fails the stage.
12. One shell stays. Do not remount the buyer sidebar or add a second header primitive.

---

## 5. Six stages (IceInVein / DS spine, dest-scored)

Same roles as [`design-system-maturity-protocol.md`](./design-system-maturity-protocol.md) §2. Grok read-only. Composer only on IA-04. Orchestrator measures.

| Stage | Must load | Output |
| --- | --- | --- |
| 1 Research | `.cursor/rules/design-review.mdc`; this protocol; dest map; ideal §4; leftover-map | Dest table incumbent vs target; Don't list; `Skills loaded` |
| 2 Seam | `.cursor/rules/contract-enforcer.mdc`; `type-driven-designer.mdc`; `temporal-coupling-detector.mdc`; `cqs-auditor.mdc`; nav seams | `file:line` inventory; Layer A tests-to-add; file budget |
| 3 Freeze | `.cursor/rules/sluice.mdc`; leftover-map complete | Verb per row; eval IDs; file budget; DS-36/37 **sentences** IA-04 will replace |
| 4 Flips | `.cursor/rules/idempotency-guardian.mdc`; Stage 3; Layer A already dual | Chrome + redirects + ratchet drop + register dest-count rewrite |
| 5 Jury | `.cursor/rules/cognitive-load-auditor.mdc`; `rams-design-audit.mdc`; `better-interface` `quick` | Header peers = 3 buyer dests; supply not a peer |
| 6 Provenance | — | Grok/Composer uuids; `DS-36 dest-count superseded by IA-04` |

**Always-on:** `design-review`, `contract-enforcer`, `type-driven-designer`.  
**Do not require:** `design-taste`, `impeccable` critique, discover SoT harvest. Those stay DS.

---

## 6. Evals

| Layer | Score |
| --- | --- |
| **A** | Dual until Flips: incumbent 4-peer measurable; target 3-peer + supply-scent + `/owner/operations` still a route. Flips lowers ceiling 4 → 3. Never raise. |
| **B** | Dest cases: signed-in header, mobile primary, one Market URL, Overview fold, supply mode, public doors. Walk measures scent. Source interpolation is not dest-law evidence for the Flip. |
| **C** | Cognitive-load (≤3 buyer peers); Rams (My tools-as-peer fails earn-presence); `better-interface` `quick` on header/mobile. |
| **Gate 6** | Squint the header: each peer names a buyer job (find / authorize / explain). A supply peer is dest FEEL FAIL even if DS visual helpers stay green. |

Persist under `output/ia-evals-YYYY-MM-DD/`. Never overwrite. Jev stays out.

---

## 7. Temporal law

```text
IA-01 census (query)
  → IA-02 dual Layer A + supply-scent characterization (query)
    → leftover-map complete (design gate)
      → IA-03 Stage 3 freeze (query)
        → IA-04 Flips (the only command)
```

**Illegal:** hide My tools with no scent; 301 `/owner/market` while callers still assert that pathname; delete `/owner` before `roleHomeHref.owner` moves; retarget org-switch to Market; week-one header-only PR; dest mutation inside a DS visual ID.

**Legal:** rewrite dest helpers to the 3-list as expand while chrome still shows 4; Flips that changes header dests in one command; keep `/owner/operations` forever this wave.

---

## 8. Collision

| Owner | Stay / hand off |
| --- | --- |
| DS-30 labels | Stay. IA DEMOTEs the slot. It does not rename **My tools**. |
| DS-35 frame | Stay. Brand / account / theme / ⌘K / switcher → `AeAppShell`. |
| DS-36/37 dest **count** | **Hand off → IA-04.** Snapshot of four dests. |
| DS-36/37 frame | Stay. One header; chat not an app; buyer sidebar unmounted. |
| DS-38 settings | Stay. Overlay. PAGE-not-dest. |
| DS-34 live SoT / signed-in visual | Stay. That walk is grammar, not dest law. Do not spend one signed-in session as both DS-34 Layer B and the IA Flip gate. |
| DS-39 | Stay PARKED. |
| EX / JI / W / S / B / CQ | Stay or reopen-forbidden. IA does not steal inspect, chat principal, ABN, persistence, or leaf purity. |
| FR-05 persist compare; `/models` REFINE | Market **screen**. Not this campaign. |

---

## 9. Cuts

Park-because-DS-36. Fold dest count into DS-34/39. Forty IA IDs. Visual restyle. Oneshot with no leftover-map. Second header. Modality dests. Rankings. Search / Keys / Trips. Human Reserve. Chat checkout. J-B04 or J-P03 as header dests. `/my-tools`. Credit as a fifth dest. Treating Layer B interpolation as Flip evidence.

---

## 10. Controversial decision

**We will break a verified DS freeze on purpose.** A reasonable person would keep the verified quartet. We spend it because journey 4 is a mode, and a header peer that forces the user to hold “am I buying or supplying?” fails Hick and Rams. The leftover-map and expand ratchets are how the break stays a freeze, not a cleanup.
