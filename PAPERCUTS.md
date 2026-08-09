# Papercuts

Small frictions logged from the service-DTO / agentic.market consolidation
(2026-08-07), each one: what I was doing → what got in the way.

## This session

1. Building the W1 origin seam: I expected `origin` on the capability offering
   alone to enrich `Service.endpoints[]`, but the seam needs **two** things —
   origin AND an `external_operation` access path on the catalog offering.
   Fixtures author `accessPaths:[]`, so endpoints[] were empty regardless of
   origin. Cause: the co-requisite was undocumented.

2. Threading origin through the seed: `publishCuratedCapability` ignores
   `input.offering` for non-direct (decoded) sources, so `origin` could not be
   passed as an offering override — it had to be threaded through
   `PublishCapabilityCommandInput` + `admitPublicationDraft` instead. Non-obvious
   seam.

3. Debugging a Convex validator: `v.literal(true)` in a return validator gave a
   misleading `Expected one of object, object, object` union failure. The real
   cause was `serializePrice` emitting a new `decimalAmount` key into the
   execution `commercial.price`, which the strict `publicPrice` union rejected.
   Several probe round-trips isolated it.

4. Access-path upsert refused non-owner actor refs (`wrong_owner`) — seed code
   must pass the business owner's `clerkUserId`, not a system actor.

5. Reseed `operation_conflict` on the access path came from non-deterministic
   publication ordering flipping the endpoint URL for the multi-op
   `agentic-market-exa` business. Fixed by sorting publications by `offeringId`
   and keying the upsert with a content-derived `operationKey`.

6. `exactOptionalPropertyTypes` makes persisting optional price fields into
   hashed/`StableHashValue` structures brittle (ripples into action-invocation /
   writer ports). Reverted price-persistence and instead populate the sub-cent
   decimal at the operation-read boundary.

7. Gotcha: `Id` is exported from `./_generated/dataModel`, not
   `./_generated/server`.

8. TypeScript does not narrow array-element types into arrow callbacks;
   `publicationRow[0]` inside a query `.eq()` closure flagged `possibly
   undefined` despite an outer ternary guard.

9. `vitest` suppresses `console.log` on passing tests — needed
   `--disable-console-intercept` (or a deliberately failing probe) to inspect
   output while debugging projections.

10. `read` elides function bodies in structural mode; must append `:raw` to get
    verbatim source. Cost a pass to re-fetch every projection file I needed.

11. `task` dispatch: the first call put `name/agent/task` on the wrapper object
    and failed with `Missing tasks` — the items must live in the `tasks[]` array.

12. `todo` init rejects `list` when passed as a bare string; it must be a phased
    `[{phase, items}]` array.

13. `git diff` on this shared dirty worktree shows **every** stream's changes
    (56 files for a change that touched 9) — can't isolate my work via diff;
    had to rely on the implementer's reported `files_changed` + targeted reads.

14. Ad-hoc tsx probes that import `@/...` need `--tsconfig tools/tsconfig.json`
    for the alias; a plain `tsx` run can't resolve it.

15. `yarn papercut` is documented in `AGENTS.md`, but this repo declares
    `packageManager: yarn@npm@11.5.1`, the installed Yarn 1 refuses that value,
    and `package.json` has no `papercut` script. The required logger is therefore
    unreachable; this entry had to be appended manually.

16. `@x402/core`'s `NetworkSchemaV2` cannot be embedded in this repo's Zod
    object because it comes from a different Zod runtime (`expected a Zod
    schema`). Composing it through `safeParse` works, but the dependency schema
    also accepts empty CAIP-2 references such as `eip155:`, so AE must add a
    minimal non-empty namespace/reference guard.

17. The curated Agentic Market rows look like x402 supply in labels/material
    terms, but every current Cluster C publication is admitted as
    `openapi_http`/`http-json:v1`. There is no authoritative CAIP-2 payment
    binding to project, so positive endpoint `pricing.network` coverage had to
    stay unit-level and the integration test must assert honest absence.

18. The old `*Minor` model hid two different policies behind one integer:
    asset/account balances need a pinned exponent, while catalog ranges and
    request totals can compare same-currency amounts across exponents exactly.
    Making this explicit required scale-aware common helpers plus boundary
    guards; a blanket “exponents always match” rule was too coarse.

19. All three UI-specialist subagents failed before editing with OpenRouter
    `402 Insufficient credits`; the same file-scoped contracts had to be
    re-dispatched to general workers.


20. Broad migration subagents can silently park without yielding even after
    landing partial edits. The work-tree cutover required cancelling the stuck
    worker, re-grepping the live tree, and splitting the remainder into four
    smaller exclusive slices.

21. The exact-money codemod blast radius was larger than source grep implied:
    production fields were clean, but the first full typecheck still reported
    419 diagnostics across 85 source, fixture, and test files. A source-only
    clean grep is not a useful completion gate for a clean-cut contract change.

22. Several partial migrations compiled far enough to hide dropped non-money
    fields/imports: `canonicalDigest`, policy `fallbackOrdinal`, provider
    availability timestamps, and `providerRef`. End-to-end fixture smokes, not
    structural replacement checks, exposed each regression.

23. Long-lived parked workers retain stale ownership and can wake after a new
    repair wave starts, producing duplicate ownership messages and partial
    overlapping edits. Every replacement worker had to re-read the shared file
    and preserve current state rather than trust its original assignment.

24. The OpenRouter contract fixture treated an explicit empty `tools: []` as
    tools still exposed. The strict selected-operation loop correctly withheld
    every tool after execution, but the fixture failed with
    `expected_tools_withheld_on_structured_round` until it checked list length.

25. A one-line `tsx -e` probe was not viable for the answer selector: top-level
    await defaulted to CJS, and the async-IIFE retry then failed on a package
    export boundary. The existing Vitest harness was the reliable probe.

26. The answer eval observed two real OpenRouter requests and the direct agent
    result recorded two model requests, but the persisted harness summary and
    private telemetry both reported zero. The selected-operation unit contract
    now proves the two-step accounting directly; persisted harness accounting
    still needs its own repair before evals can assert the same count.

27. Grepping `.env.local` for credential *names* also prints matching values,
    which exposed unrelated secrets while checking x402 prerequisites. A
    names-only environment inventory command is needed for safe diagnostics.

28. `npm run dev:local` configures the Convex environment before starting the
    app but assumes the local Convex backend already exists; with no backend it
    retries an opaque `fetch failed` six times and exits. The script name reads
    as a complete local-stack launcher even though it is not one.

29. `npx convex dev --local` now exits because `--local` is deprecated, while a
    plain `npx convex dev` first prompts to link the stale anonymous deployment.
    The local-development instructions and automation have drifted from the
    installed Convex CLI.

30. The live answer smoke could not reach the changed path because current
    Convex codegen cannot bundle several Node-only imports (`network-guard`,
    Clerk keyless storage, and `undici`) into the default runtime. Vite starts,
    but `/api/answer/turn` returns 500 while local Convex is unavailable.

31. Passing `-t turn-capability-tool-executes` to a multi-file Vitest command
    silently skipped every other focused file. The source regression suite had
    to be rerun without the name filter.

32. The Service DTO cutover left generated `/SKILL.md` and `llms.txt` prose,
    plus SEO assertions, teaching the retired per-offering
    `summary`/`pricingSummary`/`price` shape and the wrong list pagination.
    Those agent-facing contracts were not derived from the canonical Service
    schema, so the stale test actively blocked the correction.

33. `offeringOperationMap` rebuilt eligibility from `record.integrated` and
    `offeringRef` alone instead of reusing `catalogOriginIsCurrent` and carrying
    routeability, revision, and declared access-path identity. That made a
    convenient projection seam capable of overclaiming stale or unrouteable
    settlement.

34. The full `tests/imports` gate currently mixes this cutover's boundary
    failures with unrelated concurrent retirement, UI, and seed changes. A
    targeted `private-imports`/`ts-standards` rerun was needed to distinguish
    owned regressions from the shared dirty tree.

35. `@cfworker/json-schema` mutates schemas while dereferencing them. Passing
    the immutable output schema from `defineCapabilityContract` made every
    otherwise-valid production response fail closed as `response_invalid`;
    validation now clones the schema first.

36. x402 publication admission compared the declared route and asset exponents
    but did not prove the fixed price could be rescaled losslessly. A price could
    therefore publish successfully and then be refused by every invocation.

37. The keyless CoinGecko seed described a normalized array response while the
    real endpoint returns an object keyed by coin id. The seed-only executor
    omitted output validation, so the eval passed while the deployed descriptor
    would reject the live provider response.

38. The documented `yarn papercut` command is unavailable in this checkout:
    global Yarn 1 refuses `packageManager: "yarn@npm@11.5.1"`, and the repo has
    no `papercut` package script or executable. Audit frictions therefore had
    to be appended directly to this ledger.

39. The offering-level operation map broadcast one operationRef, parameter
    schema, and price onto every external path under an offering. A trustworthy
    market projection needs exact access-path ref/source-hash/URL/method
    matching and one map entry per operation.

40. Registry search could stop at an internal document cap and still report
    `hasMore: false`; stop-word stripping could also turn ordinary queries such
    as "discover providers" into no-match or broad fallback behavior. Green
    small-fixture tests did not exercise either market-scale condition.

41. `AeServiceRow` keyed expansion by endpoint id alone, but endpoint ids are
    offering refs and can repeat across businesses. Expanding one row could
    expand an unrelated business's row.

42. Answer evaluation helpers used seeded descriptors and mocked provider
    replies while describing the evidence as live. This made local tool
    plumbing look like real-provider proof.

43. Convex codegen pulled Node-only DNS/network/Buffer/undici/Clerk imports into
    the default bundle despite the intended Node action boundaries. This
    blocked the full local stack and therefore browser QA of the Services API.

44. The canonical Services cutover shipped no `GET /api/v1/services/:id`
    detail route even though the mirrored market contract and generated agent
    instructions need one. List-only parity tests did not catch the missing
    navigation surface.

45. The projection snapshot decoder required access-path lineage after the DTO
    cutover, but its encoder and Convex table validator still dropped/rejected
    those fields. The catalog swallowed the decode error into
    `no_published_offerings`, obscuring the real schema mismatch.

46. `hub` process readiness accepted port 3000 because an unrelated server
    already owned it, even though the newly started Vite process logged that it
    moved to port 3001. The browser smoke initially hit stale process output.

47. The canonical Services API was present in generated `llms.txt` and
    `SKILL.md`, but the human-facing `/for-agents` route still advertised only
    `/api/businesses`. Browser QA was needed to catch the stale discovery card.

48. Starting Vite with `CONVEX_URL` and `VITE_CONVEX_URL` unset still loaded
    the checkout's local Convex URL through the env runner. The Services smoke
    then failed at `127.0.0.1:3210` instead of selecting the fixture source, so
    the HTTP route cannot be exercised without the currently blocked Convex
    bundle.

## Chat + CLI anger test — 2026-08-08

Parallel browser and CLI agents tested the live local chat surface, keyless
capability execution, buyer journeys, hostile inputs, multi-turn recovery,
responsive/accessibility behavior, and external-agent commands.

1. **P1 — local-E2E chat still required Convex for rate admission.** The
   in-memory answer-thread port and seeded keyless descriptors were active, but
   `POST /api/answer/turn` failed with `missing_convex_url` in
   `admitAnswerTurn`. Every browser ask then remained on “Searching listed
   businesses…” for up to 95 seconds instead of reaching a terminal error.

2. **P1 — Stop and New question were decorative during failure.** Across
   capability, buyer, hostile, and context probes, both controls accepted a
   click without changing the spinner, URL, disabled composer, or pending turn.
   A dependency failure trapped the user until a full navigation.

3. **P1/P2 — the chat hid a terminal server failure behind optimistic work
   theatre.** Bitcoin, FX, weather, Wikipedia, plumber, accountant, nonsense,
   prompt-injection, and unsupported-payment asks all displayed the same
   “Searching listings / Reading details / Preparing next step” sequence with
   no result, refusal, timeout, or retry guidance.

4. **P2 — homepage and answer query limits disagreed.** The composer and answer
   request accept 200 characters, while `/` and `/t/new` silently truncated URL
   queries to 120. A 2,938-character probe lost 2,818 characters without any
   validation message.

5. **P2 — urgent intent was contradicted by the pending UI.** “I need an
   emergency plumber in Parramatta tonight” immediately rendered “When do you
   need this?” with disabled “Flexible” selected. The shell looked as though it
   had ignored an explicit hard constraint before interpretation completed.

6. **P2 — repeated browser page errors had no usable attribution.** Fresh chat
   navigations repeatedly raised `SyntaxError: Unexpected token '('` without a
   source location, while the visible shell stayed pending. This needs
   re-probing after the answer-route blocker is removed before assigning a
   separate root cause.

7. **P1/P2 — mobile and progress disclosures appeared interactive but did
   nothing.** At 390 px, `Open public menu` did not open via pointer, Enter, or
   Space. The expanded “Searching listed businesses…” disclosure also did not
   toggle. Both may share the hydration/runtime failure and require a clean
   post-fix retest.

8. **P2 — live regions may announce the same loading state repeatedly.** The
   chat exposes a live `role=log`, a nested polite transcript region, and a
   separate polite “Finding the right business” status simultaneously.

9. **P2 — CLI source failures lost the useful cause.** With Convex unavailable,
   `feeds`, `manifest`, and `run` collapsed to `Command failed.` /
   `INTERNAL unexpected_error`; HTTP `ask` reported only
   `/api/answer/turn returned 500`. None explained the missing source or how to
   recover.

10. **P1 security hygiene — malformed CLI JSON echoed the supplied payload.**
    `ae action ... '{"apiKey":"TOPSECRET",}' --json` returned the secret-bearing
    input verbatim in its `INVALID_ARGUMENT` message.

11. **Fixture coverage was narrower than homepage promises.** Fixture CLI
    discovery exposed five executable feeds and successfully executed live
    CoinGecko and Open-Meteo calls with canonical refs and evidence hashes, but
    had no Frankfurter FX or Wikipedia feed even though both are homepage
    example asks. This is a fixture/teaching mismatch, not proof that deployed
    supply is absent.

Green observations: direct CLI CoinGecko and Open-Meteo execution returned real
provider JSON with canonical operation refs and evidence hashes; HTML/script
payloads were escaped; no private values leaked from chat; desktop/mobile
layouts had no horizontal overflow; root keyboard navigation and skip-link
behavior were sound.

## Services mirror live verification — 2026-08-08

1. **P1 — broad public barrels made the Convex schema emit dependency
   chunks that the local deployment did not load.** `convex/schema.ts`
   indirectly reached `registry/public` → `capability-supply/public` → the
   Viem x402 signer. Convex bundled `schema.js` with `_deps/*.js`, then rejected
   it with `NoImportModuleInSchema`. Bundle-safe registry, catalog, and
   discovery schema-value seams removed the runtime dependency chunks.

2. **P2 — the local backend rejected the workstation's default Node 25 even
   though supported Node versions were installed.** Convex reported that no
   Node 18/20/22/24 runtime existed until the command's `PATH` explicitly
   selected the installed Node 22 binary.

3. **P2 — stale anonymous-local data blocked a clean schema push.** An
   `answerThreads` row still carried the removed `sharePolicy` field, so schema
   validation failed before the Services API could be exercised. Verification
   required a separate clean local fixture; the original local state was
   preserved and restored afterward.

4. **P2 — shared-tree verification still has unrelated red gates.** Root
   `tsc` stops on two callable-union errors in
   `tests/unit/routes/home-work-tree-loop.test.ts`; the capability-supply
   boundary test still requires the removed source-text fragment
   `DEV_SEED_BUSINESS_FIXTURES.filter`; and the TypeScript standards scan
   reports existing transport double-casts plus a non-null assertion. Focused
   Services, curated-seed, answer-tool, and private-import gates pass.

5. **P2 — positive keyed-provider verification needs an external
   credential.** No Exa, OpenWeather, SerpAPI, Tavily, or CoinGecko demo key is
   configured in the current environment, and SerpAPI's public `demo`
   credential returned HTTP 401. Real keyless CoinGecko and Open-Meteo probes
   passed; the user explicitly waived the remaining keyed live call rather
   than treating a fixture, refusal, or unrelated provider as proof.

49. Restoring the papercut workflow: `AGENTS.md` pointed to Yarn, but this
    npm-managed checkout had no usable Yarn command or `papercut` package
    script. The new `npm run papercut -- -m <model> "message"` logger now
    appends safely without rewriting prior entries.

50. openai-codex/gpt-5.6-sol: Two designer subagents assigned narrow chat UI fixes exited after only announcing their first read, with no diagnostic or edit. Both slices had to be re-dispatched to general task agents, adding a silent multi-minute retry.

51. openai-codex/gpt-5.6-sol: dev:local inherited a stale workstation CONVEX_DEPLOYMENT selector, silently overriding the repository's valid .env.local selector and producing misleading anonymous-mode/project-access failures.

52. openai-codex/gpt-5.6-sol: A clean local Convex database loses deployment environment variables, so the first schema push fails on required CLERK_JWT_ISSUER_DOMAIN before the normal post-deploy setup command can run.

53. openai-codex/gpt-5.6-sol: OpenRouter require_parameters rejects parallel_tool_calls=false as an unsupported requested parameter, returning 'No endpoints found' even for models that support tools and structured outputs; the answer agent should rely on its serial execution queue instead of sending that provider option.

54. openai-codex/gpt-5.6-sol: rankOperationSearchText tokenized candidate text case-insensitively but tokenized the user query without lowercasing, so a capitalized natural-language request such as 'Convert 100 US dollars to euros' silently missed the Frankfurter capability.

55. openai-codex/gpt-5.6-sol: The Vite dev server hot-reloads files while concurrent writers are between surgical edits, surfacing transient parse-error 500s and stale module errors during browser smoke tests; local validation needs a settled-write/restart boundary.

56. openai-codex/gpt-5.6-sol: The repository requests yarn papercut but packageManager is malformed as yarn@npm@11.5.1, so Corepack Yarn refuses every command; npm run papercut is the only working path.

57. openai-codex/gpt-5.6-sol: The documented yarn papercut command fails because package.json declares npm@11.5.1 while global Yarn 1 interprets it as an invalid yarn@npm packageManager; npm run papercut is required.

58. openai-codex/gpt-5.6-sol: Initial /t/new queries issued two identical POST /api/answer/turn requests because the client turn key changed across route remounts, duplicating threads and model spend.

59. openai-codex/gpt-5.6-sol: The answer agent defaulted maxOutputTokens to 65536, causing OpenRouter to reserve excessive credit and return 402 for short answers when no env override was set.

60. openai-codex/gpt-5.6-sol: Seeded capability readiness expired after five minutes because scheduleDueCapabilityProbes had no cron registration, silently making the executable catalog empty.

61. openai-codex/gpt-5.6-sol: Convex rejected active keyless descriptors whose input schema contained a JSON Schema  key because the return validator used v.record(v.string(), v.any()).

62. openai-codex/gpt-5.6-sol: Seed execution rebuilt input schemas from adapter query parameters and ignored the canonical input schema, so operation inputs such as Frankfurter quotes[] drifted from their contracts.

63. openai-codex/gpt-5.6-sol: The answer agent could return a local-service/catalog fallback after operation.execute completed; execution and result-grounded prose needed separate constrained model calls.

64. openai-codex/gpt-5.6-sol: DeepSeek sometimes answered without calling the selected capability even when activeTools contained only that tool; the execution step required toolChoice required.

65. openai-codex/gpt-5.6-sol: Open-Meteo forecast defaulted current_weather to false, so a right-now weather execution could succeed without returning a current condition.

66. openai-codex/gpt-5.6-sol: Repeated live model smoke tests exhausted the configured OpenRouter credits; direct capability execution stayed healthy but model-backed answer completion returned provider 402.

67. openai-codex/gpt-5.6-sol: Convex rejected active keyless descriptors whose input schema contained the JSON Schema $schema metadata key because the return validator used v.record(v.string(), v.any()).

68. openai-codex/gpt-5.6-sol: The homepage advertised 'Search the web for the latest on electric cars' even though the executable answer catalog had no general web-search operation; the turn silently fell into local-business registry search.

69. openai-codex/gpt-5.6-sol: Generic lexical terms such as search/latest/current/value could rank an unrelated keyless operation (for example geocoding) when no capability in the requested domain was executable.

70. openai-codex/gpt-5.6-sol: Successful zero-provider capability answers inherited the business empty-state layout, which added 'Try another way', local-business recovery prompts, and repeated interpret/route/read work rows after a real operation result.

71. openai-codex/gpt-5.6-sol: An explicit 'Search the web' request fell through to local-business registry search when no web capability matched, producing contradictory business workflow copy instead of an honest capability-unavailable answer.

72. openai-codex/gpt-5.6-sol: Generic operation-search words such as search/find/latest/web could rank unrelated capabilities by action vocabulary alone; meaningful domain-token overlap is required before capability selection.

73. openai-codex/gpt-5.6-sol: Data and capability-unavailable answers inherited business-only timing controls and match/contact guidance in the follow-up composer; follow-up chrome must derive from the completed answer layout.

74. openai-codex/gpt-5.6-sol: Completed capability work disclosure still labelled the operation 'Running ...'; terminal work rows need completed verbs ('Ran'/'Tried') rather than preserved loading-state copy.

75. openai-codex/gpt-5.6-sol: Repository-wide typecheck is currently blocked by concurrent answer-thread contract drift (finalStatus/stopAnswerTurn/problem optionality and AnswerTurnFrame), while the scoped chat regression and lint gates pass.

76. openai-codex/gpt-5.6-sol: Broad capability-option answers were silently replaced with the local-business 'No matches' fallback whenever no operation executed; candidate-backed prose must bypass that fallback.

77. openai-codex/gpt-5.6-sol: Curated reseeding can leave stale current publications and mappings after source-contract drift, so later seeds fail with duplicate identities until stale rows are explicitly retired.

78. openai-codex/gpt-5.6-sol: Capability readiness probe entry points have easy-to-confuse validators: scheduleDueCapabilityProbes accepts no limit, readCapabilityProbeTarget requires expectedRevision, and readiness probe itself accepts only publicationRef plus expectedRevision.

79. openai-codex/gpt-5.6-sol: CoinGecko live smoke tests intermittently receive HTTP 429, producing honest but non-deterministic refusal answers even when the published capability and execution path are healthy.

80. openai-codex/gpt-5.6-sol: The live answer UI's follow-up textarea is present and enabled, but browser helper fill/type calls timed out; direct DOM input-event dispatch was required to exercise the multi-turn flow.

81. openai-codex/gpt-5.6-sol: The documented yarn papercut command is unusable because package.json declares packageManager yarn@npm@11.5.1 while the workstation has Yarn 1; npm run papercut is the working path.

82. openai-codex/gpt-5.6-sol: With multiple ranked capability candidates, a specific live-data request still used toolChoice=auto and the model returned an execution plan instead of running a source; specific requests now require the model to choose one candidate tool.

83. openai-codex/gpt-5.6-sol: Seed-derived executable descriptors used businessSlug as the capability name, so broad source answers exposed internal-looking slugs instead of the contract's published name.

84. openai-codex/gpt-5.6-sol: The answer agent kept a capability-id-specific example override registry even though admitted contracts already carry standard inputExamples; publication examples now flow through descriptors generically.

85. openai-codex/gpt-5.6-sol: Candidate prompts exposed capabilityId even though option answers only need published name and summary; the model transformed IDs into unsupported slug-like names.

## 20-goblin cross-surface audit — 2026-08-09

### Method and evidence boundary

This section is the durable synthesis of `RULES.MD`, the current ledger above, every raw report `G01.md` through `G20.md`, and verifier reports `V1.md` through `V4.md`. Verifier verdicts control disposition: a goblin's raw severity or root-cause guess is not promoted when the verifier marked it duplicate, environment, overstated, or rejected. Runtime/browser/HTTP observations are distinguished from source/test/library inspection; fixtures, local-E2E principals, in-memory stores, fake IDs, retained captures, and secondary processes are not live production proof. No tests, lint, typecheck, build, formatter, credentialed write, payment, notification, account, or provider side effect was credited as evidence in this append.

### Persona coverage and disposition

| Persona | Goblin evidence IDs represented | Disposition / durable destination |
|---|---|---|
| G01 — first-time desktop buyer | G01-1, G01-2, G01-3 | G01-1 → GC-001; G01-2 → GC-002; G01-3 → ENV-001 (existing source/runtime blocker). |
| G02 — direct capability buyer | G02-1, G02-2, G02-3, G02-4, G02-5, G02-6 | G02-1 → GC-003; G02-2 → DUP-001; G02-3 and narrowed G02-5 → GC-025; G02-4 → DUP-002; G02-5's “hidden operation” claim is REJ-001; G02-6 → DUP-003. |
| G03 — complex multi-constraint buyer | G03-1, G03-2, G03-3, G03-4, G03-5 | G03-1 → GC-002/GC-003; G03-2 and G03-4 → GC-005; G03-3 → DUP-004; G03-5 → DUP-005. |
| G04 — urgent local-service user | G04-1, G04-2, G04-3, G04-4, G04-5 | G04-1 folds into GC-002; G04-2 folds into GC-001; G04-3/G04-4 → GC-005; G04-5 → GC-026. |
| G05 — hostile inputs | G05-1, G05-2, G05-3, G05-4, G05-5 | G05-1 → GC-004; G05-2 → DUP-003; G05-3 → DUP-004; G05-4 → DUP-005 and the safety-layout part of GC-004; G05-5 → GC-035. |
| G06 — thread lifecycle | G06-1, G06-2 | ENV-002 pending single-owner persistent-backend proof; no product regression is opened. |
| G07 — mobile keyboard/screen-reader phone | G07-1, G07-2, G07-3, G07-4, G07-5 | G07-1/G07-5 → GC-011; G07-2 → GC-029; G07-3 → DUP-004; G07-4 → DUP-006. |
| G08 — low vision/motion | G08-1, G08-2, G08-3, G08-4 | G08-1 → GC-027; G08-2/G08-3 → GC-028; G08-4 → GC-036. |
| G09 — price/payment buyer | G09-1, G09-2, G09-3 | G09-1 → DUP-007; G09-2 → ENV-001; G09-3 → ENV-001 (quote member). |
| G10 — catalog shopper | G10-1, G10-2, G10-3, G10-4 | G10-1 → ENV-001; G10-2/G10-3 → GC-012; G10-4 → GC-013. |
| G11 — supplier prospect | G11-1, G11-2, G11-3 | G11-1/G11-3 → ENV-001; G11-2 → GC-014. |
| G12 — signed-out owner | G12-1, G12-2, G12-3 | G12-1 → GC-006; G12-2 → ENV-003; G12-3 → GC-042. |
| G13 — non-admin operator | G13-1 | ENV-003; a real non-admin identity was not available, so no authorization defect is claimed. |
| G14 — developer/docs/API client | G14-1, G14-2, G14-3, G14-4, G14-5, G14-6 | G14-1 → GC-007; G14-2 → GC-008; G14-3 → DUP-008; G14-4 → DUP-009; G14-5 → GC-043; G14-6 → GC-044. |
| G15 — cold CLI novice | G15-1 | G15-1 → GC-032. |
| G16 — market-terminal CLI | G16-1, G16-2 | G16-1's env-parity defect → GC-030; its stale `INTERNAL/unexpected_error` subclaim → REJ-009; G16-2 → GC-031. |
| G17 — MCP client | G17-1, G17-2, G17-3, G17-4 | G17-1 → GC-015; G17-2 → GC-016; G17-3 → GC-017; G17-4 → GC-033. Positive registry-result proof remains ENV-001-blocked. |
| G18 — OAuth/device agent | G18-1, G18-2, G18-3, G18-4, G18-5 | G18-1 → ENV-004; G18-2 → GC-009; G18-3 → REJ-002; G18-4 → GC-018; G18-5 → GC-019. |
| G19 — API breaker | G19-1, G19-2, G19-3, G19-4 | G19-1 → GC-020; G19-2 → GC-034; G19-3 → GC-023; G19-4 → GC-024. |
| G20 — senior maintainer | G20-1 through G20-16 | G20-1 → GC-010; G20-4 → GC-037; G20-5 → GC-021; G20-7 → GC-038; G20-10 → GC-039; G20-12 → GC-040; G20-13 → GC-022; G20-16 → GC-041. G20-2/G20-3/G20-6/G20-8/G20-9/G20-14 → REJ-003–REJ-008; G20-11 → DUP-010; G20-15 → DUP-011. |

### Deduped ranked open queue

Status is `open` for every row below. The queue is ranked by release/security/authority risk first, then public protocol and user-facing correctness, then P3 maintainability/source hygiene. Each row names the existing seam or standard that should carry the fix; no new framework or parallel authority is implied.

| ID | Severity | Status | Goblin evidence IDs | Exact surface / root | User impact | Minimal existing-library/native/protocol-grounded fix |
|---|---|---|---|---|---|---|
| GC-001 | P1 | open | G01-1, G04-2 | Answer candidate exposure/execution: `keyless-data-ask.ts` + `turns/agent.ts`; final domain eligibility is not authoritative after ranking/model choice. | A plumbing request can visibly and durably run `thecatapi-image-search`, undermining trust even when no contact occurs. | Reuse the typed ranked candidate set and `rankOperationSearchText` as a final deterministic domain-overlap gate immediately before exposure/execution; fail closed to clarification/capability-unavailable and keep the executor fail-closed. |
| GC-002 | P1 | open | G01-2, G03-1, G04-1 | Local location provenance: `answer-response-planner.ts`, `provider-location-filter.ts`, `location-intent.ts`; explicit place text can lose to configured Perth context. | Buyers are told their request is “near Perth” despite naming no location or naming Parramatta, and search/contact scope is silently wrong. | Tighten the existing location parser at service/constraint delimiters; require an explicit location or a visibly labelled, confirmed context default before search, geocoding, URLs, or contact scope. |
| GC-003 | P1 | open | G02-1, G03-1 | Selected Open-Meteo forecast/geocoding input construction; generic coordinate contracts have no deterministic city→coordinates composition in the selected-operation path. | Melbourne/Parramatta requests can produce HTTP 400 or contract-invalid results and then ask for information already supplied. | Inspect exact operation input/response, compose city through the existing geocoding/forecast contracts, and preserve strict `operation-execute` validation and the real provider error; do not rewrite the canonical schema blindly. |
| GC-004 | P1 | open | G05-1, G05-4 | Safety and refusal boundary in `turn-orchestrator.ts` precedes business discovery only weakly; refusal/no-match layout still exposes local controls. | Harmful requests appear to be ordinary searches and expose timing/browse/contact affordances, even though no harmful instruction or effect was produced. | Put typed safety classification/refusal before registry retrieval; project a refusal/capability-unavailable `AnswerLayoutProfile` that suppresses business timing, matching, browsing, and contact, retaining only safe retry/new-ask actions. |
| GC-005 | P1/P2 | open | G03-2, G03-4, G04-3, G04-4 | Same-thread recovery: empty frozen-provider branch in `turn-orchestrator.ts`, whole-prose recovery in `snapshot-artifacts.ts`, and unconditional selected-business copy in `turn-context.ts`/follow-up prose. | Corrective constraints do not restart search; rationale asks become generic empty cards; “nearby” links corrupt the query; no-match answers claim a selected business. | Use the existing structured search context and durable work/evidence projection for a recovery state machine: rerun validated search when new constraints arrive, add a deterministic rationale branch, build prompts from normalized fields, and gate selected-business language on validated provider identity/contact route. |
| GC-006 | P1 | open | G12-1 | Fake/invalid OAuth authorization read: `oauth.authorize.ts` + `_operator/agent-access.authorize.tsx`; failed source response does not converge the consent UI. | An invalid assistant authorization can remain on “Loading access request” with no retry or return path, while the server exposes an unhandled 500. | Map invalid/unavailable grants through the existing `problem()`/OAuth error seam and make every non-OK/abort read reach the existing `Access request unavailable` state with safe retry/return; keep approval/deny unreachable before consent details. |
| GC-007 | P1 | open | G14-1 | Public no-key answer examples: `agent-entry.ts`, `agent-skill.ts`, `api.answer.turn.ts`; generated curl omits required `X-AE-Turn-Key`. | A cold API consumer follows the published command and receives 400 instead of the promised SSE; adding an undocumented header is the only demonstrated first success. | Generate/send an opaque idempotency/correlation header in SKILL, llms, `/for-agents`, UCP/entry metadata, and examples, explicitly saying it is not a credential; retain the durable reservation safety gate and retest SSE→readback. |
| GC-008 | P1 | open | G14-2 | `/SKILL.md` content negotiation: route handler exists, but `agent-content-negotiation`/adapter sends ordinary non-HTML GETs to `Cannot GET`. | curl/fetch clients following the advertised instruction URL receive HTML 404 while browser navigation succeeds. | Make the existing markdown handler authoritative for default, JSON, text, and markdown `Accept` values; preserve `discoveryResponse` markdown/CORS/cache/nosniff headers and add running-adapter probes. |
| GC-009 | P1 | open | G18-2 | OAuth error projection: `oauthError` currently returns generic RFC 9457 `problem()` without an OAuth `error` member. | OAuth/device clients cannot distinguish `authorization_pending`, `slow_down`, `access_denied`, `invalid_grant`, and invalid request without AE-specific parsing. | Add an OAuth-specific serializer carrying RFC 6749/8628 `error` and safe `error_description`/headers while retaining the internal Problem Details model for non-OAuth routes; bind redirect `state` only after validated client/redirect. |
| GC-010 | P1 | open | G20-1 | PR workflow `.github/workflows/kernel-release-gate.yml`: `pull_request` job injects `CONVEX_DEPLOY_KEY` before running checkout-controlled codegen. | A PR-modifiable checkout can read a deployment credential, creating a release/security boundary exposure. | Determine whether codegen actually needs deployment configuration, then remove the secret from the PR job or move credentialed proof behind protected branch/environment controls; masking output is insufficient. |
| GC-011 | P1/P2 | open | G07-1, G07-5 | Controlled Radix Dialog/Sheet wrappers and `AeChat` mobile sidebar: closed content remains mounted, focus does not return, and `aria-modal` is absent. | Escape can leave a full-screen closed dialog tabbable and pointer-intercepting; screen readers may miss explicit modal semantics. | Keep the installed Radix/shadcn seam; use opener ref + `onCloseAutoFocus`, unmount or apply `aria-hidden`, `inert`, and `pointer-events:none` to closed content, and add `aria-modal="true"` only if the installed primitive does not emit it. |
| GC-012 | P2 | open | G10-2, G10-3 | Owner/public catalog projection: `owner-claim.functions.ts`/`claim.success.tsx` read fixture/local status while `$slug.tsx` and `$slug.inquiry.tsx` independently read unavailable public source; outage states fall through route metadata. | Owners can be told a page is live while its public listing/inquiry fails; 500s are titled “Page not found” or show the wrong inquiry shell. | Reuse typed `PublicBusinessPageRouteReadback`, `UnavailableInquiry`, and RFC 9457/source-unavailable unions; gate “live/discoverable” on the same public readiness, and keep not-found, unavailable, title, status, and body distinct. |
| GC-013 | P2 | open | G10-4 | Public error/recovery IA: `AeNotFound`/listing fallback link “Browse businesses”/“Back to services” to Ask-only `/`; no browse route exists. | Catalog shoppers land on a composer with no listing, search, or pagination after being promised a catalog. | Point to the existing canonical browse route if one exists; otherwise rename the links to “Start a new question”/“Ask a question” rather than inventing a second catalog page. |
| GC-014 | P2 | open | G11-2 | Supplier origin handoff: `AeFindMyBusiness` hard-codes `/claim/form`, while `claim.tsx` and `claim.success.tsx` preserve `source=supply`. | A supplier who is not found loses the supply journey and its post-claim “List an API service” handoff. | Thread the existing typed optional route search through `AeFindMyBusiness` and preserve `source=supply` through form and success; no analytics/session mechanism is needed. |
| GC-042 | P2 | open | G12-3 | Operator unmatched descendant `/agent-access/unknown`: `_operator.tsx` composes the public route-missing shell underneath the operator shell. | Users get duplicate H1/main/nav/skip-link landmarks and no direct assistant-access recovery link. | Reuse the operator route error-state seam to render one owner-aware 404 with one landmark set and `Back to assistant access`; do not mount the public not-found shell twice. |
| GC-015 | P2 | open | G17-1 | MCP action projection: `mcp-api.ts` catches every `action.run` exception and emits only `isError: true` / `Action failed.`. | MCP clients cannot distinguish not-found/no-data from source outage or internal failure, even though action unions define those states. | Reuse `src/lib/errors.ts`, action output/error contracts, and MCP's execution-error envelope: preserve typed successes/no-data, emit a redacted stable code/retryability signal with `isError: true`, and never expose raw exceptions. |
| GC-016 | P2 | open | G17-2 | MCP bounded body adapter: `readBoundedRequestText` returns `payload_too_large`, but `boundedMcpRequest` replaces it with an empty body. | A body over 64 KiB is reported as malformed JSON `-32700`, hiding the actual size boundary and recovery. | Preserve the existing discriminant and project canonical `PAYLOAD_TOO_LARGE`/413 (or the SDK's safe equivalent); never parse an over-limit body as empty JSON. |
| GC-017 | P2 | open | G17-3 | MCP top-level request validation through installed SDK: unclassified Zod errors become JSON-RPC `-32603` with raw multiline text, unlike nested tool validation. | Machine clients see Internal Error and Zod dumps instead of `-32602 Invalid params`, making recovery and telemetry unreliable. | Use the pinned MCP SDK's `McpError(ErrorCode.InvalidParams)` path or a version-current SDK classification seam; return concise redacted messages and do not regex-rewrite or hand-roll JSON-RPC parsing. |
| GC-018 | P2 | open | G18-4 | OAuth dynamic registration `readJson` parses without checking `Content-Type`, unlike `readForm`. | `text/plain` or missing-media-type JSON can create a registration in the source-only probe and weakens the cross-origin media boundary. | Require `application/json` (normal parameters/charset accepted) before the existing bounded parse, using RFC 7591 registration semantics and the OAuth serializer; do not accept arbitrary content types as fallback. |
| GC-019 | P2 | open | G18-5 | Global nonstandard-method guard: `start.ts`/`method-guard.ts` intercepts TRACE/CONNECT before explicit route handlers; wire body is empty and `Allow` is broad. | Clients receive `application/problem+json` with no body and an inaccurate method list, breaking 405 handling and diagnostics. | Make the installed TanStack/Vite adapter route-aware or let explicit handlers run; ensure RFC 9110 `Allow` is resource-specific and align body/media type with the deliberate TRACE policy, then probe TRACE/HEAD. |
| GC-020 | P2 | open | G19-1 | Encoded dot-segment API paths bypass `api.$.ts` and reach the HTML renderer. | API clients receive SPA HTML 404 instead of the canonical Problem Details API 404, with wrong media type/cache semantics. | Reject or normalize encoded dot segments at the earliest URL/router boundary and return existing `problem({status:404, kind:'NOT_FOUND', code:'api_not_found'})`; never send `/api` misses to HTML. |
| GC-021 | P2 | open | G20-5 | Customer Request compare/confirm fetches in `AeCustomerRequestWorkspace.tsx` parse JSON before checking `response.ok/status`. | RFC 9457 errors or non-JSON failures can be treated as success-union data or collapse to a generic catch state. | Gate on native `Response.ok/status` first, then use the existing RFC 9457/problem parser and preserve `WorkspaceState`; do not turn arbitrary problem JSON into a success union. |
| GC-022 | P2 | open | G20-13 | Public non-API route families (`$slug.tools.*`, `$slug.ucp`, `SKILL.md`, `.well-known/ucp`, `llms.txt`, `robots.txt`) export only their allowed method. | Wrong-method clients depend on framework fallbacks and may not receive explicit 405/`Allow`/content contracts. | Add standard wrong-method handlers using the existing `methodNotAllowed` helper, preserving each route's single allowed method and content representation. |
| GC-023 | P2 | open | G19-3 | Funnel route parses `recordFunnelEventSchema` inside a broad source-sync `try`, mapping schema errors to `record_failed`/500. | Valid JSON with missing fields is misclassified as an internal failure instead of actionable client input error; telemetry remains hard to diagnose. | `safeParse`/parse before source synchronization and return the existing 400 `INVALID_ARGUMENT` problem; retain source/transport failures as their separate 500/unavailable mapping. |
| GC-024 | P2 | open | G19-4 | Answer thread collection/detail routing: malformed blank/NUL/dot/double-slash detail paths select `api.answer.threads.ts` collection handler and mint a session. | A malformed resource address returns 200 collection shape and can create state instead of 404 `thread_not_found`; no cross-owner leak was proven. | Enforce strict raw-path matching/normalization before TanStack route selection; reserve collection output for exact collection path and use existing detail `thread_not_found`/Problem Details without cookie minting. |
| GC-025 | P2/P3 | open | G02-3, G02-5 | Capability result presentation: `AeGenerativeAnswer`/`ProseBody` render provider URL as text and collapse internal operation/source evidence to generic `Reading the details`/empty providers. | Buyers are told to click a URL that is not an anchor and cannot see which admitted operation produced a successful value or a safe source reference. | Extend the existing typed `AnswerArtifact`/`AnswerWorkStep` projection with an allowlisted public `sourceRef` and safe external `<a>` (or change copy to “copy URL”); never parse arbitrary prose or expose transport credentials. |
| GC-026 | P2 | open | G04-5 | Mobile chat shell `AeChat.tsx` fixed footer/`h-dvh overflow-hidden` covers composer/timing hit targets at 430×900. | Visible Ask/date controls are untouchable by pointer until scrolling, while keyboard activation works; users can mistake covered controls for broken/disabled UI. | Use native scrolling/focus plus existing responsive shell; reserve safe-area/footer space and keep composer/timing region inside the hit-test viewport before exposing actions. |
| GC-027 | P2 | open | G08-1 | Shared `bg-primary text-primary-foreground` semantic pair in `globals.css` measures 4.15:1 on normal-size text. | Primary actions fail the normal-text contrast threshold on catalog fallback, agents, and Terms surfaces. | Adjust the shared shadcn semantic token pair or choose an existing higher-contrast token; remeasure normal/hover/focus states across all `bg-primary` uses, with no page-specific colors. |
| GC-028 | P2/P3 | open | G08-2, G08-3 | Chat initial shell has no heading; Terms renders H1→H3 through the Radix Accordion heading wrapper. | Screen-reader users lack a chat page landmark and legal-document hierarchy is misleading. | Add a visually unchanged chat `h1`/answer heading and a meaningful Terms H2 (or explicit accordion heading level) using native HTML/Radix semantics; keep the existing log/status structure. |
| GC-029 | P2 | open | G07-2 | New-thread route handoff (`t.new.tsx`/`AeChat`) leaves `document.activeElement` on BODY. | Keyboard/screen-reader users do not get a predictable reading point after SPA navigation and must rediscover the answer shell manually. | Focus existing `#main-content` or thread heading with `tabIndex=-1` after route/answer handoff unless the user is actively using a control; reuse the native skip-link target. |
| GC-030 | P2 | open | G16-1 | CLI env parity: `doctor.ts` merges Vite `loadEnv`, while feeds/manifest/run and `convex-source.ts` read bare `process.env`. | Readiness says `VITE_CONVEX_URL` is configured while commands fail as `missing_convex_url`; transiently loaded env then hides a separate connection failure. | Load Vite dotenv once at CLI bootstrap and merge process env for command execution; retain `readRequiredConvexUrl` and `sourceErrorToCliFailure` so unreachable sources stay typed rather than generic. |
| GC-031 | P2 | open | G16-2 | Human action command `actions.ts` prints `Running ...`/authority preamble to stdout before `action.run`; `cli.ts` prints failure to stderr. | Failed pipelines receive optimistic pre-run output on stdout even though exit is 1; JSON mode is already clean. | Buffer the preamble until success or send progress to stderr; preserve typed `printJson`, redaction, and machine-readable stdout. |
| GC-032 | P2 | open | G15-1 | CLI invalid `--mode`: route detail is only `Invalid search mode.` and `output.ts` prefixes an implementation URL. | Novices cannot see accepted values or a corrected retry command and must rediscover global help. | Keep RFC 9457/`requireOk`/Node `parseArgs`; make the existing detail name `near_me`/`whole_catalogue` or add a narrow `CliFailure` projection with a retry shape, without a second error framework. |
| GC-043 | P2 | open | G14-5 | `/for-agents` setup copy buttons: `CodeBlock` applies `content-visibility:auto`/intrinsic sizing that can cover visible button centers until scroll. | A visible “Copy Claude/Codex command” control appears dead to pointer users until manually scrolled, despite correct accessible names and keyboard surface. | Constrain/remove `content-visibility:auto` around interactive headers or guarantee the header hit target; reuse existing `CodeBlockCopyButton` and status notice, and verify first-viewport pointer/keyboard activation. |
| GC-044 | P2 | open | G14-6 | Customer Request public auth projection across UCP, schema, llms, SKILL, protected-resource metadata, and challenges uses `ae_api_key`, `clerk_api_key`, and bearer-scope prose without mapping. | Cold API clients cannot determine one canonical token type, issuer/issuance path, or scope transport for the same endpoint. | Reuse existing `CUSTOMER_REQUEST_AGENT_ENTRYPOINT`, bearer challenge/protected-resource metadata, and RFC 6749 vocabulary; publish one scheme or explicit `scheme`/`tokenType`/scope mapping without exposing keys. |
| GC-033 | P3 | open | G17-4 | MCP `tools/list` forwards `outputSchema` only when `action.outputSchema instanceof ZodObject`, dropping six existing union/action schemas. | Clients cannot validate structured detail/operation/quote outcomes against the same contracts available to AE actions. | Pass the action schema through the installed SDK `AnySchema`/Zod compatibility path (or the existing JSON-schema projection); do not hand-maintain six schemas. |
| GC-034 | P2 | open | G19-2 | Agent options 405 route constructs `problem()` directly and omits `Allow`, unlike its `methodNotAllowed(['POST'])` siblings. | A client cannot discover the supported method from a direct 405 response and the route drifts from every other method contract. | Use `methodNotAllowed(['POST'], detail)` or preserve custom code while passing `Allow: POST` through the canonical helper. |
| GC-035 | P3 | open | G05-5 | User-authored Arabic/RTL/bidi text is rendered in forced-LTR containers without `dir` metadata; formatting controls remain visible. | Mixed-direction titles/labels can be hard to read or visually reorder surrounding context even though no script/private value was exposed. | Use native `dir="auto"` and Unicode bidi isolation on user text; neutralize formatting controls in titles/labels while retaining safe stored query text. |
| GC-036 | P3 | open | G08-4 | Desktop compact disclosure, tabs, and secondary links are 24–36px high while the existing shell uses `min-h-11` elsewhere. | Low-vision/older-pointer users get materially smaller comfort targets on desktop even though mobile controls are generally larger. | Reuse existing `min-h-11`/44px CSS where standalone; increase line box/padding around compact tabs/disclosures and retain intentional inline-link exceptions. |
| GC-037 | P2 | open | G20-4 | Guest-session HMAC/session logic is duplicated in `browser-guest-assertion.ts` and `customer-request-browser-api.ts`; cookie names/paths legitimately differ. | Future changes to signed bytes, expiry, UUID validation, or principal derivation can drift between anonymous flows. | Reuse `browser-guest-assertion.ts` for crypto/lifetime/principal and retain Customer Request cookie transport adapters; preserve signed bytes, scope, expiry/skew, and principal identity. |
| GC-038 | P2 | open | G20-7 | `AeCustomerRequestWorkspace.tsx` owns seven state hooks, resume persistence, submit/revision/idempotency, compare/confirm/run/cancel, and all rendering. | The Customer Request state machine is difficult to review safely; changes can accidentally alter status/error mapping, revisions, idempotency, or resume behavior. | Introduce a narrow controller/reducer over existing `WorkspaceState`, `browser-submit-recovery`, command-key, request API, and panel seams; do not add a generic state library. |
| GC-039 | P3 | open | G20-10 | Import search finds no runtime/barrel consumers for `AeInlineAnswerTurn.tsx`, `chain-of-thought.tsx`, or `reasoning.tsx`. | Dead UI source obscures the real component surface and increases maintenance/dependency uncertainty. | Verify public/dynamic/codegen entry-point policy, then delete only these proven-dead files (or add the one real entry point); audit the Radix dependency separately. |
| GC-040 | P3 | open | G20-12 | `convex/answerThreads.ts` combines reservation/finalization authority, projections, admin rehydration, share/revoke, and deletion in 1,461 lines. | A maintainer changing one authority/read surface must navigate unrelated persistence and projection concerns, increasing regression risk. | Extract only pure row/projection/filter/share/delete support into existing module seams; preserve generated APIs, Convex validators, transactions, indexes, owner checks, and host authority. |
| GC-041 | P3 | open | G20-16 | Byte-identical currency-label wrappers in `modules/customer-request/format-currency-amount.ts` and `lib/ui/format-money.ts`; `money/public.ts` already owns exact formatting. | Currency prefix/fallback changes can diverge between domain and UI outputs. | Promote one UI-agnostic currency-label formatter beside `formatExactAmount` in `modules/money/public.ts`, update both callers, and delete both wrappers; do not add a formatting library. |

### Existing-ledger duplicates and folded evidence — not new work

| ID | Goblin evidence IDs | Existing ledger/root disposition |
|---|---|---|
| DUP-001 | G02-2 | Wikipedia/reference falling into business search is already PAPERCUTS #68/#71 and the existing reference-boundary family; no second Wikipedia task. |
| DUP-002 | G02-4 | Data/capability answers pivoting to Perth business follow-up is PAPERCUTS #70/#73 and is currently addressed in source; re-probe only on a settled runtime. |
| DUP-003 | G02-6, G05-2 | Unhandled route-abort/transition exceptions are the existing PAPERCUTS #6 family; one investigation only, with no global suppression. |
| DUP-004 | G03-3, G05-3, G07-3 | Silent query truncation/limit drift is PAPERCUTS #4; one canonical `QUERY_MAX_LENGTH`/native validation fix, not persona-specific fixes. |
| DUP-005 | G03-5, G05-4 | Timing controls leaking into empty/refusal states are PAPERCUTS #5/#73; fold into the terminal layout/profile work, not a duplicate composer task. |
| DUP-006 | G07-4 | Nested chat log/status live regions reproduce PAPERCUTS #8; one live-region ownership fix. |
| DUP-007 | G09-1 | Unsupported paid-intent follow-up chrome reproduces PAPERCUTS #70/#73; preserve the honest refusal and fold layout suppression into that existing item. |
| DUP-008 | G14-3 | Services/catalog generic 500 is the existing source outage family (PAPERCUTS #43/#45/#48 and G09-2/G10-1); no per-route catalog implementation task. |
| DUP-009 | G14-4 | Dental quote 500 is the exact G09-3 quote/source member; restore one source path and re-drive both advertised examples. |
| DUP-010 | G20-11 | `as never` service-auth casts are already PAPERCUTS #4 / Services mirror verification transport-cast work; no second cast cleanup item. |
| DUP-011 | G20-15 | `stableUnique` versus declared `es-toolkit/array` is already in the donor-hunt backlog; it remains a reuse candidate, not a new papercut. |

### Environment and proof blockers

| ID | Goblin evidence IDs | Boundary and required proof |
|---|---|---|
| ENV-001 | G01-3, G09-2, G09-3, G10-1, G11-1, G11-3, G14-3, G14-4, G16-1 backend portion, G17 positive-result limitation | Current Convex/registry source is missing or unreachable (`HTTPError`/`missing_convex_url`), so catalog, supplier, quote, request, confirmation, and positive MCP result claims cannot be classified as production defects or success from fixtures. Restore one configured, healthy source and re-drive the exact route matrix; map genuine outage through typed RFC 9457/unavailable projections. |
| ENV-002 | G06-1, G06-2 | Missing sequence/history rows occurred during concurrent local in-memory reset/interleaving and were contiguous in a settled retest. Require a single-owner persistent backend before opening a lifecycle regression; do not promote stale local rows or consumed sequence observations to durable production proof. |
| ENV-003 | G12-2, G13-1 | Local E2E Clerk/operator bypass supplied synthetic owner/admin principals. Signed-out owner exposure and non-admin denial are not production authorization evidence. Re-run with bypass disabled, real signed-out identity, and real non-admin identity; keep production guards fail-closed. |
| ENV-004 | G18-1 | Stateful OAuth on the named runtime lacks usable Convex source and Clerk middleware. The secondary process/in-memory store separated source behavior but did not prove live persistence or token lifecycle. Restore source/auth, then run invalid and positive registration→device/approval/token probes. |

Other proof boundaries remain explicit: G03's late shared-session degradation and G04's late process reset were not promoted; G01's retained browser profile was not treated as cross-user leakage; G09 demo/sandbox quotes prove no payment or fulfilment; G14 fake-key readback proves only the keyed answer seam; G16 transient `loadEnv` diagnostics prove only the env-parity cause; G17 fake MCP calls prove adapter behavior, not a healthy registry; G18 source-only media/scope probes are not persistent live writes; and G20 source/React Doctor diagnostics are not runtime failures.

### Rejected or overstated claims

| ID | Goblin evidence IDs | Why the original claim is not accepted | Narrow disposition |
|---|---|---|---|
| REJ-001 | G02-5 | The current projection already exposes the published operation name and `Ran/Tried` work verb; “selected operation/source entirely hidden” overstates the defect. | A safe public source URL/link omission remains the narrower GC-025 scope; no raw transport metadata. |
| REJ-002 | G18-3 | RFC 8628 marks `scope` optional, but RFC 6749 §3.3 permits an authorization server to reject omission with `invalid_scope` when policy/defaults are documented. | No protocol bug or runtime change required; document the required scope or add a least-privilege registered default only if product policy changes. |
| REJ-003 | G20-2 | TanStack property order is a static React Doctor/inference warning; no generated type failure or runtime consequence was exercised. | Do not claim a runtime defect; a mechanical reorder is conditional on generated-type proof. |
| REJ-004 | G20-3 | Mixed route/component exports include test-consumed helpers and intentional framework server-function seams; React Doctor's generic HMR heuristic does not prove harmful behavior. | No blanket extraction; move only a helper when an observed HMR/state-loss case justifies it. |
| REJ-005 | G20-6 | `AeChat` is concentrated and maintainability-heavy, but the report's broken-behavior implication and hook-count claim were overstated. | No urgent behavior fix; any future bounded controller extraction must preserve existing stores/turn identity. |
| REJ-006 | G20-8 | PromptInput's object URLs are revoked on remove/clear/unmount; the React Doctor warning is false positive. | No URL cleanup fix; retain the existing native URL lifecycle and public API unless a separate size/maintenance change is funded. |
| REJ-007 | G20-9 | Index fallback keys are a latent maintainability hazard, but same-kind entries are unique within one render and no reorder/state misassociation was reproduced. | No confirmed P2 bug; do not add sortable-list machinery or alter server identity without reproduction. |
| REJ-008 | G20-14 | Owner/editor Zod, catalog normalization, and host-owned Convex validators intentionally differ in requiredness and boundary rules; safe collapse was not proven. | Keep host validators; add only a parity gate or shared compatible value/parser seam when drift is demonstrated. |
| REJ-009 | G16-1 | The transient `INTERNAL/unexpected_error` observation is stale/overstated; current source maps missing/unreachable source to typed `UNAVAILABLE` errors. | GC-030 tracks the confirmed doctor-versus-command Vite `loadEnv` parity defect; no separate generic-error item. |

### Green observations

- **G01–G04:** Home navigation, skip-link/menu doors, category/example links, durable answer/thread readback, multi-turn reload/history, and mobile `Stop`/`Ask another` behavior were reachable in the healthy portions; no contact, payment, booking, or fabricated provider was credited.
- **G02:** CoinGecko, Frankfurter, cat, and typed Ethereum keyless operations returned terminal provider data and durable turns; weather preserved the real HTTP 400 rather than inventing conditions; data answers used zero catalog/listing counts.
- **G05:** Prompt-injection input did not disclose system text or secrets; HTML/SVG was escaped; unsafe input produced no harmful instructions or contact; blank submission created no answer turn.
- **G06–G08:** Settled sequence retest was contiguous; Stop/share/revoke/read-only-share semantics held; public menu/radio/skip-link keyboard behavior worked; responsive layouts had no horizontal overflow; reduced-motion collapsed infinite animation; contrast passed outside the shared primary pair.
- **G09–G11:** Demo quote fields were exact, time-bounded, and explicitly no-charge; sandbox routes exposed bearer/maximum-cost/no-fulfilment boundaries; owner/import flows were review-first and non-destructive; invalid/missing catalog slugs and public inquiry slugs failed honestly where their route boundary was reachable.
- **G12–G14:** Owner/admin denial surfaces withheld private rows where source/auth branches were reachable; local-preview copy stated its auth limits; public docs/UCP/discovery artifacts were explicit about non-authority; keyed answer SSE converged durably; no credentials were exposed.
- **G15–G16:** CLI help/unknown-command/missing-argument recovery, JSON envelopes, names-only doctor, action write gate, malformed-input redaction, and pipe-safe machine output were sound; direct Bitcoin ask returned a grounded keyless result.
- **G17–G19:** MCP SDK 1.30.0 initialized, listed eight read-only tools, negotiated supported versions, rejected malformed/content-type/unknown-method cases without side effects, and handled batches; ordinary API errors used RFC 9457 with `Allow` and no-store; body limits and protected sandbox auth failed closed.
- **G20:** Existing seams are deliberate: `es-toolkit` and `@apidevtools/json-schema-ref-parser` are declared, canonical digest/stable serialization and RFC 9457 models are not needless handrolls, Convex host validators remain authoritative, and React Doctor's dynamic-import/object-URL warnings were correctly rejected where source/bundle evidence proved the boundary intentional.

### Disposition counts

Counts are for deduped disposition rows in this appended section (raw Goblin evidence IDs are intentionally many-to-one): **open: 44 GC rows; duplicate: 11 groups; environment: 4 groups; rejected/overstated: 9 groups.** All `G01`–`G20` personas and every listed subfinding ID appear in the coverage table above.

86. openai-codex/gpt-5.6-sol: Convex accepted v.record(v.string(), v.any()) for a query result, but runtime serialization rejected JSON Schema keys such as ; descriptor readers need JSON-string wire fields and the validator/type layer did not catch this.

87. openai-codex/gpt-5.6-sol: Correction to prior entry: Convex accepted v.record(v.string(), v.any()) for a query result, but runtime serialization rejected JSON Schema keys such as $schema; descriptor readers need JSON-string wire fields and the validator/type layer did not catch this.

88. openai-codex/gpt-5.6-sol: npm run dev:local requires Node 22, but the workstation default node is v25.2.1; the command fails before starting and requires a manual PATH/nvm switch.

89. openai-codex/gpt-5.6-sol: A stale local Convex discoveryManifests row blocks npm run dev:local at schema validation after a source-schema change; the local stack offers no documented non-destructive reset or migration path.

90. openai-codex/gpt-5.6-sol: Vitest accepts only one --testNamePattern per invocation, so two focused tests in different files cannot each receive their own pattern in one command.

91. openai-codex/gpt-5.6-sol: Canonical provider-connection authority cutover left capability publication/registration integration fixtures without actual connection records; failures surface only as binding_connection_not_found across 21 focused cases instead of pointing to the shared fixture seam.

92. openai-codex/gpt-5.6-sol: AGENTS.md mandates yarn papercut, but the repo packageManager field is malformed as yarn@npm@11.5.1 and global Yarn 1 refuses to run it; npm run papercut is the only working path.

93. openai-codex/gpt-5.6-sol: The documented test:all gate invokes Convex codegen under the workstation's Node 25, but Convex supports only Node 18/20/22/24; the gate fails until rerun through a temporary supported Node 24 PATH.

94. openai-codex/gpt-5.6-sol: Repository-wide gates in the shared dirty worktree repeatedly observed files mid-edit from concurrent streams, producing transient parse/type failures after earlier green runs; focused reruns passed once files stabilized, but validation has no snapshot isolation.

95. openai-codex/gpt-5.6-sol: The full integration gate passes but floods output with TimeoutOverflowWarning because mocked far-future timestamps are fed to real setTimeout scheduling, obscuring real failures.

96. openai-codex/gpt-5.6-sol: Production build succeeds but unwasm cannot resolve Shiki's env import for onig.wasm and silently falls back to module mode, adding noisy uncertainty to an otherwise green build.
