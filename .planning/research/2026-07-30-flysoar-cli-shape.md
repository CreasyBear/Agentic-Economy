# Soar (flysoar) shape study — CLI + MCP distribution

Date: 2026-07-30. Source: SoarShapeStudy scout (full transcript `history://SoarShapeStudy`).
Repo: https://github.com/Gahnxd/flysoar-cli @ `3abe6f19` (tree via GitHub API, files via raw.githubusercontent.com).

## 1. Install + first run (zero credentials)

- `flysoar --version`; if absent: `curl -fsSL https://flysoar-cli.vercel.app/install.sh | sh` (installer verifies SHA256SUMS; prebuilt macOS ARM/Intel + Linux x86_64; `FLYSOAR_VERSION`/`FLYSOAR_INSTALL_DIR` env).
- Then immediately: `flysoar search -o SFO -d JFK -D YYYY-MM-DD`. **Search needs no account, no API key, no auth.** (README.md, install.sh)
- Machine guidance published at stable URLs: `https://flysoar-cli.vercel.app/SKILL.md` and `/llms.txt` (copied from repo SKILL.md by `website/scripts/copy-public-assets.js`, wired into predev/prebuild — machine-facing distribution is deliberate, not incidental).

## 2. Command surface (src/main.rs)

`search` (only network command), `update`, `info`, `uninstall`. Search flags: origin/destination/date/return, `--slices` multi-city, `--input JSON`, cabin (default economy), passengers (default 1), output json|csv|table, max-offers, timeout 90s, sort, nonstop-only, quiet, `--raw`, `--save path`. **No auth on any command.**

## 3. Auth

None in the CLI at all — no token storage, no env, no config. SKILL.md explicitly instructs agents to report results "without booking". Booking authority lives exclusively in the MCP host.

## 4. API shape (src/api.rs, src/models.rs)

- Single route: `POST https://flysoar.ai/api/search/stream`, SSE (`created`, `batch`, `offer`, `done`, `error`). No Authorization header (browser-like UA/Referer spoofing — do not copy).
- Flat request `{origin,destination,date,return_date?,cabin,passengers}` or `{slices:[…],cabin,passengers}`.
- Offer model: id/provider/cabins, total/base/tax + currency, expires_at, emissions, refund/change conditions, slices→segments (carrier, times, baggage, amenities). Normal output strips id/provider/conditions; `--raw` preserves. `--save` = local JSON; **no persistent journey state client-side**.
- CLI REST/SSE contract ≠ MCP contract; separate hosts.

## 5. MCP host (flysoar.ai/mcp — separate from CLI)

- Install one-liner: `codex mcp add soar_flights --url https://mcp.flysoar.ai/mcp --oauth-client-id soar-mcp`; upgrade with `codex mcp login soar_flights`.
- **Progressive authority tiers:** public keyless tools (`soar_search_flights`, `soar_search_stays`, `soar_get_live_flight_status`) → OAuth core tools (book_flight, list/get bookings, stay rates/reviews/bookings, quote_stay_cancellation — "quote does not cancel", discover_tools) → advanced wrappers (`soar_run_advanced_read_tool` / `_action_tool`, gated on "clear intent").
- OAuth: authorization-code + PKCE S256, dynamic client registration, scoped (flights.search, profile.*, travelers.*, bookings.read/write/cancel, trips.manage, support.write). Metadata at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` (bearer, progressive_tool_discovery:true, anonymous_flight_search:true, rate limits 5/min 30/hour).
- Observed inconsistency: MCP page claims 3 anonymous tools incl. stay search; metadata says anonymous stay search false, anonymous_tool_count 2. (Recorded, not resolved.)

## 6. Journey management split

Search is stateless; offer identity (`Offer.id`, `expires_at`) is the handoff token; select→book→manage transitions exist **only server-side behind OAuth**. Booking descriptions promise Soar handles "login/refresh/readiness/verification/payment". The CLI deliberately owns none of this.

## Transferable shape for AE

**Copy (T5 — no-credential readiness):** zero-credential public read as the anonymous tier; exact one-line install; published SKILL.md/llms.txt as the agent's manual, wired into the build so it can't go stale. AE already matches most of this (7/7 parity). Skip curl|sh unless checksummed/reproducible.

**Copy (T6 — MCP adapter):** a dedicated MCP host over the registered action registry with *progressive authority tiers*: anonymous read tools (services list/search/quote) → OAuth-scoped effectful tools (send request; later book) → discovery-gated advanced tools. Publish OAuth metadata via well-known endpoints; scope names should mirror AE authority modes. Tool descriptions must carry safety labels ("quote does not book") exactly like Soar's. Avoid Soar's page/metadata inconsistency — one source of truth for the anonymous tool count.

**Build (T10 — booking):** everything Soar's CLI lacks is what AE must design server-side: durable offer/booking identity, select → quote/refresh → explicit authorize → book → manage transitions, idempotency/replay, refusal and interruption semantics. Soar proves the *distribution* shape, not the booking kernel — AE's Prepared Action/Approval Grant machinery is already the right kernel; T10 is mostly capability contract + provider hosting.

**Skip:** UA/Referer spoofing, provider SSE quirks, summaries that strip offer ids/conditions (AE plans need ids for the decision trail), authless effectful anything.
