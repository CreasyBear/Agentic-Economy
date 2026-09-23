# Destination rationalisation register

**Status:** PARKED — dest + path written; buyer page contracts go first ([`buyer-journey-baseline.md`](./buyer-journey-baseline.md)).  
**Date:** 2026-09-21  
**Protocol:** [`ia-rationalisation-protocol.md`](./ia-rationalisation-protocol.md)  
**Leftover-map:** [`ia-leftover-map.md`](./ia-leftover-map.md)  
**Dest law:** [`platform-nav-route-map.md`](./platform-nav-route-map.md)

Four IDs. No fortieth. Sluice: inert first; exactly one Flips.

---

## Destination (the law this register spends chrome toward)

Signed-in working dests: **Market · Agents · Calls**. Supply is a mode/menu on `/owner/operations`. Fold `/owner/market` and Overview into `/market`. Credit stays rail.

Incumbent chrome (DS-36/37): Market / Agents / Calls / **My tools**. That freeze is spent by IA-04, not parked.

---

## IDs

### IA-01 — Dest-law census

- **Kind:** inert · query
- **Does:** Map shipped chrome vs dest law. Quote DS-36/37 dest-count sentences. List dest seams `file:line` (`staticData.nav`, `AeSiteNav`, `AeOwnerMobileNavigation`, `roleHomeHref`, `eval-ds-grammar`, `MarketPath`). Record leftover-map coverage.
- **Does not:** Touch chrome. Rewrite the DS freeze.
- **Status:** READY

### IA-02 — Dual dest ratchets + supply scent

- **Kind:** inert · query
- **Does:** Add Layer A **target** helpers (header/mobile = Market / Agents / Calls; `/owner/operations` remains a route; supply scent present). Keep incumbent 4-peer law measurable. Characterize `/owner/market` as alias, Overview as fold-into `/market`.
- **Does not:** Remove My tools from the header. 301 anything.
- **Status:** READY

### IA-03 — Dest-law freeze

- **Kind:** inert · query
- **Does:** Stage 3 table: verb per dest ID; file budget; Layer B case IDs; exact DS-36/37 **sentences** IA-04 will replace (dest count only). Confirm leftover-map complete.
- **Does not:** Command chrome. Invent dests.
- **Status:** READY

### IA-04 — Dest-count Flips

- **Kind:** the only command
- **Does:** DEMOTE My tools off header + mobile primary (keep `/owner/operations`). FOLD `/owner/market` → `/market`. FOLD `/owner/` → `/market` and remap `roleHomeHref.owner`. Flip Layer A 4 → 3. Rewrite DS-36/37 dest-count sentences with IA-04 provenance. Update dest fixtures in `owner-primary-navigation` / `site-nav` / `app-shell`.
- **Does not:** Rename labels. Remount sidebar. Restyle discover. Implement EX / JI / W. Add `/trips` or `/my-tools`. Retarget org-switch to Market.
- **Requires:** leftover-map resolvers in place; IA-02 scent characterization pass; Stage 3 freeze.
- **Status:** READY (not started)

---

## Seams (change dests here; everything else is a caller)

Named by the strangler pass. Confirm line numbers in IA-01.

1. `src/router.tsx` `NavStaticData`
2. Dest route `staticData.nav` on `market.tsx`, `agent-access.tsx`, `activity.tsx`, `owner.operations.tsx`
3. `AeSiteNav.tsx` `useHeaderNavItems`
4. `AeOwnerMobileNavigation.tsx` `OWNER_PRIMARY_DESTINATIONS`
5. `src/lib/operator/roles.ts` `roleHomeHref`
6. `tools/dev/eval-ds-grammar.ts` + dest tests (`site-nav`, `owner-primary-navigation`)
7. `WorkspaceTransitionBoundary.tsx` (keep deep-tenant landing on operations)
8. `market-navigation-context.tsx` `MarketPath` (contract shrinks the union)

---

## Provenance (fill at Stage 6)

| Field | Value |
| --- | --- |
| Framework agents | IceInVein 8-point; Polar Bear leftover-map; Fowler strangler; Brooks dest+path; Johnson/Hick/Rams dest budget |
| Grok / Composer | — |
| Layer A commands | — |
| Layer B case IDs | — |
| Layer C | — |
| DS-36/37 dest-count | to be superseded by IA-04 |
