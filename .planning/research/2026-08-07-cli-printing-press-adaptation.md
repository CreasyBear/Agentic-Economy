# CLI adaptation: printing-press.dev as reference, adapting our AE terminal bones

**Date:** 2026-08-07
**Status:** Analysis only — park for a later execution decision. No code changed.
**Sources:** https://printingpress.dev/ · https://github.com/mvanhorn/cli-printing-press (MIT, Go, README + landing copy) · our `tools/ae` source.

## TL;DR

Printing Press is a **generator meta-tool**: it reads any API's spec (or sniffs a
site with no public API), studies competing CLIs/MCP servers, and **prints a
per-API agent-native CLI + Claude/agent skill + MCP server** with a local SQLite
mirror, compound commands, a quality scorecard, and verification proofs. Its
product is the **factory**, not a single terminal.

Our `tools/ae` terminal is the inverse: **one** runner over **our own** onboarded
capability-execution seam (derived feeds, live keyless execution, evidence
hashing, fail-closed admission, honest unknown handling). It shares the *agent-
native goal* but was built around a real execution/marketplace/evidence contract
that Printing Press does not have.

The correct adaptation is a **shape + UX borrow, not a functional clone**:
- **Own** their agent-first conventions (typed exits, auto-JSON-when-piped,
  `--compact`, bounded output, actionable errors).
- **Consider** their unit of delivery — a typed CLI per onboarded capability —
  applied to OUR derived, honest catalog (not generated Go, not third-party
  target discovery).
- **Reject** the parts that contradict our contract: the local SQLite data-mirror
  (we execute live with evidence; a cache is a different value), the generator
  pipeline (we have no cross-API meta-need), the Go toolchain (repo is TS), and
  any scorecard/process-porn that RULES.MD's "tangible progress" clause forbids.

## 1. What Printing Press is

A Go binary (`cli-printing-press`) + agent skills (`/printing-press <app>`). It
turns a URL, OpenAPI spec, or HAR capture into a bundle:

```
one spec -> cli-printing-press -> <api>-pp-cli (Cobra CLI)
                                + <api>-pp-mcp (MCP server)
                                + /pp-<api> skill
                                + research/, proofs/, .printing-press.json provenance
```

The playbook it bakes in (Steinberger's discrawl/gogcli + Trevin Chow's
10 Principles for Agent-Native CLIs):

1. **Local SQLite mirror beats remote calls** — domain tables, FTS5, incremental
   `sync`, `sql` command; 50 ms compound queries the API can't answer (Linear
   `linear-pp-cli sql --compact <<SQL`).
2. **Compound commands beat ten round trips** — one call returns an insight
   (ESPN + flight-goat stitched; `health`, `similar`, `trends`, `bottleneck`).
3. **Agent-native CLI beats raw HTTP** — every flag chosen for a model consumer:
   typed exit codes (`0` ok, `2` usage, `3` not-found, `4` auth, `5` API, `7`
   rate-limit), **auto-JSON when piped** (no `--json` needed), `--compact`
   (60–80% fewer tokens), `--select`, `--dry-run`, `--no-input`, bounded output.
4. **Verify or it doesn't ship** — two-tier 100-pt scorecard (infrastructure +
   domain correctness), dogfood, proof-of-behavior (path/flag/pipeline/auth),
   read-only live smoke, anti-gaming rules; Grade A ≥ 85.
5. Everything ships **CLI + skill + MCP** from one prompt. "CLIs win for agents
   (100x fewer tokens than MCP tool defs); MCP wins for IDE discovery."

## 2. Our bones (what already aligns)

`tools/ae` already has strong DNA that we should keep and lean on:

| Printing Press tenet | Our equivalent | Verdict |
| --- | --- | --- |
| Agent handshake first | `ae manifest` (machine-readable protocol, feeds, toolset, evidence ceilings) | Keep — it's the same idea, arguably more honest (includes `evidenceCeilings`) |
| Derived, not hardcoded | feed catalog projected from onboard supply in `lib/feeds.ts` + `seed-supply.ts` | Keep — superior: adding an onboard keyless GET op changes the terminal with no CLI edit |
| Fail-closed / honest refusal | `run`/`study` refuse keyed/x402/path-segment ops; `study` emits `grounded/partial/no_live_value` | Keep — exceeds their "prints and claims" default |
| Evidence | `sha256` evidence hash per executed feed | Keep — a real receipt, not a score |
| Compound command | `compare` (parallel multi-feed table), `study` (discover→execute→attribute) | Keep — matches their compound-command goal |
| Governance | `policy test/refine/fidelity` with human review gate | Keep — unique to us; no reference equivalent |
| Live execution over provider data | `run` verifiably executes keyless ops (CoinGecko → BTC price) | Keep — the real product |

## 3. Gaps vs the reference

Where the press is ahead of us, in adaptation-relevant terms:

1. **Typed exits.** We return generic `1` everywhere (except `CliFailure` carrying
   an arbitrary exit code, and `0` on success). The press encodes `not-found`,
   `auth`, `rate-limited` as distinct codes so an agent self-corrects in one
   retry without parsing stderr. **Worth adopting** — small, high-value for agents.
2. **Auto-JSON when piped.** We require `--json`. The press emits JSON when stdout
   is not a TTY, no flag needed. **Worth adopting.**
3. **`--compact` / bounded output.** Our raw JSON dumps are token-heavy. A
   high-gravity-field mode would cut tokens for agent consumers. **Worth adopting.**
4. **Per-capability typed surface.** We have one generic `run <feed-id> k=v`.
   They ship a dedicated binary + subcommands per API
   (`linear-pp-cli sql --compact <<SQL`, `flight-goat ... cheapest first`).
   Our derived catalog is exactly the shape that maps to per-feed commands
   (`ae coingecko simple-price ids=bitcoin ...`) **without** per-API deployment.
5. **CLI + skill + MCP three-pack.** We have a CLI + manifest; no MCP server and
   no product-side agent "skill" (the repo deliberately removed its AE skill
   library, commit 28445844). Whether to re-add a skill/MCP surface is a product
   decision, not a mechanical one.

## 4. What to REJECT (context differences)

Do not cargo-cult these:

- **Local SQLite data mirror / `sync` / `sql`.** Our value is *executing* live
  capabilities with fresh evidence, not mirroring third-party data into a local
  store. A cache would change the evidence contract (a cached price is not "live
  provider data"); could even invite proof-class inflation. Do not mirror data;
  if offline result retention is ever wanted, it must stay *evidence history*,
  clearly labelled, never presented as a fresh live result.
- **The generator pipeline** (research brief, absorb gate, browser-sniff, phases,
  scorecard, shipcheck). We are not a factory for arbitrary third-party APIs; we
  run a registry we own. The scorecard/emboss machinery is exactly the
  **self-referential process [porn] that RULES.MD's "tangible progress" clause
  forbids** unless it's a hard gate for a named capability. Skip it.
- **Go toolchain / Cobra / goreleaser.** Repo is TypeScript/TanStack + Convex;
  lean rule 6 (reuse existing deps) and no new stack. If we build a printed-CLI
  surface, it's generated TS/`tsx` over the existing in-process executor, not Go.
- **Unverified "prints and claims" default.** We already refuse honestly
  (x402/path-segment/keyed non-executable, `no_live_value`). Keep our honesty
  contract over their scorecard optimism.

## 5. Concrete adaptation options (command anatomy)

### Option A — Agent-native harden the single terminal (smallest)

Apply the borrow list to the existing `ae` binary: typed exit codes,
auto-JSON-when-piped, `--compact`, bounded output, actionable errors. Command
surface unchanged:

```
ae run coingecko.simple-price ids=bitcoin vs_currencies=usd   # exit 0
ae run typo.feed ...                                           # exit 3 (not found)
```

Preserves every current seam; purely ergonomic. Roughly touches `lib/args.ts`,
`lib/output.ts`, `cli.ts` error mapping, and the command emitters.

### Option B — Per-feed typed commands within one binary (recommended middle)

Keep ONE `ae` terminal, but generate a first-class typed subcommand per derived
feed from the same catalog (`lib/feeds.ts`), so each capability gets its own
flags instead of `key=value`:

```
ae coingecko simple-price --ids bitcoin --vs-currencies usd
ae open-meteo forecast --latitude -33.8 --longitude 151.2 --current-weather
```

Same executor underneath; no per-API deployment, catalog stays derived. This is
the press's per-API binary idea applied to our honest, derived registry — the
closest faithful adaptation of "every capability gets a typed surface."

### Option C — Full three-pack (CLI + skill + MCP per feed)

Adds a generated MCP server and/or agent-skill per feed on top of B. Biggest
scope; touches MCP surface (`src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`)
and re-introduces a product-side "skill" concept (needs a deliberate reversal of
the AE skill-library removal). Only pursue as a product decision with a named
consumer.

## 6. Constraints that bind any adaptation

- **RULES.MD:** no process porn; proof-class inflation forbidden — execution
  results must stay live-provider evidence, never cached/mocked; refusal paths
  earn no credit but must remain honest, never silently upgraded.
- **CLAUDE.md / lean rules:** minimal code; reuse the in-process executor seam
  (`capability-execution`), don't reinvent it or add a Go stack.
- **Evidence class:** any CLI output stays "local execution against `--base-url` /
  in-process", never hosted/customer proof, per the existing manifest
  `evidenceCeilings`.
- **Derived-catalog invariant:** a per-feed typed surface MUST be generated from
  the onboard supply, never hand-maintained, or it drifts from the registry.

## 7. Recommendation

Adopt **Option B** (per-feed typed commands in one derived terminal) with the
**Option A** hardenings (typed exits, auto-JSON-when-piped, `--compact`), and
skip the mirror/generator/Go/scorecard concepts. This is the faithful reference
borrow that preserves our evidence+honesty advantages. Option C (skill+MCP pack)
only after a consumer is named, because it re-opens the removed AE-skill
question.

Open questions for a later decision:
1. Do we want typed exit-code semantics as a new machine contract (tested in
   `tests/`), or keep `0/1`?
2. Is an MCP server for keyless feeds in-scope (ties to the open MCP-adapter
   thread in `.planning/STATE.md`), or is the CLI the only surface for now?
