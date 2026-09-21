# Buyer page register

**Status:** inventory + open decisions. Not a dest law.  
**Date:** 2026-09-21  
**Evidence:** live product pages in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md). That file is the only place claims about Airbnb / Perplexity / Locus / Nevermined / Whop dests may be made.

The 2026-09-21 “Search / Keys / Trips” map is **withdrawn**. It interpolated signed-in Airbnb dests (Trips, Messages, Wishlists, Switch to hosting) that the live walk did not see. Do not implement a rename from that map.

## Buyer job (PRODUCT.md)

Find a suitable Tool, let the Agent buy within granted authority, leave a record that can be explained and remedied. Journeys 1, 2, 3, 5, 6 first. Publish is journey 4, not the organising dest.

## What the live walk actually showed

Logged-out only. Details and URLs: `buyer-ia-coverage.md`.

| Product | Home job | Peer dests on screen | Listing action | Host / publish |
| --- | --- | --- | --- | --- |
| Airbnb | Browse + search (All / Homes / Experiences / Services) | Search stays on the page; hosting in the hamburger | **Reserve** on the listing | Become a host in menu |
| Perplexity | The page *is* the ask | New, Computer, Artefacts, Customise, Projects, Sessions | Submit the ask | — |
| Nevermined Catalog | Outcomes, then Services | Outcomes · Services · Get started · Search · Log in · List your service | **Top up** + **API key**, no checkout | List your service in header |
| Locus | Marketing → `/tools` catalog | Agent tools in nav; account at `platform.paywithlocus.com` | Provider cards, not Reserve | Sign in / Start for free |
| Whop | Marketing (Checkout / Wallet / Chat named) | Sign in / Get Started | — | Get Started |
| AE Market (logged out) | Ask + collections + cards | Tools · Collections · Providers · Saved | not walked | For providers (public header, source) |

Signed-in rails for Airbnb, Locus Pro, Nevermined App, Whop dashboard, and AE header: **not walked**.

## AE human pages (from source)

Header dests today:

| Audience | Label | Path |
| --- | --- | --- |
| always | Market | `/market` (`/` redirects here) |
| public | For agents | `/for-agents` |
| public | For providers | `/for-providers` |
| signed-in | Agents | `/agent-access` |
| signed-in | Calls | `/activity` |
| signed-in | My tools | `/owner/operations` |

Operator rail in source (not walked): Overview `/owner/`, Calls, Agents, Credit `/owner/credit`, Market `/owner/market`, My tools, plus developer Discovery and admin Catalog health / Audit.

Full 42-page table: `buyer-ia-coverage.md` §7.

Other human paths (not dests unless a later signed-in walk says so):

| Path | Title in route | Kind |
| --- | --- | --- |
| `/tools/$toolRef`, `/tools/$providerHost/$slug` | Tool page | listing |
| `/$slug` | Public business | shop |
| `/t/new`, `/t/$threadId` | Chat | ask thread |
| `/s/$shareToken` | Shared chat | share |
| `/agent-access/authorize` | Review agent access | grant |
| `/calls/$callRef` | Call receipt | trip-like |
| `/owner` | Overview | extra home + rail |
| `/owner/market` | Market (owner) | second search + rail |
| `/owner/credit` | Credit | pay + rail |
| `/owner/team`, `/owner/workspace`, `/owner/settings` | Team / Workspace / Account | label only, no rail |
| `/owner/operations/new`, `/owner/operations/$toolRef` | Add Tool / Tool status | host flow |
| `/onboarding` | Set up your workspace | first run |
| `/fund/$fundingSessionId`, `/fund/cancelled` | Funding | pay handoff |
| `/sign-in/$`, `/sign-up/$` | Auth | auth |
| `/about`, `/support`, `/status`, `/privacy`, `/terms`, `/developers/*`, `/admin/*` | Site / legal / docs / admin | not buyer dests |

## Open decisions (need another product walk)

1. Signed-in Airbnb dests — do not assume Trips / Messages / Wishlists until seen.
2. Signed-in Locus Pro rail — do not assume Approvals / Transactions / Keys from docs.
3. Signed-in Nevermined App tabs — do not assume Agents / Plans / Settings from docs.
4. Whether AE’s Agents and Calls earn a header slot the way Airbnb’s logged-in dests do — **unknown until both signed-in shells are on screen**.
5. Whether My tools is a peer dest or a mode switch — Airbnb logged-out puts hosting in the menu; Nevermined puts List your service in the catalog header. Both are `SEEN`. Airbnb signed-in switch is `BLOCKED`.
6. Listing primary action — Airbnb Reserve vs Nevermined “no checkout, top up + API key”. AE listing not walked.

## What this forbids until the next walk

- Treating Search / Keys / Trips as the dest law.
- Folding or renaming dests from interpolation.
- Inventing an AE wireframe kit.
- Using help-centre articles as dest evidence.

## Next

Continue on the product pages: signed-in Airbnb, Locus Pro, Nevermined App, then signed-in AE. Write new rows into `buyer-ia-coverage.md`. Only then change chrome.
