# AEcon health scorecard — 29 September 2026

Measured by ten read-only audits (detail in this folder), at main `722d85158` plus the uncommitted journey-fragility wave. Every number comes from the cited report.

| Area | Headline | Verdict |
|---|---|---|
| Size | 537k lines across 3,343 files. 283k lines of `src`+`convex` product code are held by the size ratchet at 206 files over 300 lines, 63 over 500 and 0 over 1,000. `tools/dev/local-dev.ts` is 1,316 lines ([size-hotspots](size-hotspots.md)) | Contained. `tools/` isn't gated |
| Duplication / dead code | 3.2% duplicated lines (879 clones). knip reports 930 unused value exports and 1,223 unused type exports. 3 unused dependencies: `@rjsf/validator-ajv8`, `react-resizable-panels`, `aislop` ([duplication](duplication-dead-code.md)) | Dead exports are the maintenance debt |
| Types / tests | 6 hand-written `as any`, 7 `as unknown as`, 55 runtime `!` not caught by the ratchet (including payment signing and Formance writes). 850 test files with about 6,100 cases. `convex/lib` has 561 source files and 14 colocated tests; 10 Convex domains have no tests. 517 `vi.mock` calls ([types-tests](types-tests.md)) | Strong types. Backend lib coverage is thin |
| Convex | 111 tables, all indexed (367 indexes), 613 functions (269 public), 12 crons. 2 functions lack validators, 2 action handlers lack return types, 9 `v.any()`. 3 OCC hot spots ([convex](convex.md)) | Healthy. Small fixes |
| Performance (static) | `/market` makes N+1 reads per Tool. Unindexed `.filter()` on `capabilityCalls`, payment attempts and journal. `.take(10001)` scans. **recharts is loaded on every page** through the command panel. No `React.lazy` anywhere ([performance-static](performance-static.md)) | Real client and backend wins available |
| Fragility | **Default `/market` still waits on six live Coinbase Bazaar searches** plus a Jev rerank. Quote and Call wait on Formance and, unless persisted, a live Provider probe. 78% of UI routes have an error boundary (13 without). Worksheet: 21 rows closed, 8 partial, 27 open ([fragility](fragility.md)) | Biggest remaining takedown point is Market serving from live upstream |
| Observability | Optional Sentry and PostHog, 497 `[ae.*]` log sites (446 are caught-only `degradeBackend`), `/api/health` and `/api/ready`, daily admin snapshot. **No journey alerts.** Search, Quote and publish have no SLI signal ([observability](observability.md)) | Blind in production |
| Build | `check` takes about 30 s. The full gate runs serially and took about 7 min locally. node_modules is 1.4 GB, 95 direct dependencies, 126 duplicate package names ([build](build.md)) | Fine for alpha |
| Dependencies | 0 critical, 3 high (transitive: fast-uri, js-yaml, browserslist), 6 moderate. `undici` direct fix available. 8 production dependencies a major version behind. No GPL; MPL-2.0 `lightningcss` is transitive ([dependencies](dependencies.md)) | Patch the highs |
| DX / docs | 5/10. Scripts and CLI verbs are real, but 10 env vars read in code are missing from `.env.example`, the Clerk issuer is marked optional where it's required, `AGENTS.md` cites a deleted file, and the CLI README omits 8 commands ([dx-docs](dx-docs.md)) | Onboarding unsafe to follow blind |

## Ranked next actions (fragility and maintainability first)

1. **Market serves from the persisted index.** Remove the six live Bazaar searches and the Jev wait from the default `/market` request. A scheduled refresh keeps the index current and Jev reranks only when it's already fast (protocol principles 1 and 3).
2. **Journey SLIs and one alert each** for search results, Quote success, Call terminal outcome (including outcome-unknown), funding completion and chat answer completion, using the existing `[ae.*]` events. Send to Sentry, which is already installed.
3. **Close the 13 routes without error boundaries** and the remaining 27 open worksheet rows.
4. **Client weight:** lazy-load the command panel chart (recharts) and other heavy leaves with `React.lazy`.
5. **Backend hot paths:** add indexes for the three unindexed `.filter()` sites, batch the `/market` N+1 reads, and bound the `.take(10001)` scans.
6. **Dead weight:** delete the 3 unused dependencies and knip's unused exports (in batches, with `npm run check`). Cover the 10 untested Convex domains through their public functions.
7. **Hygiene:** update the vulnerable transitive packages and `undici`. Align `.env.example` and `AGENTS.md` with the code. Add validators and return types to the 4 Convex functions flagged.
