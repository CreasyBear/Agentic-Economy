# RFC 9457 / CLI error-boundary design (2026-08-16)

Status: **complete**
Scope: whether to adopt a Problem Details library, how to consume untrusted remote problems, and CLI exit semantics for `not_found` / empty search / invalid query.

Agents:
- [Design reference audit](2c520a15-aebe-49e2-b8e2-49c4a37e7056)
- [Problem library survey](83718b8c-64b9-438a-ae5d-79d7f8ae8620)
- [Standards security research](b76dd646-2881-4557-8fe0-eb3e9bf3f694)

## Decision (locked)

**Keep the application-owned canonical mapper** in `src/lib/errors.ts` + `tools/ae/lib/output.ts`.
Do **not** add a third-party RFC 9457 runtime package or OpenAPI-codegen AE’s own HTTP/CLI error boundary.
Strengthen with installed **Zod** for wire decoding; treat remote `--base-url` problem bodies as untrusted; rebuild human text locally from canonical `kind`.

This is adopt-first compliant: the adopted artifacts are IETF RFC 9457 + Google AIP-193 conventions. External npm packages only cover generic serialization (~15–20 LOC), not taxonomy, inbound sanitization, or CLI scrubbing.

## Decision matrix

| Question | Answer | Authority |
| --- | --- | --- |
| New RFC 9457 npm package? | **No** | Library survey; Zod 3 / Hono / 7807 / class-hierarchy mismatches |
| OpenAPI client for AE errors? | **No** | Design audit; SSE + Convex + domain HTTP-200 outcomes |
| Untrusted remote `title`/`detail`? | **Suppress; rebuild locally** | RFC 9457 §3.1.3–3.1.4 (advisory / don’t parse); §5 leakage; hostile `--base-url` |
| Wire vs body `status`? | **Wire wins** for kind/exit; body advisory only | RFC 9457 §3.1.2 / §5 |
| Empty collection search? | Exit **0** | `gh` / `kubectl` / `npm` |
| Singular exact-id `not_found`? | Exit **1** (optional later `--ignore-not-found`) | Same CLIs; sysexits would use 65 — see divergence below |
| Validation library? | Installed **Zod 4** | Already in tree; library survey forbids Zod-3-locked packages |

## Normative constraints (RFC / security)

Compiled from [Standards security research](b76dd646-2881-4557-8fe0-eb3e9bf3f694) against primary sources.

### MUST

- Use `type` as primary problem identifier after resolution ([RFC 9457 §3.1.1](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.1.1)); default missing `type` to `about:blank`.
- Ignore members whose JSON type is wrong ([§3.1](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.1)).
- Ignore unrecognized extensions ([§3.2](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.2)).
- Treat HTTP wire status as authoritative for transport / generic software; body `status` is advisory ([§3.1.2](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.1.2), [§5](https://www.rfc-editor.org/rfc/rfc9457.html#section-5)).
- Bound JSON size/depth when accepting untrusted bodies ([RFC 8259 §9](https://www.rfc-editor.org/rfc/rfc8259.html#section-9); [CWE-400](https://cwe.mitre.org/data/definitions/400.html)).
- Strip VT/ANSI before TTY render of remote strings ([Node `util.stripVTControlCharacters`](https://nodejs.org/api/util.html#utilstripvtcontrolcharactersstr); [CWE-150](https://cwe.mitre.org/data/definitions/150.html)).
- Prefer `process.exitCode` over abrupt `process.exit()` so stdout flushes ([Node process docs](https://nodejs.org/api/process.html#processexitcode)).
- On cross-origin redirects, strip `Authorization` / cookies ([RFC 9110 §15.4](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4)) — AE already uses `redirect: 'manual'` in `callJson`.

### SHOULD / SHOULD NOT

- **SHOULD NOT** parse `detail` for machine branching ([RFC 9457 §3.1.4](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.1.4)).
- **SHOULD NOT** auto-dereference `type` / `instance` URIs ([§3.1.1](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.1.1), [§3.1.5](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.1.5); SSRF [CWE-918](https://cwe.mitre.org/data/definitions/918.html)).
- Prefer `Retry-After` header over body extensions for backoff ([RFC 9457 §4](https://www.rfc-editor.org/rfc/rfc9457.html#section-4), [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3)); clamp absurd delays.

## Library adoption search

| Rank | Package | Why not for AE |
| --- | --- | --- |
| **#1** | **No library** | Retain mapper |
| #2 | `@batkit/rfc9457` | Zod 3 peer vs repo Zod 4.4.3; no sanitization |
| #3 | `hono-problem-details` | Hono-only |
| #4 | `problem-response` | Wrapper only; ~1 weekly download |
| #5 | `rfc9457` (JohnAdib) | Rigid class hierarchy |
| #6 | `http-problem-details` | RFC 7807; legacy CJS |
| — | Nest/Fastify bindings | Framework DI |

## Deliberate divergences from the standards agent’s CLI sketch

These are intentional AE policy, not oversights:

1. **Untrusted remote prose is not preserved in `--json`.** The standards note allows sanitized title/detail pass-through for trusted problem bodies. AE’s CLI accepts arbitrary `--base-url`, so `remoteProblemToProblem` rebuilds title from local `kind` and drops remote `detail`/`nextAction`/`recovery`. Same-origin Answer problems already use catalog projection (`redactAnswerTurnProblem`).
2. **Exit codes stay `0` / `1` (plus existing command codes), not full BSD sysexits.** Mature agent CLIs (`gh`, `kubectl`, `npm`) and AE’s shipped JSON envelope use exit **1** for failure. Mapping every kind to 65/69/75/77 would break scripted consumers and is deferred unless an explicit CLI contract change is approved. Transient failures already carry `retryable` + `retryAfter` in the envelope.
3. **Domain HTTP-200 `not_found` / `no_candidates` are not transport problems.** Empty search → exit 0; exact-id miss → should exit 1 via `CliFailure`, not by inventing a 404 Problem for a 200 domain body.

## Gaps to close (implementation backlog)

1. Goblin P1s: exact selection `answer_turn_persist_failed`, search-only/no-execute gate, optional-field-as-second-intent, result/rationale recall.
2. CLI singular `inspect` / `demand business` `not_found` → exit **1** (+ optional `--ignore-not-found`).
3. Domain `unavailable` / invalid cursor that print-and-exit-0 → `CliFailure` exit **1**.
4. Zod schema decode for problem wire members (type-correctness + ignore-on-mismatch per §3.1).
5. Bound remote error body bytes/depth; strip VT controls if any remote human string path remains (local catalog titles are trusted).

## Repo-local authority

- `.planning/research/2026-08-07-error-handling-blast-radius.md`
- `.planning/codebase/CONVENTIONS.md`
- ADR-035 / gateway implementation plan
- PAPERCUTS G20 (RFC 9457 seam is deliberate, not needless hand-roll)
