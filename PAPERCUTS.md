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

### Resolved repair ledger — source-verified 2026-08-09

> **Historical closeout (2026-08-09):** The 44 GC rows below were accepted and then source-fixed in that campaign's dirty working tree. This does not close later SG/WGA campaigns, environment blockers, or any runtime/hosted proof requirement.

| ID | Severity | Status | Goblin evidence IDs | Exact surface / root | User impact | Minimal existing-library/native/protocol-grounded fix |
|---|---|---|---|---|---|---|
| GC-001 | P1 | resolved | G01-1, G04-2 | Answer candidate exposure/execution: `keyless-data-ask.ts` + `turns/agent.ts`; final domain eligibility is not authoritative after ranking/model choice. | A plumbing request can visibly and durably run `thecatapi-image-search`, undermining trust even when no contact occurs. | Reuse the typed ranked candidate set and `rankOperationSearchText` as a final deterministic domain-overlap gate immediately before exposure/execution; fail closed to clarification/capability-unavailable and keep the executor fail-closed. |
| GC-002 | P1 | resolved | G01-2, G03-1, G04-1 | Local location provenance: `answer-response-planner.ts`, `provider-location-filter.ts`, `location-intent.ts`; explicit place text can lose to configured Perth context. | Buyers are told their request is “near Perth” despite naming no location or naming Parramatta, and search/contact scope is silently wrong. | Tighten the existing location parser at service/constraint delimiters; require an explicit location or a visibly labelled, confirmed context default before search, geocoding, URLs, or contact scope. |
| GC-003 | P1 | resolved | G02-1, G03-1 | Selected Open-Meteo forecast/geocoding input construction; generic coordinate contracts have no deterministic city→coordinates composition in the selected-operation path. | Melbourne/Parramatta requests can produce HTTP 400 or contract-invalid results and then ask for information already supplied. | Inspect exact operation input/response, compose city through the existing geocoding/forecast contracts, and preserve strict `operation-execute` validation and the real provider error; do not rewrite the canonical schema blindly. |
| GC-004 | P1 | resolved | G05-1, G05-4 | Safety and refusal boundary in `turn-orchestrator.ts` precedes business discovery only weakly; refusal/no-match layout still exposes local controls. | Harmful requests appear to be ordinary searches and expose timing/browse/contact affordances, even though no harmful instruction or effect was produced. | Put typed safety classification/refusal before registry retrieval; project a refusal/capability-unavailable `AnswerLayoutProfile` that suppresses business timing, matching, browsing, and contact, retaining only safe retry/new-ask actions. |
| GC-005 | P1/P2 | resolved | G03-2, G03-4, G04-3, G04-4 | Same-thread recovery: empty frozen-provider branch in `turn-orchestrator.ts`, whole-prose recovery in `snapshot-artifacts.ts`, and unconditional selected-business copy in `turn-context.ts`/follow-up prose. | Corrective constraints do not restart search; rationale asks become generic empty cards; “nearby” links corrupt the query; no-match answers claim a selected business. | Use the existing structured search context and durable work/evidence projection for a recovery state machine: rerun validated search when new constraints arrive, add a deterministic rationale branch, build prompts from normalized fields, and gate selected-business language on validated provider identity/contact route. |
| GC-006 | P1 | resolved | G12-1 | Fake/invalid OAuth authorization read: `oauth.authorize.ts` + `_operator/agent-access.authorize.tsx`; failed source response does not converge the consent UI. | An invalid assistant authorization can remain on “Loading access request” with no retry or return path, while the server exposes an unhandled 500. | Map invalid/unavailable grants through the existing `problem()`/OAuth error seam and make every non-OK/abort read reach the existing `Access request unavailable` state with safe retry/return; keep approval/deny unreachable before consent details. |
| GC-007 | P1 | resolved | G14-1 | Public no-key answer examples: `agent-entry.ts`, `agent-skill.ts`, `api.answer.turn.ts`; generated curl omits required `X-AE-Turn-Key`. | A cold API consumer follows the published command and receives 400 instead of the promised SSE; adding an undocumented header is the only demonstrated first success. | Generate/send an opaque idempotency/correlation header in SKILL, llms, `/for-agents`, UCP/entry metadata, and examples, explicitly saying it is not a credential; retain the durable reservation safety gate and retest SSE→readback. |
| GC-008 | P1 | resolved | G14-2 | `/SKILL.md` content negotiation: route handler exists, but `agent-content-negotiation`/adapter sends ordinary non-HTML GETs to `Cannot GET`. | curl/fetch clients following the advertised instruction URL receive HTML 404 while browser navigation succeeds. | Make the existing markdown handler authoritative for default, JSON, text, and markdown `Accept` values; preserve `discoveryResponse` markdown/CORS/cache/nosniff headers and add running-adapter probes. |
| GC-009 | P1 | resolved | G18-2 | OAuth error projection: `oauthError` currently returns generic RFC 9457 `problem()` without an OAuth `error` member. | OAuth/device clients cannot distinguish `authorization_pending`, `slow_down`, `access_denied`, `invalid_grant`, and invalid request without AE-specific parsing. | Add an OAuth-specific serializer carrying RFC 6749/8628 `error` and safe `error_description`/headers while retaining the internal Problem Details model for non-OAuth routes; bind redirect `state` only after validated client/redirect. |
| GC-010 | P1 | resolved | G20-1 | PR workflow `.github/workflows/kernel-release-gate.yml`: `pull_request` job injects `CONVEX_DEPLOY_KEY` before running checkout-controlled codegen. | A PR-modifiable checkout can read a deployment credential, creating a release/security boundary exposure. | Determine whether codegen actually needs deployment configuration, then remove the secret from the PR job or move credentialed proof behind protected branch/environment controls; masking output is insufficient. |
| GC-011 | P1/P2 | resolved | G07-1, G07-5 | Controlled Radix Dialog/Sheet wrappers and `AeChat` mobile sidebar: closed content remains mounted, focus does not return, and `aria-modal` is absent. | Escape can leave a full-screen closed dialog tabbable and pointer-intercepting; screen readers may miss explicit modal semantics. | Keep the installed Radix/shadcn seam; use opener ref + `onCloseAutoFocus`, unmount or apply `aria-hidden`, `inert`, and `pointer-events:none` to closed content, and add `aria-modal="true"` only if the installed primitive does not emit it. |
| GC-012 | P2 | resolved | G10-2, G10-3 | Owner/public catalog projection: `owner-claim.functions.ts`/`claim.success.tsx` read fixture/local status while `$slug.tsx` and `$slug.inquiry.tsx` independently read unavailable public source; outage states fall through route metadata. | Owners can be told a page is live while its public listing/inquiry fails; 500s are titled “Page not found” or show the wrong inquiry shell. | Reuse typed `PublicBusinessPageRouteReadback`, `UnavailableInquiry`, and RFC 9457/source-unavailable unions; gate “live/discoverable” on the same public readiness, and keep not-found, unavailable, title, status, and body distinct. |
| GC-013 | P2 | resolved | G10-4 | Public error/recovery IA: `AeNotFound`/listing fallback link “Browse businesses”/“Back to services” to Ask-only `/`; no browse route exists. | Catalog shoppers land on a composer with no listing, search, or pagination after being promised a catalog. | Point to the existing canonical browse route if one exists; otherwise rename the links to “Start a new question”/“Ask a question” rather than inventing a second catalog page. |
| GC-014 | P2 | resolved | G11-2 | Supplier origin handoff: `AeFindMyBusiness` hard-codes `/claim/form`, while `claim.tsx` and `claim.success.tsx` preserve `source=supply`. | A supplier who is not found loses the supply journey and its post-claim “List an API service” handoff. | Thread the existing typed optional route search through `AeFindMyBusiness` and preserve `source=supply` through form and success; no analytics/session mechanism is needed. |
| GC-042 | P2 | resolved | G12-3 | Operator unmatched descendant `/agent-access/unknown`: `_operator.tsx` composes the public route-missing shell underneath the operator shell. | Users get duplicate H1/main/nav/skip-link landmarks and no direct assistant-access recovery link. | Reuse the operator route error-state seam to render one owner-aware 404 with one landmark set and `Back to assistant access`; do not mount the public not-found shell twice. |
| GC-015 | P2 | resolved | G17-1 | MCP action projection: `mcp-api.ts` catches every `action.run` exception and emits only `isError: true` / `Action failed.`. | MCP clients cannot distinguish not-found/no-data from source outage or internal failure, even though action unions define those states. | Reuse `src/lib/errors.ts`, action output/error contracts, and MCP's execution-error envelope: preserve typed successes/no-data, emit a redacted stable code/retryability signal with `isError: true`, and never expose raw exceptions. |
| GC-016 | P2 | resolved | G17-2 | MCP bounded body adapter: `readBoundedRequestText` returns `payload_too_large`, but `boundedMcpRequest` replaces it with an empty body. | A body over 64 KiB is reported as malformed JSON `-32700`, hiding the actual size boundary and recovery. | Preserve the existing discriminant and project canonical `PAYLOAD_TOO_LARGE`/413 (or the SDK's safe equivalent); never parse an over-limit body as empty JSON. |
| GC-017 | P2 | resolved | G17-3 | MCP top-level request validation through installed SDK: unclassified Zod errors become JSON-RPC `-32603` with raw multiline text, unlike nested tool validation. | Machine clients see Internal Error and Zod dumps instead of `-32602 Invalid params`, making recovery and telemetry unreliable. | Use the pinned MCP SDK's `McpError(ErrorCode.InvalidParams)` path or a version-current SDK classification seam; return concise redacted messages and do not regex-rewrite or hand-roll JSON-RPC parsing. |
| GC-018 | P2 | resolved | G18-4 | OAuth dynamic registration `readJson` parses without checking `Content-Type`, unlike `readForm`. | `text/plain` or missing-media-type JSON can create a registration in the source-only probe and weakens the cross-origin media boundary. | Require `application/json` (normal parameters/charset accepted) before the existing bounded parse, using RFC 7591 registration semantics and the OAuth serializer; do not accept arbitrary content types as fallback. |
| GC-019 | P2 | resolved | G18-5 | Global nonstandard-method guard: `start.ts`/`method-guard.ts` intercepts TRACE/CONNECT before explicit route handlers; wire body is empty and `Allow` is broad. | Clients receive `application/problem+json` with no body and an inaccurate method list, breaking 405 handling and diagnostics. | Make the installed TanStack/Vite adapter route-aware or let explicit handlers run; ensure RFC 9110 `Allow` is resource-specific and align body/media type with the deliberate TRACE policy, then probe TRACE/HEAD. |
| GC-020 | P2 | resolved | G19-1 | Encoded dot-segment API paths bypass `api.$.ts` and reach the HTML renderer. | API clients receive SPA HTML 404 instead of the canonical Problem Details API 404, with wrong media type/cache semantics. | Reject or normalize encoded dot segments at the earliest URL/router boundary and return existing `problem({status:404, kind:'NOT_FOUND', code:'api_not_found'})`; never send `/api` misses to HTML. |
| GC-021 | P2 | resolved | G20-5 | Customer Request compare/confirm fetches in `AeCustomerRequestWorkspace.tsx` parse JSON before checking `response.ok/status`. | RFC 9457 errors or non-JSON failures can be treated as success-union data or collapse to a generic catch state. | Gate on native `Response.ok/status` first, then use the existing RFC 9457/problem parser and preserve `WorkspaceState`; do not turn arbitrary problem JSON into a success union. |
| GC-022 | P2 | resolved | G20-13 | Public non-API route families (`$slug.tools.*`, `$slug.ucp`, `SKILL.md`, `.well-known/ucp`, `llms.txt`, `robots.txt`) export only their allowed method. | Wrong-method clients depend on framework fallbacks and may not receive explicit 405/`Allow`/content contracts. | Add standard wrong-method handlers using the existing `methodNotAllowed` helper, preserving each route's single allowed method and content representation. |
| GC-023 | P2 | resolved | G19-3 | Funnel route parses `recordFunnelEventSchema` inside a broad source-sync `try`, mapping schema errors to `record_failed`/500. | Valid JSON with missing fields is misclassified as an internal failure instead of actionable client input error; telemetry remains hard to diagnose. | `safeParse`/parse before source synchronization and return the existing 400 `INVALID_ARGUMENT` problem; retain source/transport failures as their separate 500/unavailable mapping. |
| GC-024 | P2 | resolved | G19-4 | Answer thread collection/detail routing: malformed blank/NUL/dot/double-slash detail paths select `api.answer.threads.ts` collection handler and mint a session. | A malformed resource address returns 200 collection shape and can create state instead of 404 `thread_not_found`; no cross-owner leak was proven. | Enforce strict raw-path matching/normalization before TanStack route selection; reserve collection output for exact collection path and use existing detail `thread_not_found`/Problem Details without cookie minting. |
| GC-025 | P2/P3 | resolved | G02-3, G02-5 | Capability result presentation: `AeGenerativeAnswer`/`ProseBody` render provider URL as text and collapse internal operation/source evidence to generic `Reading the details`/empty providers. | Buyers are told to click a URL that is not an anchor and cannot see which admitted operation produced a successful value or a safe source reference. | Extend the existing typed `AnswerArtifact`/`AnswerWorkStep` projection with an allowlisted public `sourceRef` and safe external `<a>` (or change copy to “copy URL”); never parse arbitrary prose or expose transport credentials. |
| GC-026 | P2 | resolved | G04-5 | Mobile chat shell `AeChat.tsx` fixed footer/`h-dvh overflow-hidden` covers composer/timing hit targets at 430×900. | Visible Ask/date controls are untouchable by pointer until scrolling, while keyboard activation works; users can mistake covered controls for broken/disabled UI. | Use native scrolling/focus plus existing responsive shell; reserve safe-area/footer space and keep composer/timing region inside the hit-test viewport before exposing actions. |
| GC-027 | P2 | resolved | G08-1 | Shared `bg-primary text-primary-foreground` semantic pair in `globals.css` measures 4.15:1 on normal-size text. | Primary actions fail the normal-text contrast threshold on catalog fallback, agents, and Terms surfaces. | Adjust the shared shadcn semantic token pair or choose an existing higher-contrast token; remeasure normal/hover/focus states across all `bg-primary` uses, with no page-specific colors. |
| GC-028 | P2/P3 | resolved | G08-2, G08-3 | Chat initial shell has no heading; Terms renders H1→H3 through the Radix Accordion heading wrapper. | Screen-reader users lack a chat page landmark and legal-document hierarchy is misleading. | Add a visually unchanged chat `h1`/answer heading and a meaningful Terms H2 (or explicit accordion heading level) using native HTML/Radix semantics; keep the existing log/status structure. |
| GC-029 | P2 | resolved | G07-2 | New-thread route handoff (`t.new.tsx`/`AeChat`) leaves `document.activeElement` on BODY. | Keyboard/screen-reader users do not get a predictable reading point after SPA navigation and must rediscover the answer shell manually. | Focus existing `#main-content` or thread heading with `tabIndex=-1` after route/answer handoff unless the user is actively using a control; reuse the native skip-link target. |
| GC-030 | P2 | resolved | G16-1 | CLI env parity: `doctor.ts` merges Vite `loadEnv`, while feeds/manifest/run and `convex-source.ts` read bare `process.env`. | Readiness says `VITE_CONVEX_URL` is configured while commands fail as `missing_convex_url`; transiently loaded env then hides a separate connection failure. | Load Vite dotenv once at CLI bootstrap and merge process env for command execution; retain `readRequiredConvexUrl` and `sourceErrorToCliFailure` so unreachable sources stay typed rather than generic. |
| GC-031 | P2 | resolved | G16-2 | Human action command `actions.ts` prints `Running ...`/authority preamble to stdout before `action.run`; `cli.ts` prints failure to stderr. | Failed pipelines receive optimistic pre-run output on stdout even though exit is 1; JSON mode is already clean. | Buffer the preamble until success or send progress to stderr; preserve typed `printJson`, redaction, and machine-readable stdout. |
| GC-032 | P2 | resolved | G15-1 | CLI invalid `--mode`: route detail is only `Invalid search mode.` and `output.ts` prefixes an implementation URL. | Novices cannot see accepted values or a corrected retry command and must rediscover global help. | Keep RFC 9457/`requireOk`/Node `parseArgs`; make the existing detail name `near_me`/`whole_catalogue` or add a narrow `CliFailure` projection with a retry shape, without a second error framework. |
| GC-043 | P2 | resolved | G14-5 | `/for-agents` setup copy buttons: `CodeBlock` applies `content-visibility:auto`/intrinsic sizing that can cover visible button centers until scroll. | A visible “Copy Claude/Codex command” control appears dead to pointer users until manually scrolled, despite correct accessible names and keyboard surface. | Constrain/remove `content-visibility:auto` around interactive headers or guarantee the header hit target; reuse existing `CodeBlockCopyButton` and status notice, and verify first-viewport pointer/keyboard activation. |
| GC-044 | P2 | resolved | G14-6 | Customer Request public auth projection across UCP, schema, llms, SKILL, protected-resource metadata, and challenges uses `ae_api_key`, `clerk_api_key`, and bearer-scope prose without mapping. | Cold API clients cannot determine one canonical token type, issuer/issuance path, or scope transport for the same endpoint. | Reuse existing `CUSTOMER_REQUEST_AGENT_ENTRYPOINT`, bearer challenge/protected-resource metadata, and RFC 6749 vocabulary; publish one scheme or explicit `scheme`/`tokenType`/scope mapping without exposing keys. |
| GC-033 | P3 | resolved | G17-4 | MCP `tools/list` forwards `outputSchema` only when `action.outputSchema instanceof ZodObject`, dropping six existing union/action schemas. | Clients cannot validate structured detail/operation/quote outcomes against the same contracts available to AE actions. | Pass the action schema through the installed SDK `AnySchema`/Zod compatibility path (or the existing JSON-schema projection); do not hand-maintain six schemas. |
| GC-034 | P2 | resolved | G19-2 | Agent options 405 route constructs `problem()` directly and omits `Allow`, unlike its `methodNotAllowed(['POST'])` siblings. | A client cannot discover the supported method from a direct 405 response and the route drifts from every other method contract. | Use `methodNotAllowed(['POST'], detail)` or preserve custom code while passing `Allow: POST` through the canonical helper. |
| GC-035 | P3 | resolved | G05-5 | User-authored Arabic/RTL/bidi text is rendered in forced-LTR containers without `dir` metadata; formatting controls remain visible. | Mixed-direction titles/labels can be hard to read or visually reorder surrounding context even though no script/private value was exposed. | Use native `dir="auto"` and Unicode bidi isolation on user text; neutralize formatting controls in titles/labels while retaining safe stored query text. |
| GC-036 | P3 | resolved | G08-4 | Desktop compact disclosure, tabs, and secondary links are 24–36px high while the existing shell uses `min-h-11` elsewhere. | Low-vision/older-pointer users get materially smaller comfort targets on desktop even though mobile controls are generally larger. | Reuse existing `min-h-11`/44px CSS where standalone; increase line box/padding around compact tabs/disclosures and retain intentional inline-link exceptions. |
| GC-037 | P2 | resolved | G20-4 | Guest-session HMAC/session logic is duplicated in `browser-guest-assertion.ts` and `customer-request-browser-api.ts`; cookie names/paths legitimately differ. | Future changes to signed bytes, expiry, UUID validation, or principal derivation can drift between anonymous flows. | Reuse `browser-guest-assertion.ts` for crypto/lifetime/principal and retain Customer Request cookie transport adapters; preserve signed bytes, scope, expiry/skew, and principal identity. |
| GC-038 | P2 | resolved | G20-7 | `AeCustomerRequestWorkspace.tsx` owns seven state hooks, resume persistence, submit/revision/idempotency, compare/confirm/run/cancel, and all rendering. | The Customer Request state machine is difficult to review safely; changes can accidentally alter status/error mapping, revisions, idempotency, or resume behavior. | Introduce a narrow controller/reducer over existing `WorkspaceState`, `browser-submit-recovery`, command-key, request API, and panel seams; do not add a generic state library. |
| GC-039 | P3 | resolved | G20-10 | Import search finds no runtime/barrel consumers for `AeInlineAnswerTurn.tsx`, `chain-of-thought.tsx`, or `reasoning.tsx`. | Dead UI source obscures the real component surface and increases maintenance/dependency uncertainty. | Verify public/dynamic/codegen entry-point policy, then delete only these proven-dead files (or add the one real entry point); audit the Radix dependency separately. |
| GC-040 | P3 | resolved | G20-12 | `convex/answerThreads.ts` combines reservation/finalization authority, projections, admin rehydration, share/revoke, and deletion in 1,461 lines. | A maintainer changing one authority/read surface must navigate unrelated persistence and projection concerns, increasing regression risk. | Extract only pure row/projection/filter/share/delete support into existing module seams; preserve generated APIs, Convex validators, transactions, indexes, owner checks, and host authority. |
| GC-041 | P3 | resolved | G20-16 | Byte-identical currency-label wrappers in `modules/customer-request/format-currency-amount.ts` and `lib/ui/format-money.ts`; `money/public.ts` already owns exact formatting. | Currency prefix/fallback changes can diverge between domain and UI outputs. | Promote one UI-agnostic currency-label formatter beside `formatExactAmount` in `modules/money/public.ts`, update both callers, and delete both wrappers; do not add a formatting library. |

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

Counts are for deduped dispositions in the original 20-goblin intake: **accepted GC rows: 44; duplicate: 11 groups; environment: 4 groups; rejected/overstated: 9 groups.** The resolved ledger above records the later source-fix disposition of those 44 GC rows; it does not upgrade them to runtime or hosted proof. All `G01`–`G20` personas and every listed subfinding ID appear in the coverage table above.

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

## Supply-side goblin campaign — 2026-08-09

### Campaign scope and evidence boundary

Nine supply personas were exercised: API seller, local-business owner, returning owner, validation-failure provider, endpoint operator, keyboard/screen-reader supplier, copy chief, no-endpoint developer, and international software provider. Their ephemeral agent/transcript records were investigation aids only. Clone-durable evidence and every accepted disposition are embedded in the source/evidence matrix below; no current status depends on an `agent://` or `history://` URL.

Real public surfaces exercised were `/`, `/for-providers`, `/claim?source=supply`, `/claim`, `/claim/form`, `/owner/supply`, `/owner/offerings`, `/owner/offerings/new`, `/owner/status`, `/sign-in`, and `/sign-up` on `http://127.0.0.1:3000`. Owner routes honestly stopped at the signed-out Clerk boundary (`/sign-in?redirect=...`); no account, OAuth, payment, or external provider call was fabricated. The deeper form was exercised only through the sanctioned fixture `http://127.0.0.1:4570/?state=empty` and `?state=filled`, which renders the real `AeSupplyEndpointConfigStep` and invokes a local callback. Its raw JSON is proof that the component accepted values, not proof of production validation, readiness, persistence, publication, or a successful endpoint call.

The business, capability, endpoint, and reference maps were grounding inputs only. The clone-durable source anchors and browser observations they supported are embedded below. The verified external reference surfaces were `https://agentic.market/`, `https://agentic.market/validate`, `https://agentic.market/validate/setup/endpoint`, `https://agentic.market/validate/setup/deploy`, `https://agentic.market/validate/setup/launch`, `https://agentic.market/llms.txt`, and `https://api.agentic.market/v1/services?limit=1&offset=0`; the stale `https://agentic.market/services` collection route returned 404. None is AE acceptance authority. The reference demonstrates endpoint-first metadata and staged validation, not AE's admission or payment policy.

### Source/evidence matrix

The matrix is intentionally many-to-one: repeated persona symptoms are merged into one root-cause row below. `[BROWSER]` means the named route or sanctioned component was directly exercised. `[SOURCE-INFERRED]` means the behavior follows from current source but was not promoted to a browser reproduction because the real owner flow was auth-gated or the fixture had no backend. Fixture observations never become production success claims.

| Evidence bundle | Personas / reports | Mode and exact evidence anchors | Merged ledger row |
|---|---|---|---|
| S-01 | API seller, local owner, screen reader, copy chief, no-endpoint, international | `[BROWSER]` `GET http://127.0.0.1:3000/for-providers` showed `Something went wrong!`, `Hide Error`, `fetch failed` on fresh/reload states; `[SOURCE]` `src/routes/for-providers.tsx:7-8`, `src/modules/capability-supply/supply-funnel.functions.ts:31-49`. | SG-001 |
| S-02 | API seller, copy chief, no-endpoint, international | `[BROWSER]` `/for-providers` → `/claim?source=supply`; `/claim` says `trade`, `suburb`, `phone`, `jobs`, and `quoted`; placeholder `Joondalup Emergency Plumbing`; `[SOURCE]` `src/routes/claim.tsx:240-263`, `src/components/ae/claim/ClaimFormSections.tsx:21-124`, `src/modules/catalog/owner-claim.functions.ts:43-63,193-224`. | SG-002 |
| S-03 | API seller, local owner, returning owner, validation failure, endpoint operator, screen reader, copy chief, no-endpoint, international | `[BROWSER]` `/owner/supply`, `/owner/offerings`, and `/owner/offerings/new` redirect to `/sign-in?redirect=...`; `/claim/form` and `/sign-up` say `After you sign in, you’ll continue straight to your listing`; `[SOURCE]` `src/lib/server/require-operator-session.ts:19-27`, `src/lib/operator/navigation.ts:55-72`, `src/routes/sign-in.$.tsx:31-58`, `src/routes/_operator/owner.status.tsx:80-107`. | SG-003 |
| S-04 | API seller, returning owner, endpoint operator, copy chief, no-endpoint, international | `[BROWSER/SOURCE]` the journey alternates `business`, `service`, `listing`, `Offering`, `Market Operation`, `endpoint`, `connection`, `contact route`, `Go live`, and `Published`; `[SOURCE]` `src/components/ae/supply/AeSupplyLanding.tsx:23-52`, `src/routes/_operator/owner.supply.tsx:8-26`, `src/routes/_operator/owner.offerings.new.tsx:14-32`, `src/components/ae/supply/AeSupplyFunnel.tsx:17-25,99-123`. | SG-004 |
| S-05 | Local owner, copy chief | `[BROWSER]` blank `/claim` has disabled `Find my business` and `Start with my website` with no required-input explanation; no-match path says `We couldn't find that name...`. | SG-005 |
| S-06 | Validation failure, screen reader, copy chief, no-endpoint, international | `[BROWSER]` at `http://127.0.0.1:4570/?state=empty|filled`, blank and malformed descriptor/query JSON, `not-a-url`, non-HTTPS URL, and out-of-range/empty timeout were echoed by the local callback despite native validity cues; `[SOURCE]` `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:50-57,90-99,117-124,141-144`, `src/modules/capability-supply/owner-supply-validators.ts:23-34`. | SG-006 |
| S-07 | Validation failure, endpoint operator, copy chief, no-endpoint, international | `[BROWSER]` fixture hides URL, selector, descriptor, method, and timeout under `Advanced connection details`; MCP and Agent Plugin MCP add protocol/tool fields while HTTP fields remain; `[SOURCE]` `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:63-135`. | SG-007 |
| S-08 | Validation failure, screen reader, copy chief, no-endpoint, international | `[BROWSER]` fixture retained MCP `protocolVersion`/`toolName` after switching back to OpenAPI and returned them in the callback; `[SOURCE]` `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:46-48,75,125-135` merges patches without clearing incompatible fields. | SG-008 |
| S-09 | Validation failure, screen reader, copy chief, no-endpoint, international | `[BROWSER]` fixture submissions left only raw `<pre>` JSON: no alert/status, `aria-invalid`, `aria-describedby`, focused field, Retry, Back, or Edit; `[SOURCE]` `AeSupplyEndpointConfigStep.tsx:50-57,141-144` delegates to `onSubmit` without an outcome projection. | SG-009 |
| S-10 | Validation failure; capability and endpoint maps | `[SOURCE-INFERRED]` UI endpoint value has source kind, descriptor, selector, URL, method, mapping, protocol/tool, and timeout but no authority; `src/routes/_operator/owner.supply.$offeringRef.tsx:55-58` sends it as `{endpoint: endpointValue}`, while `src/modules/capability-supply/owner-supply-validators.ts:23-34` requires authority and `convex/capabilitySupplyOwnerSupply.ts:57-66,74-82` validates before the handler. | SG-010 |
| S-11 | API seller, validation failure, no-endpoint, international; capability and endpoint maps | `[SOURCE-INFERRED]` form advertises OpenAPI HTTP, MCP, and Agent Plugin MCP, while `src/components/ae/supply/AeSupplyFunnel.tsx:118-123` says advanced integrations are curated; `convex/capabilitySupplyOwnerFunnel.ts:263-344` hard-codes `ae-demo-services.quote`, a fixed HTTP JSON POST binding, and fixed quote contract; `convex/capabilitySupplyOwnerSupply.ts:81-123` HEADs the URL and then POSTs a fixed home-office quote. No fixture publish was credited. | SG-011 |
| S-12 | Validation failure, endpoint operator; endpoint map | `[SOURCE-INFERRED]` endpoint/pricing React state is not in the durable draft serialization: `src/components/ae/supply/AeSupplyFunnel.tsx:54-90`, `src/components/ae/supply/AeSupplyFunnel.exports.ts:4-36`; `src/components/ae/supply/AeSupplyPublisherHome.tsx:53-87` resumes by setup state/readback without those payloads. | SG-012 |
| S-13 | Returning owner, validation failure, endpoint operator; capability and endpoint maps | `[SOURCE-INFERRED]` copy says `Publish this service as a standard AE listing so assistants can find it` and `Publish one to make it available`, but admission, publication lifecycle, readiness evidence, and active routeability are separate in `convex/capabilitySupplyOwnerFunnel.ts:263-344`, `convex/capabilitySupplyOwnerSupply.ts:45-143`, and `src/modules/registry/internal/service-projection.ts:1-126`. | SG-013 |
| S-14 | Validation failure, endpoint operator; endpoint map | `[SOURCE-INFERRED]` public refusal map `src/components/ae/supply/AeSupplyFunnel.tsx:224-330` and `src/modules/capability-supply/supply-funnel.functions.ts:54-115,151-220` do not cover all Convex result codes (`unknown`, `business_not_registered`, `contract_invalid`, `contract_too_large`, `contract_integrity_failure`, `offering_invalid`, `binding_invalid`, `binding_identity_conflict`) from `convex/capabilitySupplyOwnerFunnel.ts:95-115,260-285`; some copy refers to controls/payment modes absent from the form. | SG-014 |

| S-15 | API seller, international; business and capability maps | `[SOURCE-INFERRED]` owner editor says `Published in Australian dollars` and offers `Job`, `Hour`, `Visit`, `Item`, `Day`, `Week`, `Month`, and `Quoted on request`; `src/components/ae/offerings/AeOwnerOfferings.tsx:337-380,697-754`. | SG-015 |
| S-16 | Returning owner, endpoint operator; capability and endpoint maps | `[SOURCE-INFERRED]` `/owner/offerings` cards expose only `Preview`/`Edit`; owner supply readback has endpoint URL, publication ref, source hash, readiness outcome/expiry, but `src/components/ae/supply/AeSupplyPublisherHome.tsx:55-87` shows only offering summary and `Continue setup`; `src/lib/operator/navigation.ts:55-73` has no endpoint/readiness destination. | SG-016 |
| S-17 | Endpoint operator; endpoint map | `[SOURCE-INFERRED]` no suspend/disable action exists in `src/components/ae/supply/AeSupplyFunnel.tsx:17-25,70-113`; `Try publishing again` is optional in `src/components/ae/offerings/AeOwnerOfferings.tsx:118-129` but `/owner/offerings` passes no callback (`src/routes/_operator/owner.offerings.tsx:35-46`); `Reopen go live` mutates local draft only. | SG-017 |
| S-18 | Screen reader | `[BROWSER]` successful `/for-providers` accessibility traversal repeated `Technical details`, `Technical connection details`, `Business details`, and `Published service details`; `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:94-113,157-165` uses identical summaries/links without row-labelled accessible names. | SG-018 |
| S-19 | Screen reader | `[BROWSER]` expanding the first technical disclosure spoke the same description, `POST`, and public URL twice; `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:157-161` renders endpoint rows without stable URL/method deduplication. The payload-duplication explanation remains `[INFERENCE]`, not a production data claim. | SG-019 |
| S-20 | Screen reader | `[BROWSER]` after Enter, `Show 7 more published services` remained the accessible name while the seven rows were visible; `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:45-53,76-84` uses static `<summary>` text. | SG-020 |
| S-21 | Screen reader, copy chief | `[BROWSER]` auth pages exposed two h1s (`Almost there` plus `Sign in to Agentic Economy` or `Create your account`) and provider buttons named `Sign in with GitHub GitHub` / `Sign in with Google Google`; `[SOURCE]` `src/routes/sign-in.$.tsx:51-57` wraps Clerk beneath a local context heading. | SG-021 |
| S-22 | Screen reader, local owner | `[BROWSER]` empty and malformed sign-in submissions returned focus to `#identifier-field` with `aria-invalid="false"`, no `aria-describedby`, and empty live regions; `[SOURCE]` `src/routes/sign-in.$.tsx:57` delegates to Clerk without a local error projection. | SG-022 |
| S-23 | Screen reader, copy chief, API seller, international | `[BROWSER/SOURCE]` public proof exposed `agent-native Service`, `ae.offerings[]`, `not_found`, `http-json:v1`, revision refs, overlap notes, and raw public URLs; `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:99-110,151-165`, seeded copy in `src/modules/capability-supply/curated-cluster-c-publications.tsx:553-618`. | SG-023 |
| S-24 | API seller, copy chief, international | `[BROWSER/SOURCE]` provider landing says `YOUR PATH TO PAID WORK WHEN ENABLED`, `payment support is enabled`, and `Setup and test calls do not create AE-settled earnings or payouts`; `[SOURCE]` `src/components/ae/supply/AeSupplyLanding.tsx:39-52`. | SG-024 |
| S-25 | International, no-endpoint | `[BROWSER]` sanctioned `http://127.0.0.1:4570/?state=filled` prefilled OpenAPI `selector: quote`, `https://example.test/quote`, `POST`, and a local callback; this is fixture teaching evidence only, not production publication proof. | SG-025 |

### Canonical supply vocabulary contract

The following distinctions are the contract for future copy, DTOs, and repair work. They are not interchangeable labels:

- **Provider / business identity:** `Provider` is the supplier-facing term for the organization publishing supply. `Business` is AE's owner-controlled organization/profile record. `Owner` is the authenticated person authorized to manage that business. A claim takes ownership of an existing business profile; `start fresh` creates one. Neither is an API operation.
- **Service / offering:** `Service` is the customer-facing name for one thing a business provides. `Offering` is the internal catalog record/revision for that service. If `Offering` appears in owner UI, teach it once as a service entry; do not alternate it with business, listing, or endpoint.
- **Capability / operation:** A capability contract defines the admitted input/output/effect semantics. A capability offering is the admitted registration of that contract for a business/offering origin. An `Operation` or `Market Operation` is the public executable identity (`operationRef`) derived only after the contract, origin, binding, publication, eligibility, conformance, and readiness gates pass. A service is not automatically an operation.
- **Endpoint / connection:** An endpoint is the technical URL, method, and protocol exposed by an external provider. A connection/transport binding associates that endpoint with an admitted operation and its authority/adapter. A customer-facing contact path (phone, website, message) is not an API endpoint.
- **Admission / publication:** Admission validates and normalizes a contract, origin, authority, and transport binding into AE's admitted supply. Publication makes the admitted source current/discoverable through a lifecycle record. The current owner funnel's generic form is not proof of arbitrary self-service OpenAPI/MCP/x402 admission; curated/admin admission remains a separate boundary unless wired through the existing seams.
- **Readiness / live availability:** A readiness check records evidence that the configured endpoint responded and when that evidence expires. It does not prove customer fulfilment, revenue, a Qualified Use, or a payout. Live availability means the operation is currently published, routeable, bound to the intended contract, and satisfies the active readiness/conformance gates. `Go live`, `Published`, `Ready`, and `Available to assistants` must not be used as synonyms.
- **Customer-facing versus technical language:** Public supplier copy should prefer `business profile`, `service`, `price`, `contact path`, `listing`, and `AI assistant` (with one explanation if `agent` is unavoidable). Technical/internal surfaces may use `Offering`, `Capability Contract`, `Capability Offering`, `Operation`, `Endpoint`, `Transport Binding`, `Admission`, `Publication`, `Readiness`, and `routeable`; each must name its current state and consequence.

### Supply-side ledger rows

All rows below are **open**. Browser-reproduced fixture behavior is not upgraded to production success or a backend defect; source-inferred rows are marked explicitly. Duplicate symptoms from multiple personas are represented once through S-01–S-25.

| ID | Severity | Status | Personas / evidence | Exact reproduction or source evidence | Impact and root cause | Durable destination |
|---|---|---|---|---|---|---|
| SG-001 | P1 | open | API seller, local owner, screen reader, copy chief, no-endpoint, international; S-01 | `[BROWSER]` Fresh/reloaded `http://127.0.0.1:3000/for-providers` displayed only `Something went wrong!`, `Hide Error`, and `fetch failed`; screen-reader tree had no supplier landmark/CTA. `[SOURCE]` route loader at `src/routes/for-providers.tsx:7-8` directly calls `loadSupplyLandingReadbackServer()` from `src/modules/capability-supply/supply-funnel.functions.ts:31-49`. | A first-time supplier is blocked before the promise, route, or sign-in path. The loader exception falls into a generic error boundary instead of a supplier-safe state. | `src/routes/for-providers.tsx` loader/error boundary: preserve the shell and supplier CTA, project a route-specific unavailable state, and provide a keyboard-reachable Retry without exposing raw `fetch failed`. |
| SG-002 | P1 | open | API seller, copy chief, no-endpoint, international; S-02 | `[BROWSER]` `Start publishing your service` routes to `/claim?source=supply`; `/claim` asks for `trade`, `suburb`, `phone`, `jobs`, hours, and customer contact routes, with `Joondalup Emergency Plumbing` placeholder. `[SOURCE]` `src/routes/claim.tsx:240-263`, `src/components/ae/claim/ClaimFormSections.tsx:21-124`; `source=supply` is accepted but `src/modules/catalog/owner-claim.functions.ts:43-63,193-224` still claims a business and publishes a local service catalog input. | An API or international software provider is forced into an Australian local-trade identity and manual quote model, with no natural place for provider, operation, schema, or endpoint. | Supplier entrypoint and claim seam: split local business-page claim from API/MCP/x402 supplier intake; use neutral organization/region/URL fields and only connect to admission after a provider/capability is defined. |
| SG-003 | P1 | open | API seller, local owner, returning owner, validation failure, endpoint operator, screen reader, copy chief, no-endpoint, international; S-03 | `[BROWSER]` `/owner/supply`, `/owner/offerings`, `/owner/offerings/new`, and `/owner/status` redirect to `/sign-in?redirect=...`; `/claim/form` says `Almost there` / `After you sign in, you’ll continue straight to your listing`; public recovery offers `List your business` or `Start fresh`, not manage existing supply. `[SOURCE]` `src/lib/server/require-operator-session.ts:19-27`, `src/lib/operator/navigation.ts:55-72`, `src/routes/sign-in.$.tsx:31-58`, `src/routes/_operator/owner.status.tsx:80-107`. | Auth gating itself is not a security defect and correctly preserves the destination. The papercut is discoverability/recovery: returning owners and technical suppliers receive generic first-time listing/claim copy and no public/manage route for a second capability or endpoint. | Public supplier/auth handoff: keep the auth guard, add `Already have a listing? Manage services`, route-specific sign-in context, and a stable signed-in Offerings/Endpoint destination; never make re-claim/start-fresh the only recovery. |
| SG-004 | P2 | open | API seller, returning owner, endpoint operator, copy chief, no-endpoint, international; S-04 | `[BROWSER/SOURCE]` One journey says `business`, `service`, `listing`, `Offering`, `Market Operation`, `endpoint`, `connection`, `contact route`, `Go live`, and `Published`. Anchors: `src/components/ae/supply/AeSupplyLanding.tsx:23-52`, `src/routes/_operator/owner.supply.tsx:8-26`, `src/routes/_operator/owner.offerings.new.tsx:14-32`, `src/components/ae/supply/AeSupplyFunnel.tsx:17-25,99-123`. | Suppliers cannot predict whether they are creating a business profile, customer service, catalog offering, admitted capability, or callable operation. The product has real domain distinctions but no taught hierarchy. | Apply the canonical vocabulary contract above across public CTA, owner nav, breadcrumbs, statuses, and recovery; use `Service` for customer-facing work and reserve technical nouns for admitted operation/endpoint state. |
| SG-005 | P2 | open | Local owner, copy chief; S-05 | `[BROWSER]` Blank `/claim` leaves `Find my business` and `Start with my website` disabled with no `name or website is required` guidance; the placeholder is local-business-specific. | Dead-looking controls make a first-time owner infer requirements and availability. The form communicates disabled state but not the next action or why it is disabled. | `src/components/ae/claim/AeFindMyBusiness.tsx` form state: add explicit required-input help or a submit-time validation message, keep the no-match/start-fresh distinction, and provide a clear path back from sign-in. |
| SG-006 | P1 | open | Validation failure, screen reader, copy chief, no-endpoint, international; S-06 | `[BROWSER — sanctioned fixture only]` At `http://127.0.0.1:4570/?state=empty|filled`, blank descriptor/selector/URL/mapping and malformed JSON (`{bad`, `[bad`) or URL (`not-a-url`, `http://...`) were sent to the local callback; native URL/timeout validity cues did not stop `Check and continue`. `[SOURCE]` `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:50-57,90-99,117-124,141-144`; backend checks are separate in `src/modules/capability-supply/owner-supply-validators.ts:23-34`. | The endpoint form appears to check a service while accepting data that cannot identify or call one. The callback fixture proves fail-open component behavior only, not production admission or a successful request. | `AeSupplyEndpointConfigStep` and its owner adapter: use form/typed validation before `onSubmit`, require source-kind-appropriate fields, parse JSON, require a full HTTPS URL, enforce timeout bounds, and preserve values while focusing the first invalid field. |
| SG-007 | P2 | open | Validation failure, endpoint operator, copy chief, no-endpoint, international; S-07 | `[BROWSER — sanctioned fixture]` URL, descriptor, selector, method, timeout, and mapping were hidden under `Advanced connection details`; selecting MCP or Agent Plugin MCP added `Protocol version` and `Tool name` but left HTTP fields visible without a type-specific checklist. `[SOURCE]` `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:63-135`. | Required technical work is presented as optional, and a provider cannot tell which artifact/field applies to OpenAPI, MCP, or Agent Plugin MCP. | Endpoint form: show the minimum URL/selector/description requirements before the disclosure, label the disclosure as technical editing, and render a per-source-kind required-field checklist with irrelevant controls hidden. |
| SG-008 | P2 | open | Validation failure, screen reader, copy chief, no-endpoint, international; S-08 | `[BROWSER — sanctioned fixture]` Entered MCP `protocolVersion`/`toolName`, switched to OpenAPI, and the hidden values remained in the callback payload. `[SOURCE]` `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:46-48,75,125-135` merges patches and does not clear source-kind-specific values. | Hidden stale configuration can be submitted or later interpreted as active. A source-kind switch changes the visible schema without changing the underlying object. | Endpoint state reducer/adapter: reset or omit incompatible fields on source-kind change, or show a review summary that names inactive values and prevents them reaching the selected transport contract. |
| SG-009 | P2 | open | Validation failure, screen reader, copy chief, no-endpoint, international; S-09 | `[BROWSER — sanctioned fixture]` After blank/malformed submissions, the only new content was raw JSON; no `role=alert`/status, `aria-invalid`, `aria-describedby`, focused field, Retry, Back, or Edit control appeared and the button remained `Check and continue`. `[SOURCE]` `AeSupplyEndpointConfigStep.tsx:50-57,141-144` has no local outcome presentation. | A provider cannot distinguish saved, checked, refused, pending, or local echo. The component delegates the callback but does not project a durable result or accessible repair state. | Owner endpoint result boundary: model `checking`, `needs_attention`, `checked`, and `saved` states with human consequence, a named live region, first-error focus, and explicit Fix/Retry/Continue actions; keep raw JSON behind a technical details disclosure. |
| SG-010 | P1 | open | Validation failure; S-10 | `[SOURCE-INFERRED — not browser-reproduced]` UI value from `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:10-21,32-42` omits `authority` and `x402` source kind; `src/routes/_operator/owner.supply.$offeringRef.tsx:55-58` sends `{endpoint: endpointValue}`, while `src/modules/capability-supply/owner-supply-validators.ts:23-34` requires authority and `convex/capabilitySupplyOwnerSupply.ts:57-66,74-82` validates before custom handling. | The UI/backend endpoint contracts disagree. An authenticated run may fail at argument validation before the user receives field-level transport/schema/payment guidance; that outcome is not claimed as reproduced. | Existing owner-supply validator/adapter seam: align the UI DTO with the authoritative endpoint value (server-owned authority or an explicit supported choice), then project validator failures into the SG-009 result state. |
| SG-011 | P1 | open | API seller, validation failure, no-endpoint, international; S-11 | `[SOURCE-INFERRED — not browser-reproduced]` The form offers OpenAPI HTTP, MCP, and Agent Plugin MCP, but `src/components/ae/supply/AeSupplyFunnel.tsx:118-123` says advanced integrations are added through the curated catalog. `convex/capabilitySupplyOwnerFunnel.ts:263-344` hard-codes `ae-demo-services.quote`, `http-json:v1`, and a fixed quote contract; readiness/test in `convex/capabilitySupplyOwnerSupply.ts:81-123` use HEAD plus fixed home-office POST, ignoring most submitted descriptor/source-kind/selector/method/mapping/timeout. | Generic technical fields imply self-service admission while the owner publish/test path is a demo contract. A provider could submit one endpoint and be checked against another. The fixture had no publish backend, so no production mismatch was browser-credited. | Owner admission seam: either make this explicitly a demo quote setup and remove generic fields, or thread the submitted descriptor through existing normalize/validate/admit/bind/readiness primitives. Do not present ignored fields as configuration. |
| SG-012 | P1 | open | Validation failure, endpoint operator; S-12 | `[SOURCE-INFERRED — not browser-reproduced]` `src/components/ae/supply/AeSupplyFunnel.tsx:54-90` keeps endpoint/pricing in local React state; `src/components/ae/supply/AeSupplyFunnel.exports.ts:4-36` serializes bounded draft progress but not those payloads; `src/components/ae/supply/AeSupplyPublisherHome.tsx:53-87` resumes from setup/readback without restoring them. | A draft can resume at readiness, test, or publish while endpoint/pricing are empty or defaulted. The source evidence predicts unsafe/confusing resume, but no authenticated reload was available to reproduce it. | Existing owner draft/readback seam: persist endpoint and pricing through the owner-scoped draft, hydrate them on revisit, and mark downstream steps stale/Needs attention when required payloads are absent. |
| SG-013 | P1 | open | Returning owner, validation failure, endpoint operator; S-13 | `[SOURCE-INFERRED — not browser-reproduced]` Copy says `Publish this service as a standard AE listing so assistants can find it` and `Publish one to make it available`; source separates admission/publication/readiness/routeability in `convex/capabilitySupplyOwnerFunnel.ts:263-344`, `convex/capabilitySupplyOwnerSupply.ts:45-143`, and `src/modules/registry/internal/service-projection.ts:1-126`. | `Publish`, `Go live`, `Ready`, and `Available to assistants` can be read as one successful transition even when publication is pending/inactive or only a readiness probe has passed. | Supply lifecycle projection: show separate admitted, published, readiness, and live-availability states with existing evidence/expiry; say that publication becomes callable only after the relevant gates pass. |
| SG-014 | P2 | open | Validation failure, endpoint operator; S-14 | `[SOURCE-INFERRED — not browser-reproduced]` Public refusal types/map in `src/components/ae/supply/AeSupplyFunnel.tsx:224-330` and `src/modules/capability-supply/supply-funnel.functions.ts:54-115,151-220` omit actual Convex codes from `convex/capabilitySupplyOwnerFunnel.ts:95-115,260-285` such as `unknown`, `business_not_registered`, `contract_invalid`, `contract_too_large`, `contract_integrity_failure`, `offering_invalid`, `binding_invalid`, and `binding_identity_conflict`; some displayed copy mentions schema/payment controls absent from the form. | A real refusal can fall through to no useful message or tell the provider to change a control they cannot see. This remains source-inferred because the backend route was not reachable. | `supply-funnel.functions.ts` boundary: project the complete authoritative refusal union into stable public codes/copy, include a safe unknown-step state, and name the exact field/phase/action without leaking Convex internals. |
| SG-015 | P2 | open | API seller, international; S-15 | `[SOURCE-INFERRED — not browser-reproduced]` `src/components/ae/offerings/AeOwnerOfferings.tsx:337-380,697-754` says `Published in Australian dollars` and offers `Job`, `Hour`, `Visit`, `Item`, `Day`, `Week`, `Month`, and `Quoted on request`; deeper editor was auth-gated. | Remote/API providers price per call, request, token, record, seat, or usage tier in multiple currencies. AUD/local-job assumptions signal that digital or international supply is unsupported. | Existing pricing editor/domain: use ISO-4217 currency with no silent AU default and units that include call/request/token/record/result/seat/custom plus free/fixed/usage/range/quote-required terms. |
| SG-016 | P1 | open | Returning owner, endpoint operator; S-16 | `[SOURCE-INFERRED — not browser-reproduced]` `/owner/offerings` cards expose only `Preview` and `Edit`; readback contains `endpointUrl`, `documentationUrl`, `publicationRef`, `sourceHash`, readiness outcome/expiry, but `src/components/ae/supply/AeSupplyPublisherHome.tsx:55-87` shows only service summary/`Continue setup`; `src/lib/operator/navigation.ts:55-73` has no endpoint/readiness destination. | An operator cannot see which endpoint is live, whether its binding/publication is current, or whether readiness is healthy/expired from the listing they maintain. | Owner listing projection: add per-service endpoint, publication, readiness, last-check/expiry, and direct Manage endpoint/Recheck actions, reusing authoritative readback rather than a second registry. |
| SG-017 | P2 | open | Endpoint operator; S-17 | `[SOURCE-INFERRED — not browser-reproduced]` No suspend/disable action exists in `src/components/ae/supply/AeSupplyFunnel.tsx:17-25,70-113`; `Try publishing again` is optional in `src/components/ae/offerings/AeOwnerOfferings.tsx:118-129` but `/owner/offerings` passes no callback (`src/routes/_operator/owner.offerings.tsx:35-46`); `Reopen go live` changes local draft only. | A live endpoint cannot be clearly stopped, a promised projection retry is not actionable, and `Reopen go live` can be mistaken for suspend/unpublish although it only changes local state. | Existing publication/owner control seam: add an explicit confirmed Suspend/Resume action, wire or remove projection retry copy, and rename local-only reopen to state what it actually changes. |
| SG-018 | P2 | open | Screen reader; S-18 | `[BROWSER]` On a successful `/for-providers` accessibility traversal, repeated summaries were exactly `Technical details` and `Technical connection details`; links repeated `Business details` and `Published service details`. `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:94-113,157-165` supplies no row-specific accessible names/`aria-labelledby`. | A screen-reader supplier cannot identify which service or action a disclosure/link belongs to and may open the wrong technical record. | Agent-proof presentation: include the service/action name in each accessible name or bind the disclosure/link to its row heading; preserve concise visible copy. |
| SG-019 | P2 | open | Screen reader; S-19 | `[BROWSER]` Expanding the first technical disclosure repeated the same description, `POST`, and public URL twice. `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:157-161` maps endpoint rows without stable URL/method deduplication; the explanation that the payload duplicated the row is `[INFERENCE]`. | Repeated endpoint content sounds like two operations or two calls and makes public technical evidence untrustworthy. | Agent-proof readback/projection: deduplicate identical endpoint identity before rendering, or label intentionally distinct bindings with operation/transport identity; do not hide duplicates with CSS. |
| SG-020 | P2 | open | Screen reader; S-20 | `[BROWSER]` After Enter on `Show 7 more published services`, seven rows appeared but the focused accessible name remained `Show 7 more published services`; the analogous actions disclosure had the same static wording. `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:45-53,76-84`. | The disclosure says it will reveal content that is already visible and gives no clear collapse state. | Existing native `<details>` proof control: make summary text stateful (`Show`/`Hide`) while preserving native expanded semantics and focus. |
| SG-021 | P2 | open | Screen reader, copy chief; S-21 | `[BROWSER]` `/sign-in?redirect=...` exposed h1 `Almost there` plus `Sign in to Agentic Economy`; sign-up exposed `Almost there` plus `Create your account`; provider buttons were announced `Sign in with GitHub GitHub` and `Sign in with Google Google`. `[SOURCE]` `src/routes/sign-in.$.tsx:51-57` renders local context beside Clerk's widget. | Auth is a valid boundary, but duplicate headings/provider labels add noise and make the blocked task hierarchy unclear. | Auth wrapper/Clerk integration: keep one task h1, demote context to a paragraph/section label, and mark decorative provider icon labels hidden so each button has one name. |
| SG-022 | P2 | open | Screen reader, local owner; S-22 | `[BROWSER]` Empty and malformed identifier submits returned focus to `#identifier-field`, but `aria-invalid="false"`, no `aria-describedby`, and empty live regions remained; no reason was announced. `[SOURCE]` `src/routes/sign-in.$.tsx:57` delegates form behavior to Clerk without a local error projection. | A supplier gets focus recovery without knowing whether the field is required, malformed, or unavailable. This is auth recovery/comprehension, not a claim that the auth gate is insecure. | Auth error projection: expose visible field errors, `aria-invalid`, `aria-describedby`, and a live announcement for required/format/network failures while preserving Clerk's authentication authority. |
| SG-023 | P2 | open | Screen reader, copy chief, API seller, international; S-23 | `[BROWSER/SOURCE]` Public `/for-providers` proof exposed `agent-native Service`, `ae.offerings[]`, `not_found`, `http-json:v1`, revision refs, adversarial overlap notes, and raw endpoint URLs. `[SOURCE]` `src/components/ae/supply/AeSupplyAgentProof.tsx:99-110,151-165`, `src/modules/capability-supply/curated-cluster-c-publications.tsx:553-618`. | Supplier marketing reads like an internal QA/debug console and teaches implementation identifiers instead of the public service/operation boundary. | Public proof projection: keep human explanation, endpoint method/URL, and a clear discovery-only boundary; move refs, schema labels, route result names, overlap notes, and internal IDs to developer-only disclosure. |
| SG-024 | P2 | open | API seller, copy chief, international; S-24 | `[BROWSER/SOURCE]` Landing copy says `YOUR PATH TO PAID WORK WHEN ENABLED`, `payment support is enabled`, `Setup and test calls do not create AE-settled earnings or payouts`, and `Choose the price for each call`; `[SOURCE]` `src/components/ae/supply/AeSupplyLanding.tsx:39-52`. | The copy is honest about no payout but does not state in plain language whether a supplier earns today, and `AE-settled`/`payment support` are implementation terms. | Supply landing monetisation copy: state one plain current-lane sentence (`You can set a price and test; setup/test do not earn money here`), then link to the exact payment/admission eligibility rather than a vague future promise. |
| SG-025 | P3 | open | International, no-endpoint; S-25 | `[BROWSER — sanctioned fixture only]` `http://127.0.0.1:4570/?state=filled` prefilled `OpenAPI HTTP`, selector `quote`, `https://example.test/quote`, `POST`, and timeout `10000`; submitting only echoed a local JSON callback. | A cold developer is taught a local quote-shaped example rather than a neutral API operation. This is a fixture/teaching papercut, not production endpoint success or evidence that AE called `example.test`. | Fixture and endpoint-step teaching data: use a neutral operation/HTTPS example, label it as replaceable sample data, and make the callback/result boundary explicit. |

### Campaign disposition and ordered repair sequence

Deduplicated disposition for this appended campaign: **25 unique rows, all open** — **P1: 9**, **P2: 15**, **P3: 1**. No row is marked resolved, duplicate, environment-only, or rejected. The signed-out auth gate remains an intentional boundary; only its recovery/preview/discoverability friction is logged. The `:4570` raw callback remains fixture evidence of component behavior, not production success.

Ordered repair sequence:

1. Stabilize the `/for-providers` loader boundary (SG-001), preserving a supplier shell, retry, and sign-in/entry path when source readback fails.
2. Split the supplier entry from local-business claim and publish the hierarchy/auth recovery (SG-002–SG-005): provider/business identity, service/offering, and API supplier route must be understandable before sign-in; retain the production auth gate.
3. Align the endpoint form with the authoritative endpoint/admission contract and make the form fail closed (SG-006–SG-011): source-kind schemas, authority, JSON/HTTPS/timeout checks, field errors/focus/live regions, and no ignored generic fields.
4. Persist and hydrate endpoint/pricing/readiness state, then expose maintenance controls from the owner listing (SG-012, SG-016, SG-017).
5. Separate admission, publication, readiness, and live availability and project every authoritative refusal (SG-013–SG-014) before polishing copy.
6. Remove Australian-only pricing assumptions and clean public proof/monetisation/accessibility/fixture teaching surfaces (SG-015, SG-018–SG-025) using the existing projections and native disclosure semantics.

97. openai-codex/gpt-5.6-sol: The approved remove-faux-runtime-surfaces plan file still contained 'Discovery in progress' placeholders after approval, forcing execution to rely on the preserved conversation plan.

98. openai-codex/gpt-5.6-sol: The eval read(path) bridge failed on valid local://, memory://, and skill:// URIs with RuntimeError: Missing session/run/name; direct read worked.

99. openai-codex/gpt-5.6-sol: The documented yarn papercut command is unusable here: global Yarn 1 rejects packageManager yarn@npm@11.5.1 before the logger runs; npm run papercut is the working route.

100. openai-codex/gpt-5.6-sol: The curated-provider registry integration was blocked by a half-migrated BusinessContext projection: persisted projection validators, snapshot decoders, search-document validators, and public DTO fixtures did not move together, producing serial validator failures far from the source change.

101. openai-codex/gpt-5.6-sol: The Service merchandising projection referenced an undefined domain variable; the focused runtime test caught the missing derivation before the broader typecheck gate was usable.

102. openai-codex/gpt-5.6-sol: A direct Service projection test can inject catalogPrice 0.007 without proving executable exact-price projection; the curated-provider integration test is the meaningful end-to-end gate because it starts from persisted exact amount units/exponent.

103. openai-codex/gpt-5.6-sol: The faux-runtime architecture guard omitted api.discovery.schema/examples and the createDefaultDiscoverySourceState alias, so production discovery silently selected fixture state while the guard stayed green. Root fix: scan those routes and forbid fixture/default discovery constructors in deployable modules.

104. openai-codex/gpt-5.6-sol: An interrupted parallel owner-route edit left a syntactically incomplete JSX return, causing unrelated focused tests to fail during transform. Root fix: agents should stage syntactically complete edits or restore the last valid construct before yielding on transport failure.

105. openai-codex/gpt-5.6-sol: The discovery fixture cutover migrated route-parity to pure projections but omitted the brandNonEmpty import, so the focused suite failed at runtime despite a syntactically valid edit. Root cause: caller migration was not yielded with its direct test dependencies complete.

106. openai-codex/gpt-5.6-sol: The full convex/workTrees.test.ts suite has an unrelated shared authority drift: the paid-lock forbidden case expects refused/forbidden but current code returns unknown. Focused sandbox-evidence cutover tests pass; broad suite failure obscures scoped verification and needs separate authority reconciliation.

107. openai-codex/gpt-5.6-sol: Starting tools/dev/local-dev.mjs with the exact installed Node 22 binary still spawns npx through PATH under Node 25, so Convex local deploy repeatedly claims no supported Node is installed; the launcher should pin its child PATH/runtime or report the resolved child Node before retrying.

108. openai-codex/gpt-5.6-sol: A supervised local-stack readiness check can remain in 'starting' while Convex dev loops deployment failures and never launches Vite; readiness should fail closed on repeated deploy errors instead of requiring log inspection after a timeout.

109. openai-codex/gpt-5.6-sol: A clean local stack cannot deploy after the canonical BusinessContext cutover because existing local businessContexts rows still store top-level suburb/stateTerritory and Convex only reports schema mismatch in a retry loop; the dev workflow needs an explicit preserve-and-migrate rehearsal path or a fresh isolated local deployment option.

110. openai-codex/gpt-5.6-sol: The focused owner supply UI test passes but Node emits '--localstorage-file was provided without a valid path'; the shared Vitest/jsdom setup should either supply a valid path or stop passing the flag so real browser-storage warnings stay signal.

111. openai-codex/gpt-5.6-sol: The release unit gate reports 75 failures across 25 files after canonical BusinessContext/exact-money/access cutovers, dominated by stale flat-context fixtures, retired local-source assumptions, and outdated scope/inventory expectations; focused feature suites were green, so the broad gate is the first place these cross-cutover consumers surface together.

112. openai-codex/gpt-5.6-sol: The green release unit gate still emits a React missing-key warning from OwnerAccessPathsEditor; list item identity is not stable enough for React to verify reconciliation.

113. openai-codex/gpt-5.6-sol: Operator shell and agent-access authorize unit tests render router consumers outside RouterProvider, so green tests emit useRouter context warnings that can hide new rendering regressions.

114. openai-codex/gpt-5.6-sol: The release integration gate exposed 53 failures in seven files after faux-source removal: retired implicit registry fixture dependencies, stale flat BusinessContext rows, and current generation/payment authority prerequisites were not exercised by the green unit gate.

115. openai-codex/gpt-5.6-sol: The final import gate found capabilitySupplyOwnerFunnel importing exactCurrentCatalogOperationIsRouteable from an internal path even though the symbol was already exported by the canonical public barrel; a one-line public-import cutover fixed the gate.

116. openai-codex/gpt-5.6-sol: Starting convex-local-backend directly without --local-storage silently switched from .convex/local/default/convex_local_storage to a root convex_local_storage directory, leaving persisted module blobs missing and every query at 500.

117. openai-codex/gpt-5.6-sol: After correcting local storage, the persisted backend served stale functions; npx convex dev --once could start it but refused the push because the local deployment could not detect the installed Node 22 runtime for use-node actions, blocking a current-code live HTTP smoke.

118. openai-codex/gpt-5.6-sol: With the correct Node 22 PATH, current Convex functions bundled and reached schema validation, but the persisted local deployment still contains retired flat businessContexts rows. Clean-cut schema deployment therefore fails before live HTTP smoke; proving current code locally now requires an explicit destructive local-data reset rather than a compatibility validator.

119. openai-codex/gpt-5.6-sol: A clean live smoke required a fresh self-hosted Convex backend plus an explicit Node 22 PATH at backend startup; setting PATH only on npx convex deploy was insufficient because Node-action availability is decided by the backend process. With backend PATH fixed, current functions deployed, seeded, and served the sub-cent enriched Services DTO.

## 15-goblin whole-platform hostility audit — 2026-08-11

### Method/evidence boundary

- Authority: `.planning/PROJECT.md`; proof rules: `RULES.MD`.
- This is an append-only audit disposition; no prior `PAPERCUTS.md` content was replaced.
- No source repairs were made.
- Wave 1 used ten hostile personas; Wave 2 used five independent verification lenses.
- Browser evidence came only from the current Vite runtime at `http://127.0.0.1:3001`.
- Port `3000` was stale and excluded from evidence.
- No credentials, payments, provider side effects, or production settlement were exercised.
- No tests, lint, builds, formatters, or release gates were run.
- No successful durable write was treated as proof.
- Source, fixtures, route declarations, and retained artifacts are not live-runtime proof.
- Runtime observations do not certify hosted production behavior.
- Evidence classes are `[RUNTIME]`, `[SOURCE]`, `[DOCS]`, `[ARTIFACT]`, and `[INFERENCE]`.
- Each new WGA row has one primary evidence class for counting; corroborating citations do not double-count it.
- Ephemeral agent reports are not sole evidence; the material facts and exact source locations are copied below.
- The malformed TaskCompletion artifact was excluded.
- Green source boundaries below describe inspected properties, not newly executed proof.

### Persona coverage

- Impatient buyer on a flaky mobile connection.
- RFC 9457, API, MCP, and CLI protocol lawyer.
- Repository archivist.
- Ponytail principal looking for needless machinery.
- Convex recovery undertaker.
- Skeptical product-truth investor.
- Incident and handoff commander.
- Proof prosecutor.
- Privacy and security red-team.
- Domain-language copy chief.
- Runtime and product-truth verifier.
- Protocol and security verifier.
- Durable-recovery verifier.
- Lean and repository-hygiene verifier.
- Proof-class verifier.

### Plain verdict

- Current source contains substantial controlled discovery, invocation, idempotency, continuation, and recovery machinery.
- The audited public runtime could not complete the flagship Bitcoin ask: `/` → `/t/new` → `POST /api/answer/turn` terminated with typed `503 UNAVAILABLE`.
- Retry repeated the outage and produced no thread, result, or recent row.
- Generated agent instructions conflict with canonical access DTOs, registered MCP tool names, OAuth requirements, and public recovery routes.
- Hosted two-operation proof remains uncertified.
- Stripe, payout, and full production value exchange remain refusal-only or explicitly unavailable.
- AE can fail honestly, and the core HTTP/MCP operation-recovery source is comparatively strong.
- AE does **not** yet prove the full market/value-exchange promise end to end.
- Buyer completion, cold-agent integration, provider revocation convergence, operator recovery, and production settlement remain incomplete.

### Accepted new roots

| ID | Severity | Status | Evidence | Root/impact | Lean fix |
|---|---|---|---|---|---|
| WGA-001 | P2 | Accepted — open | [RUNTIME] At `390x844`, submitting `Find an emergency plumber in Perth tonight`, holding and aborting the initial POST retained the query/error only until reload; reloading exact `/t/new` returned a blank composer, `0/200`, and no recent row. `src/components/ae/chat/AeChat.tsx:82-105,304-332,746-770`. | A manually entered failed ask exists only in React `draft/liveTurn`; session storage covers only the initial-turn key. Reload destroys the buyer’s recovery context. | Persist the submitted ask before transport, restore it on `/t/new`, and clear it only after an explicit discard or durable thread handoff. |
| WGA-002 | P1 | Accepted — open | [SOURCE] `src/modules/discovery/internal/agent-skill.ts:53-56,60-110,159-170`; `src/modules/registry/internal/service-projection.ts:22-63`; `src/modules/registry/registry.actions.ts:301-318`; `src/modules/registry/internal/services-api-projection.ts:175-236`. | Generated instructions teach `ae.access:'open'` although canonical registration permits only `external`, expose a supplier URL, and describe `ae.execution:'request_route'` while later requiring an `operationRef` and server-held credentials. A cold agent cannot choose direct supplier invocation versus the AE gateway. | Generate access and execution instructions from the canonical projection schema; state one supported invocation route and its credential owner. |
| WGA-003 | P1 | Accepted — open | [SOURCE] `src/modules/discovery/internal/site-manifest.ts:227-243`; `src/modules/actions/index.ts:128-131`; `src/lib/server/mcp-api.ts:296-300`. | UCP publishes MCP tool `operation.invoke`, but the registered derived tool name is `ae_operation_invoke`; a cold `tools/call` fails as unknown. | Emit the registered name mechanically from the MCP action registry and contract-test the published manifest against registration. |
| WGA-004 | P1 | Accepted — open | [SOURCE] `src/modules/discovery/internal/agent-skill.ts:60-65`; `src/lib/server/agent-access-oauth-api.ts:89-165,315-328`. | The public skill names OAuth endpoints but omits required registration, device, and token request shapes. A cold OAuth client cannot complete access from the advertised document. | Generate minimal request/response examples and required fields directly from the OAuth validators. |
| WGA-005 | P1 | Accepted — open | [SOURCE] `tools/ae/README.md:50-54`; `tools/ae/commands/invoke.ts:62-70,137-164`. | CLI invocation creates the idempotency key immediately before POST but prints it only after success or polling. Connection loss hides replay identity, so rerunning may duplicate a paid or effectful invocation. | Print and optionally persist the key before network I/O; accept an explicit replay key on rerun. |
| WGA-006 | P1 | Accepted — open | [SOURCE] `src/modules/discovery/internal/agent-skill.ts:67-111`; `src/lib/server/operation-invoke-api.ts:450-499`. | Generated curl/skill guidance documents invocation but not the existing REST status, cancel, and reconcile recovery surface; it points recoverers toward MCP/internal names. A cold curl client cannot recover an uncertain invocation. | Generate invoke/status/cancel/reconcile REST examples as one recovery family from the public route contract. |
| WGA-007 | P2 | Accepted — open | [SOURCE] `convex/agentAccessOAuth.ts:12-20,98-110`. | Public Convex `getGrantByHash` exposes OAuth grant metadata to a caller possessing or guessing the hash, without demonstrated caller authority. | Make the query internal or require and verify an authorized principal before projecting bounded metadata. |
| WGA-008 | P3 | audited—no demonstrated exposure | [SOURCE] The public POST route `src/routes/api.v1.work-tree.$operation.ts:6-18` calls `handleWorkTreeAgentAction`; its catch projects a caught message only through `src/lib/server/work-tree-agent-api.ts:151-157,290-297` (the human apply projection also retains a source reason at `src/modules/work-tree/work-tree.functions.ts:460-482,536-543`). Current reachable AE throw sites inspected emit fixed codes/messages: `src/lib/server/work-tree-agent-api.ts:169-172`; `src/lib/server/convex-source.ts:104-115,231,239-244`; `convex/workTrees.ts:313-333,718-738,753,770,803-810,851-860,1291-1298,1400,1444-1445,1513-1528`; `convex/workTreeRepeatLedger.ts:147,621-635,703-723`. No attacker-controlled or secret-bearing producer, or runtime receipt proving one, was found. | Raw message projection remains a latent future-producer hazard, not a demonstrated current vulnerability; test-only injected errors at `tests/unit/work-tree/agent-work-tree-parity.test.ts:294-338` and `tests/unit/work-tree/source-functions.test.ts:289-305` are not runtime producers. | No source/test change. Reopen only on a concrete reachable producer or runtime receipt showing attacker-controlled or secret-bearing text at either boundary; then project an existing bounded refusal at that producer/boundary. Do not add a broad sanitizer/error registry. |
| WGA-009 | P1 | Accepted — open | [SOURCE] `src/modules/answer/internal/answer-tool-use-agent.ts:509-520`; `convex/answerThreads.ts:469-478`. | Each tool step writes a checkpoint, but mutation accepts only identical replay and treats a later checkpoint as conflict. A two-step task can strand at its first checkpoint and lose resume/handoff progress. | Permit monotonic checkpoint replacement under thread, owner, and sequence/version guards; retain idempotent replay semantics. |
| WGA-010 | P2 | Accepted — open | [SOURCE] `tools/ae/cli.ts:41-80`; `tools/ae/commands/invoke.ts:44-92`; `tools/ae/commands/manifest.ts:76-83`. | CLI exposes invoke but no status, cancel, or reconcile commands after its 60-second poll expires, although the manifest advertises those operations. | Add thin commands over the existing recovery endpoints, accepting invocation ref and idempotency key. |
| WGA-011 | P2 | Accepted — open | [SOURCE] `src/components/ae/console/AeAgentOperatorConsole.tsx:169-170,299-340`; `src/modules/money/public.ts:286-305`. | The operator console says unknown usage requires reconciliation but shows only aggregate counts and revoke; it omits invocation/attempt refs and recovery actions. Operators cannot identify or reconcile the uncertain call. | Project bounded invocation and attempt references and expose status/reconcile/cancel actions beside unknown usage. |
| WGA-012 | P1 | Accepted — open | [SOURCE] `tools/release/operation-gateway-production-smoke.ts:821-823`. | Production smoke accepts `callCount >= 2` for two intended invocations plus an idempotent MCP replay. Replay double-metering with count `3` can pass, and usage is not bound to exact invocation refs. | Assert exact usage per invocation ref and assert zero additional metering for replay. |
| WGA-013 | P2 | Accepted — open | [SOURCE] `.github/workflows/kernel-release-gate.yml:219-231`. | The workflow tees the full `npm run` stream, including npm preamble, into a `.json` receipt; the uploaded receipt need not be valid JSON. | Write program JSON to a dedicated file, parse it before upload, and keep console output separate. |
| WGA-014 | P2 | Accepted — open | [DOCS] `.planning/PROJECT.md:117`; `.planning/STATE.md:112`. | Status authority and derived wayfinding have drifted: documents describe source-complete/hosted-uncertified and implementation-in-progress states while old revision `b1b105b1` is still called current. Operators cannot determine the controlling present state. | Make PROJECT the single current-status authority; regenerate derived indexes and label dated plans/ADRs as historical snapshots. |
| WGA-015 | P2 | Accepted — open | [DOCS] `PAPERCUTS.md:422,581-587`. | The current supply campaign depends on 13 `agent://` and 3 `history://` records unavailable from a clone; older G01–G20 and V1–V4 raw records are also absent. The ledger cannot independently support its dispositions. | Embed sanitized decisive facts in the ledger or retain revision-bound in-repo receipts; treat ephemeral links as optional provenance only. |

### Open/still-open ledger

| Existing root | Severity | Status | Evidence and remaining impact |
|---|---|---|---|
| ENV-001 | P1 | Still open | [RUNTIME] `/` Bitcoin ask → `/t/new` → `POST /api/answer/turn` returned typed `503 UNAVAILABLE`; Retry repeated the outage, with no thread, result, or recent row. `src/routes/api.answer.turn.ts:102-112,151-168`. Buyer cannot finish. |
| SG-024 | P1 boundary | Still open | [DOCS] Hosted value exchange, independent supply, and production settlement/payout remain uncertified or unavailable. `.planning/PROJECT.md:17-23,78-80`; `.planning/STATE.md:5-6,29-33,47-50,104-110`; `src/modules/money/internal/live-money-gate.ts:53-57`; `src/components/ae/supply/AeSupplyLanding.tsx:52-64`. |
| SG-017 | P1 | Still open | [SOURCE] Provider `revokeOwner` writes `revocation_pending` and invalidates leases, but no dispatcher consumes `recordCleanupResult`; revocation cannot converge. `convex/capabilityProviderConnections.ts:933-940`. |
| Existing proof/ledger closeout root | P2 | Still open | [DOCS] `PAPERCUTS.md:451` marks 44 rows resolved after source-only review while `PAPERCUTS.md:555` says 44 remain open. Runtime-derived rows require source-fixed/runtime-unverified status until rerun. |
| Existing revision-bound proof root | P2 | Still open | [DOCS] `.planning/STATE.md:93-96` claims `3378` unit and `293` integration results plus eval counts without a matching revision-bound retained receipt; retained authority is `2778/246`, while current JSON is `3517/297` and lacks `sourceRevision`. |

- ENV-001 is not a new regression ID.
- Stripe production UI/webhook wiring remains refusal-only and folds into ENV-001/SG-024.
- `src/components/ae/console/AeCreditTopUpPanel.tsx:8-24` and `src/routes/api.stripe.webhook.ts:31-38` fail closed rather than demonstrating settlement.
- SG-017 remains the provider-revocation convergence root.
- Existing proof-count contradiction and proof-class inflation remain one root, not two.
- Future workflow metadata is directionally green but cannot retroactively prove the old STATE claim.

### Folded/rejected dispositions

- Folded: pre-acceptance `Searching`/`Reading`/`Choosing` claims followed by terminal `Worked` collapse remain anger-test roots `#3` and `#74`; `src/components/ae/chat/answer-turn-state.ts:73-77` and the existing `AeWorkDisclosure.tsx` do not create a new WGA root.
- Folded: business-only recovery controls remain `#73`.
- Folded: missing pre-thread Stop remains `#2`.
- Folded: legacy Business vocabulary remains `#47`/SG-004.
- Rejected: `Ask. It gets done.` is authorized destination copy because PROJECT removed the public-copy evidence ceiling.
- Preserved boundary: that copy does not certify hosted completion; ENV-001/SG-024 remain open.
- Folded: Stripe refusal-only behavior belongs to the existing live-money/value-exchange boundary, not a new security defect.
- Rejected: mapped-IPv6 SSRF omission. Existing tests reject mapped-private and accept mapped-public addresses; the claimed omission was not proven.
- Accepted only as SG-017: missing provider cleanup convergence.
- Rejected: a fixed `>1000` lease-invalidation vulnerability. Generation and lifecycle revalidation bound the batch and fail closed.
- Rejected: thread-ID-only owner handoff. Thread ID is not authority; `ae_session` ownership and read-only shares are intentional.
- Rejected: protected-route device redirect loss. The canonical protected route preserves the destination.
- Green continuation, not a defect: ProjectSpine and Customer Request retain durable IDs and read/status/cancel paths.
- Folded: unignored root `convex_local_storage/` and stale `.convex` databases remain existing hygiene roots `#89` and `#116-118`.
- Rejected: deleting Motion shimmer, thinking-orbs, XState, or `@tanstack/ai`; each has a deliberate current consumer.
- Not opened: StyleX `optimizeDeps` is minor stale startup noise, insufficient for a standalone root.
- Keep: exact money/ledger logic, canonical digests and stable serialization, SSRF transport controls, RFC 9457 projection, Convex validators/transactions, and x402 reconciliation.

### Green boundaries

- Runtime failures terminate as typed `503` with Retry/New ask affordances.
- Invalid thread and share access fail honestly.
- Mobile controls were usable in the audited viewport.
- Services projection fails closed for unlinked endpoints.
- Supplier UI explicitly says settled earnings and payouts are unavailable.
- Operation HTTP/MCP status, cancel, and reconcile source uses durable invocation refs, principal checks, idempotency, and typed continuations.
- ProjectSpine and Customer Request expose durable ID/read/status/cancel source paths.
- OAuth source uses hashed codes, exact redirects, PKCE, bounded media types, origin checks, and `no-store`.
- Share source uses HMAC, revocation, and sanitized projection.
- Provider readback rechecks identity/ownership and hides `credentialRef`.
- CLI malformed-JSON handling no longer echoes caller input.
- Stripe paths fail closed.
- PROJECT and release documentation explicitly keep hosted proof uncertified.
- Major build/test artifacts are ignored.
- No 5% process-ratio breach was claimed without a denominator.

### Counts

| Dimension | Count | WGA rows |
|---|---:|---|
| Accepted new roots | 15 | WGA-001–WGA-015 |
| P1 | 7 | WGA-002, WGA-003, WGA-004, WGA-005, WGA-006, WGA-009, WGA-012 |
| P2 | 7 | WGA-001, WGA-007, WGA-010, WGA-011, WGA-013, WGA-014, WGA-015 |
| P3 | 1 | WGA-008 |
| Primary `[RUNTIME]` evidence | 1 | WGA-001 |
| Primary `[SOURCE]` evidence | 11 | WGA-002–WGA-007, WGA-009–WGA-013 |
| Primary `[DOCS]` evidence | 2 | WGA-014, WGA-015 |
| Primary `[INFERENCE]` evidence | 1 | WGA-008 |

- Primary `[ARTIFACT]` WGA rows: `0`.
- All 15 accepted new roots are open.
- Existing ENV/SG/numbered roots are excluded from WGA severity and evidence totals.
- Folded and rejected candidates are excluded from accepted-root totals.

### Finish, handoff, recover, and product truth

- **Can the audited buyer finish? No.** The flagship Bitcoin ask ended in repeated typed `503` failure with no durable thread or result.
- **Can a failed buyer recover after reload? Not reliably.** A manually entered failed `/t/new` ask is lost on reload.
- **Can work hand off durably? Partially.** Durable IDs and continuation paths exist, but multi-step answer checkpoints can strand at the first checkpoint.
- **Can an API/MCP caller recover? At the kernel level, substantially yes.** Status, cancel, reconcile, idempotency, principal checks, and typed continuations exist in source.
- **Can a cold public client discover that recovery? Not reliably.** Generated UCP/MCP/OAuth/REST instructions conflict with registration or omit required shapes and routes.
- **Can an operator recover uncertain usage? No complete path is exposed.** Invocation/attempt references and recovery actions are missing from the console.
- **Can provider revocation finish? No.** SG-017 lacks a cleanup-result consumer and remains `revocation_pending`.
- **Does AE do what it says? Not end to end in the audited platform.** It fails honestly and has strong recovery primitives, but it does not yet prove buyer completion, cold-agent operability, or hosted payment/payout/value exchange.

### Do less / do more

**Do less**

- Consolidate authority, generated contracts, and durable ledger evidence.
- Do not add another registry.
- Do not add another state machine.
- Do not add another documentation family.
- Do not pursue speculative dependency cleanup.
- Do not convert source inspection, fixtures, or future workflow shape into runtime proof.

**Do more**

- Close one thin, real, hosted vertical lane before broadening.
- Preserve the buyer’s ask and recovery identity before network I/O.
- Generate public contracts from the same validators, registrations, and routes the runtime uses.
- Put invocation and attempt references where callers and operators can act on them.
- Retain exact, revision-bound, parseable receipts.

### Ordered repair sequence

1. Close authority/security exposure, monotonic answer checkpoints, and provider-revocation convergence.
2. Restore the current answer source behind ENV-001 and persist failed manually entered asks across reload.
3. Make generated UCP access/execution, MCP names, OAuth shapes, and REST recovery guidance mechanically match registered DTOs, tools, validators, and routes.
4. Surface idempotency keys before POST and add status/cancel/reconcile identities and actions to CLI and operator workflows.
5. Require exact per-invocation gateway usage, unmetered replay, valid JSON receipts, and revision-bound proof; then rerun runtime-derived closes.
6. Consolidate PROJECT status authority, refresh derived wayfinding, and retain clone-available ledger evidence.
7. Only after the thin lane completes should AE certify real hosted payment, provider payout, and end-to-end value exchange.

### Remit clarification — 2026-08-11

This campaign audits whether the **source and repository enable the fixed
Agentic Economy vision**. It does not recommend changing the vision, GTM,
product scope, supplier onboarding strategy, or founder sequencing. Payment,
payout, onboarding, and public-copy observations above are evidence boundaries
only when source claims, contracts, or runtime paths contradict one another or
block the platform from supporting those choices. The repair order is a source
dependency order, not a product roadmap or launch gate.

## 2026-08-11 source-remediation reconciliation — historical; superseded 2026-08-12

The audit-time `Accepted - open` labels in the WGA table above are historical.
The dispositions below are the 2026-08-11 snapshot and are superseded for
current source status by the 2026-08-12 post-remediation re-audit. The original
evidence and hostile-user observations remain unchanged. Full acceptance
criteria and proof ceilings are in
`.planning/research/2026-08-11-goblin-source-remediation-plan.md`.

| Finding | Current disposition | Proof ceiling / remaining blocker |
|---|---|---|
| ENV-001 | source-fixed/local-verified | Exact Node 22 local Convex+Vite/browser path proved; no hosted claim. |
| WGA-001 | source-fixed/local-verified | Durable draft/turn recovery is covered locally; hosted browser receipt absent. |
| WGA-002 | source-fixed/local-verified | Generated Service guidance now derives from the canonical DTO. |
| WGA-003 | source-fixed/local-verified | Generated MCP names derive from registered actions. |
| WGA-004 | source-fixed/local-verified | OAuth metadata/client/token/device shapes reuse and validate against the installed MCP SDK public schemas plus AE policy. |
| WGA-005 | source-fixed/local-verified | Invoke requires a caller-stable idempotency key and emits it to stderr before network I/O; restart recovery remains explicit. |
| WGA-006 | source-fixed/local-verified | Invoke/status/cancel/reconcile guidance derives from canonical route contracts. |
| WGA-007 | source-fixed/local-verified | Hash lookup requires source-write admission; unauthorized and admitted paths are covered locally. |
| WGA-008 | closed—unsupported inference | Review found no secret-bearing WorkTree error producer; no speculative machinery added. |
| WGA-009 | source-fixed/local-verified | Monotonic parent-digest checkpoints and fresh-worker continuation are covered locally. |
| WGA-010 | source-fixed/local-verified | CLI status/cancel/reconcile and unknown-outcome recovery are covered locally. |
| WGA-011 | source-fixed/local-verified | Owner-auth recovery projection/actions and cross-owner refusal are covered locally. |
| WGA-012 | source-fixed/local receipt contract | Exact per-invocation usage and zero-meter replay are required by the strict receipt; hosted receipt unproduced. |
| WGA-013 | source-fixed/local parser/workflow | CI validates and uploads only the strict receipt object; no production artifact exists yet. |
| WGA-014 | source-fixed | PROJECT, STATE, ROADMAP, active Wayfinder, ADR-035, remediation outcome, and this ledger now share one source/local-versus-hosted status. |
| WGA-015 | source-fixed/local contract | Receipt requires source revision and deployed readback; current authorities no longer cite inaccessible agent reports as proof. Hosted object unproduced. |
| SG-017 | source-fixed/local-verified | Cleanup dispatch converges to `revoked` or actionable `cleanup_required`; remote provider proof remains configuration-dependent. |
| SG-024 | source-fixed/local-verified | Official Stripe adapters, strict webhook replay, exact money, and two-phase payout are locally covered. Live top-up/charge/payout certification remains blocked. |

### Historical verification — 2026-08-11

- Node 22 TypeScript, Convex codegen dry-run, lint, and production build passed.
- `npm run test:release:integration`: 45 files, 312 tests passed.
- Answer evaluation: 13 cases, 15 turns, zero failed cases.
- Focused gateway receipt, release-source, money, webhook replay, payout,
  operation-executor, CLI recovery, Answer durability, and UI-contract checks
  passed.
### External certification blocker

No strict hosted receipt or live-money block was run. Production certification
requires the exact configured Convex/Vercel/Clerk deployment, separate gateway
issuance and consumer secrets, source-write authority, current public release
manifest, model/provider source, approved owner/control fixtures, Stripe
live-mode configuration and compliance approval, explicit production consent,
and the hard-capped spend input. Missing prerequisites fail closed; they do not
justify a bypass or a production claim.

## Post-remediation goblin re-audit — 2026-08-12

### Current status correction

The remediation campaign remains open. Seven workstreams are focused-verified
and the complete Node 22 post-codegen source gate is green, but the
payout-period lifecycle is blocked for lack of a trusted server-owned nonzero
minimum-payout policy. The outer production release gate fails closed at
deployment-manifest validation, and hosted certification remains blocked. The
2026-08-11 closeout above remains historical evidence for its dated snapshot.

### Method and evidence boundary

- This campaign re-audited the current working tree after the 2026-08-11
  source-remediation reconciliation above. It does not rewrite the historical
  WGA observations or their then-current dispositions.
- Ten first-wave goblins covered buyer completion, recovery, protocols,
  repository hygiene, dependencies, product language, proof, security, money,
  and supplier lifecycle. Five independent verifiers then falsified and
  deduplicated the surviving buyer, recovery, money, proof/protocol/repository,
  supply, and security claims.
- Product authority: `.planning/PROJECT.md:9-25,116-125`. Engineering and proof
  authority: `RULES.MD`.
- Evidence classes remain `[RUNTIME]`, `[SOURCE]`, `[DOCS]`, `[ARTIFACT]`, and
  `[INFERENCE]`. Each new PRA row has one primary evidence class for counting.
- Current source and current runtime observations control over the prior
  reconciliation. A prior `source-fixed` label is reopened only where the
  current caller/state transition contradicts it.
- The audited browser runtime used `http://127.0.0.1:3030` against a local
  Convex deployment. No credential-bearing provider call, Stripe transfer,
  x402 payment, production mutation, or hosted release was attempted.
- Local source-write/Convex configuration was changed during diagnosis.
  Resulting source-unavailable responses are configuration evidence, not a new
  availability defect. The lifecycle behavior after those failures is valid
  runtime evidence.
- A focused recovery suite ran under Node 22: 8 files and 54 tests passed.
  In-process and CLI `operation.execute` probes returned a real keyless
  CoinGecko result with evidence identity. These checks do not prove paid
  delivery or hosted operation.
- Default live-money policy still fails closed. PRA-001–PRA-003 are source
  defects that block safe enablement, not claims of observed external loss.

### Personas and hostile surfaces

- Impatient buyer with an interrupted or failed Answer stream.
- Cold external agent following generated Service, MCP, OAuth, and recovery
  instructions literally.
- Delegated operator recovering uncertain invocation state.
- Supplier attempting x402 onboarding and connection maintenance.
- Provider cleanup and revocation undertaker.
- Money/value-exchange adversary checking one-rail, Qualified Use, and payout
  invariants.
- Security reviewer checking public Convex readback and SSRF parity.
- Proof prosecutor following Checkout prepare/complete across deployments.
- Repository archivist and dependency/handrolling principal.
- Skeptical product-truth reviewer comparing the category promise with
  reachable behavior.

### Plain platform verdict

- The core is real, not a mock: current keyless Operation execution worked
  both in process and through the CLI, and the source has durable invocation,
  status, cancellation, reconciliation, evidence, budget, and refusal seams.
- The complete market promise is not yet safe or proven. The paid worker can
  account one x402 invocation on two rails, can settle before validating
  supplier output, and can make an open current-month payout transferable.
- Buyer Answer did not finish in the audited runtime. An uncaught stream
  failure emitted a terminal error while authoritative readback remained
  pending; `Ask another` can then hide that durable work without stopping it.
- Handoff and recovery are partial. Durable Stop worked, and focused recovery
  tests passed, but an Answer effect can replay across the pre-checkpoint
  crash window, a pre-dispatch replay can leak its reservation, and initial
  provider cleanup binds the wrong attempt.
- Supplier self-service is partial. An x402 supplier cannot complete the
  mandatory Funnel Test, and connection recovery mutations exist but are not
  reachable from the owner product.
- Cold-agent operability is still inconsistent: current generated access and
  execution prose, the OAuth registration recipe, and the hosted proof
  prepare/complete identity do not match their authoritative contracts.
- Hosted value exchange remains uncertified. AE should do less surface
  expansion and more exact completion of one thin discover → invoke → validate
  → settle → recover → pay lane.

### Accepted new roots

| ID | Severity | Status | Evidence | Root and user impact | Lean reuse-first fix |
|---|---|---|---|---|---|
| PRA-001 | P1 | Accepted — open | [SOURCE] `.planning/adr/ADR-034-supplier-usage-qualified-use-and-payout-spine.md:77-82`; `convex/capabilityOperationInvocationWorker.ts:308-310,547-579,787-810`; `convex/moneyLedger.ts:1885-1977`; `src/modules/capability-supply/route-transport-runtime.ts:1619-1684`. | The worker identifies x402 but still calls `authorizeInvocationCharge`, creating the AE operator debit, supplier accrual, and rake before releasing a provider-direct x402 payment. One invocation can traverse both economic rails. | Branch on the already-known rail. Keep AE charge/accrual/rake only for AE-internal billing; keep x402 budget custody and observation without creating an AE payout. Prove one signed x402 release, zero AE ledger charge/accrual/rake, and replay with no new effect. |
| PRA-002 | P1 | Accepted — open | [SOURCE] `.planning/adr/ADR-034-supplier-usage-qualified-use-and-payout-spine.md:13-20`; `convex/capabilityOperationInvocationWorker.ts:803-825,1712-1725,2021-2078`; `convex/moneyLedger.ts:5615-5671`. | `reconcileAcceptedCharge` settles and credits the payout period from `releaseStarted` before `parseContractOutput` validates the terminal result. Malformed or schema-invalid output can therefore be charged and accrued even though the invocation later becomes `reconciliation_required`. | Parse and validate the bounded output once before economic finalization. Settle only contract-valid output; route deterministic refusal/invalid output through the existing exact reversal, and keep genuinely unknown transport frozen. |
| PRA-003 | P1 | Accepted — open | [SOURCE] `convex/moneyLedger.ts:764-793,883-945,4125-4286,5615-5671`; `src/modules/money/internal/payout-policy.ts:129-180`; `src/components/ae/supply/AeSupplyEarningsCard.tsx:154-160,520-533`. | The first current-month accrual creates `held_threshold` with a zero minimum, and transfer admission checks neither period close nor review window. It can be paid immediately; a later same-month accrual reuses that paid row and becomes permanently unreconcilable. | Accrue into one open, non-transferable current period. Reuse the existing review-window policy to transfer only a closed prior period above one server-owned nonzero threshold, with below-threshold rollover. |
| PRA-004 | P1 | Accepted — open | [SOURCE] `src/modules/answer/internal/answer-tool-use-agent.ts:1501-1524`; checkpoint persistence follows tool execution at `src/modules/answer/internal/answer-tool-use-agent.ts:800-855`; monotonic storage is in `convex/answerThreads.ts:540-600`. | Authenticated Answer operation identity hashes `turnId + operationRef + input`, but not the stable tool ordinal. A process/lease death after provider dispatch and before checkpoint persistence lets a rerun with changed model input create a second external effect. This narrows and reopens the WGA-009 proof ceiling; it is not the old monotonic-checkpoint bug. | Bind invocation identity to reservation-bound turn plus stable tool ordinal, while retaining operation/input in the request digest. Crash after dispatch, resume with changed model output, and prove one invocation plus a material-change conflict. |
| PRA-005 | P1 | Accepted — open | [SOURCE] `src/modules/capability-execution/operation-invoke.ts:690-710,721-739`. | A crash after idempotency reservation but before dispatch can replay with no result. If fresh preflight then refuses, `refuseBeforeDispatch` skips `abandon` solely because the reservation was replayed, leaving a permanent pending row and consuming grant concurrency. | Call the existing guarded `abandon` seam for replayed no-work reservations too. Its state guards already distinguish untouched rows from dispatched work. Prove crash/retry cleanup and refusal of abandonment once work exists. |
| PRA-006 | P2 | Accepted — open | [SOURCE] `convex/externalRuns.ts:116-130,319-356`; `src/modules/external-run/internal/contract.ts:124-153`; `src/modules/external-run/external-run.functions.ts:57-59`. | Public Convex queries `inspectManifest` and `readReport` require only `runId`. A direct caller can read provider participation, creator/window data, failed commercial gates, and final decision without identity, role, ownership, or source admission. | Make the reads internal or reuse the existing admin/owner authorization seam before reading. Keep one authorized server projection; do not add another token scheme. |
| PRA-007 | P2 | Accepted — open | [SOURCE] `src/modules/network-guard/public.ts:14-28,36-53,56-95`; `src/modules/capability-supply/internal/transport-adapters.ts:556-585`; `convex/capabilityOperationInvocationWorker.ts:533-536,615-618`. | Static literal admission blocks IPv4 benchmarking addresses, but the runtime DNS/socket `BlockList` omits `198.18.0.0/15`; static and runtime checks omit deprecated IPv6 site-local `fec0::/10`. A supplier hostname resolving there can pass readiness/invocation guards if the hosted network routes those ranges internally. Hosted routability was not tested. | Add both ranges to the single runtime deny-list, align static literal classification, and extend the existing parity tests for direct literals and DNS answers. |

### Reopened and still-open roots

| Existing root | Severity | Current disposition and decisive evidence |
|---|---|---|
| Anger-test `#2` / terminal aspect of `#3` | P1 | Reopened/folded. [RUNTIME] A thread frame was followed by terminal `answer_turn_failed`, but exact-thread reload projected `Answer is still pending`. [SOURCE] the route catch emits an error without converging the reservation (`src/routes/api.answer.turn.ts:198-218`), while reserved readback remains pending (`src/modules/answer-thread/internal/public-projection.ts:347-364`). `handleNewQuestion` also clears local identity without using durable Stop or leaving `/t/$threadId` (`src/components/ae/chat/AeChat.tsx:580-589`). |
| WGA-002 | P1 | Reopened. Canonical Service registration accepts only `ae.access:'external'`, while generated prose teaches `open` and ambiguously combines supplier URL/`request_route` with later AE gateway instructions (`src/modules/registry/internal/service-projection.ts:26-56`; `src/modules/registry/registry.actions.ts:301-318`; `src/modules/discovery/internal/agent-skill.ts:53-76`; `src/modules/discovery/internal/discovery-files.ts:37-66`). |
| WGA-004 | P1 | Reopened. The published CLI OAuth registration recipe omits `client_name` and `redirect_uris`, which the registration handler requires (`tools/ae/commands/manifest.ts:125-158`; `src/lib/server/agent-access-oauth-api.ts:156-173`). The built-in connect client sends them; the public recipe does not. |
| WGA-015 | P2 | Reopened. Checkout `prepare` and `complete` can run after separate fresh Vercel and Convex deployments, but the downloaded preparation artifact does not bind the prepare deployment IDs/URL; completion can certify payment prepared against deployment A as deployment B (`.github/workflows/kernel-release-gate.yml:378-405`; `tools/release/operation-gateway-production-smoke.ts:270-285,4960-5019`). |
| SG-017 | P1 | Reopened/folded. Initial revocation enqueues cleanup attempt 1, but the persisted projection omits `cleanupAttempt` and remains at attempt 0 (`convex/capabilityProviderConnections.ts:458-485`). The worker rejects the first job as `cleanup_request_mismatch`; manual retry happens to persist the increment. |
| SG-016 | P2 | Still open/folded. Owners can select existing provider connections but current `src/` exposes only `listOwner`; existing ownership-checked create/reconnect/rotate/revoke/retry mutations are unreachable from the owner product (`src/components/ae/supply/AeSupplyEndpointConfigStep.tsx:20-30,379-443`; `src/modules/capability-supply/supply-funnel.functions.ts:1053-1058`; `convex/capabilityProviderConnections.ts:1129-1360`). |
| SG-011 | P1 | Still open/folded. `runOwnerSupplyTest` refuses every x402 offering before recording the event that completes the mandatory Test step (`convex/capabilitySupplyOwnerSupply.ts:165-228`; `convex/capabilitySupplyOwnerFunnel.ts:755-784`). Reuse the existing x402 readiness-challenge observation as an honest no-payment completion criterion. |
| SG-024 | P1 boundary | Still open. Current local source contains official Stripe/x402 machinery, but no exact hosted receipt or approved live-money block exists, and PRA-001–PRA-003 prevent safe enablement. `.planning/PROJECT.md:116-125`; this file's external-certification boundary at lines 956-964. |

### Rejected, overstated, and maintenance-only candidates

- Rejected: the prior IPv4-mapped IPv6 bypass. Current
  `extractMappedIpv4Address` normalizes mapped addresses before applying IPv4
  ranges (`src/modules/network-guard/public.ts:137-172`). PRA-007 is a distinct
  missing-range parity defect.
- Rejected as stale: WGA-007 public OAuth hash readback. The current query
  requires source-read admission (`convex/agentAccessOAuth.ts:94-110`).
- Rejected as a new root: broad provider-revocation non-convergence. The
  shared Workpool, callback, repair, and retry model exists; the exact current
  defect is SG-017's omitted initial `cleanupAttempt`.
- Rejected as a second supplier-admission root: historical generic
  source/quote hardcoding is stale. The current impossible x402 Test is folded
  into SG-011.
- Rejected as a second visibility root: owner facts now expose Operation
  state. The surviving inability to act on connection state is SG-016.
- Rejected: dependency deletion proposals for Motion, `thinking-orbs`,
  XState, `@tanstack/ai`, and current schema conversion. Each has a direct
  current consumer or protocol role; replacing it did not prove semantic
  equivalence or a net maintenance win.
- Maintenance-only, no root: Vite still lists absent
  `@stylexjs/stylex` in `optimizeDeps.include` (`vite.config.ts:60-63`).
  Remove the stale line when touching Vite config; startup noise alone did not
  justify a platform severity row.
- Rejected as current proof defects: old npm-preamble JSON receipt and
  call-count-only replay claims. Current source uses a dedicated strict
  artifact/parser and exact invocation-bound usage; WGA-015's cross-deployment
  preparation identity is the surviving proof gap.
- Rejected: repository size, generated-file count, markdown count, and output
  volume without a demonstrated wrong authority decision, failed consumer, or
  unrecoverable operator action.
- Rejected: hero copy as an independent defect. PROJECT explicitly authorizes
  destination copy while separately limiting current evidence. The evidence
  ceiling remains SG-024.
- Not a new source defect: the audited Answer source-unavailable condition
  depended on local Convex/source-write configuration. Its incoherent terminal
  versus durable state remains a valid folded buyer-lifecycle defect.

### Green boundaries

- Direct keyless execution worked through both the in-process executor and
  `ae ... operation.execute`; both returned the same CoinGecko value and an
  evidence hash in the audited run.
- The focused Node 22 recovery suite passed 8 files and 54 tests covering
  Answer lease/recovery, provider cleanup, CLI invoke/recover, operation
  recovery, and market-terminal recovery.
- Durable buyer Stop converged from pending to `Answer stopped`.
- OAuth device handoff reached a user code and verification URL; authenticated
  approval and token completion were not proved.
- Operation HTTP/MCP recovery retains typed status, cancel, reconcile,
  idempotency, principal, and continuation contracts.
- Answer monotonic checkpoints, generation-fenced takeover, and atomic final
  persistence remain present; PRA-004 is the earlier pre-checkpoint effect
  window.
- Work-bearing invocation replays, cross-owner recovery denial, WorkTree
  continuation, route Workpool, notification outbox, and payout
  outcome-unknown fencing survived source review.
- Provider connection backend mutations derive authenticated ownership,
  preserve authority generation/digest fencing, invalidate leases, and do not
  project credentials to the browser.
- x402 challenge amount/network/asset/payee/custody checks and official signing
  remain intact. PRA-001 concerns rail separation, not signature mechanics.
- Input validation occurs before provider release; output validation correctly
  prevents a false `completed` projection. PRA-002 concerns economic ordering.
- Stripe idempotency, outcome-unknown, reversal, and fail-closed live-money
  gates remain intact.
- SSRF redirects, DNS rebinding checks, mapped IPv6 normalization, loopback,
  RFC1918, CGNAT, link-local, ULA, multicast, and high reserved IPv4 ranges
  remain guarded.
- External-run writes remain source/admin gated and stored manifest/report
  digests remain integrity-checked; PRA-006 concerns read authorization.

### Counts

| Dimension | Count | Rows |
|---|---:|---|
| Accepted new roots | 7 | PRA-001–PRA-007 |
| P1 accepted | 5 | PRA-001–PRA-005 |
| P2 accepted | 2 | PRA-006–PRA-007 |
| P3 accepted | 0 | — |
| Primary `[SOURCE]` evidence | 7 | PRA-001–PRA-007 |
| Reopened/still-open folded roots | 8 | `#2/#3`, WGA-002, WGA-004, WGA-015, SG-017, SG-016, SG-011, SG-024 |
| Rejected/overstated/maintenance-only dispositions | 11 | Bullets above |

- Primary `[RUNTIME]`, `[DOCS]`, `[ARTIFACT]`, and `[INFERENCE]` evidence for
  accepted PRA rows: `0`.
- Runtime observations support the folded buyer lifecycle and green boundaries;
  they are excluded from PRA evidence counts.
- All seven accepted PRA roots are open.

### Finish, handoff, recovery, and scope verdict

- **Can a direct keyless Operation finish? Yes, in the audited local path.**
  In-process and CLI execution returned a real result and evidence identity.
- **Can the audited buyer Answer finish? No.** Its live turn terminated with
  an error while authoritative readback remained pending.
- **Can a buyer deliberately stop work? Yes.** The current Stop path converged
  durably.
- **Can `Ask another` safely hand off? No.** It can clear local recovery
  identity and leave the durable thread running behind the same URL.
- **Can Answer resume without duplicate external effects? Not fully.**
  Checkpoint continuation is strong after persistence, but PRA-004 leaves the
  provider-effect/pre-checkpoint crash window.
- **Can an invocation recover after a pre-dispatch crash? Not always.**
  PRA-005 can leak a replayed, workless reservation.
- **Can provider revocation finish? Not on the initial queued attempt.**
  SG-017's persisted attempt mismatch forces cleanup-required.
- **Can an x402 supplier finish onboarding? No.** SG-011 makes the mandatory
  Test impossible.
- **Can a supplier maintain its connection? Backend yes, product no.**
  SG-016's owner controls are not reachable.
- **Can AE safely claim paid value exchange? No.** Live money is fail-closed,
  PRA-001–PRA-003 violate economic invariants, and SG-024 lacks hosted proof.
- **Should AE do more or less? Less breadth, fewer parallel guidance/status
  surfaces, no new state machines. More exact convergence of the current thin
  lane and one revision-bound hosted proof after the source invariants close.**

### Ordered repair sequence

1. Keep live money disabled. Separate x402 from AE-internal charging
   (PRA-001), validate output before economic finalization (PRA-002), and close
   payout periods before transfer (PRA-003).
2. Bind Answer effects to tool ordinal (PRA-004), abandon replayed workless
   reservations (PRA-005), and persist the initial provider cleanup attempt
   (SG-017).
3. Gate ExternalRun reads with existing authority (PRA-006) and align the
   shared SSRF deny-list/parity tests (PRA-007).
4. Converge every uncaught Answer failure before emitting a terminal frame and
   make New question use canonical stop/navigation/recovery semantics
   (`#2/#3`).
5. Repair generated Service execution/access and OAuth registration guidance
   from canonical schemas/contracts (WGA-002, WGA-004).
6. Make the x402 Test complete from honest challenge-readiness evidence and
   expose the existing connection lifecycle mutations in one owner panel
   (SG-011, SG-016).
7. Bind Checkout preparation to exact Vercel and Convex deployment identities
   (WGA-015), then run one exact-revision hosted discover → invoke → validate
   → settle → recover → payout proof. Only that receipt can close SG-024.

### 2026-08-12 bounded remediation verification

This update supersedes the open-state claims above only for the bounded P1
campaign:

- Resolved and focused-verified: PRA-001, PRA-002, PRA-004, PRA-005, the buyer
  terminal/New-question convergence root, SG-017 provider cleanup fencing,
  SG-011 x402 readiness-only Test, and the generated public projection repairs.
- Intentionally blocked: PRA-003. Source still lacks a trusted server-owned
  nonzero minimum-payout policy, so no production threshold or payout-period
  lifecycle was invented.
- Not part of this P1 campaign: PRA-006 and PRA-007 remain open P2 rows.
- The complete Node 22 `test:release:source:after-codegen` gate passed from the
  current tree: lint, typecheck, kernel-retirement verification, unit and
  integration release suites, type/import/TypeScript/SEO/UI-contract checks,
  the 13-case/15-turn Answer evaluation, and production build.
- The outer `test:release:source` gate remains blocked honestly:
  production-manifest validation refuses missing or malformed operator-owned
  canonical, Clerk, Convex, model, Stripe, x402-custody, and seven source-write
  authority families. No strict hosted receipt or live-money proof was earned.

**Bounded-verification verdict at that point:** the campaign remained open
because PRA-003 lacked trusted policy input. The design update below supersedes
that policy-input claim only; source and hosted proof remain open.

### 2026-08-12 payout-policy design update

This design update supersedes only the claim that PRA-003 lacks policy input;
it does not close the source defect or raise the proof ceiling.

- ADR-034 now selects automatic daily full-balance AE-internal supplier
  settlement, exact reservation before Stripe release, one sub-minor carry,
  global per-currency liquidity serialization, and truthful
  `transferred_to_stripe` semantics.
- It rejects the fabricated zero/current-month authority, copied monthly review
  window, commercial minimum, owner-selected amount, and manual payout button.
- PRA-003 remains open until the source, tests, generated consumers, and owner
  projection implement that contract.
- Hosted live money remains blocked on signed reserve/payment-method/recovery/
  jurisdiction/tax policy, valid production configuration, and the exact hosted
  top-up → Qualified Use → Transfer → readback proof.

### 2026-08-12 mock/demo/stub audit remediation

1. A no-discretion contract included an async-vs-sync type detail (`readManifest`
   as `Promise<readback>|readback`) that the on-disk type (sync `=> result`) didn't
   match, and the implementer STOPPED on the mismatch instead of proceeding. The
   detail was immaterial to the actual change; I had to re-dispatch. Lesson: keep
   byte-precise contracts but hedge ``Promise<T>|T``-style type claims, or say
   explicitly when a stated type detail is non-blocking.

2. Two implementers (discovery canonical + manifest adapter) both edited the
   shared `src/modules/discovery/public.ts` concurrently — one added the
   `unconfigured` reason literal, the other made `adapter` required. Both ran tsc
   green individually; only a post-hoc combined tsc + 21-file test pass proved
   the merged file was coherent. Lesson: concurrent edits to one shared module
   need an explicit post-merge gate, not per-agent verification alone.

120. deepseek-v4-flash: Live answer probe (2026-08-13, local stack): 'Convert 500 US dollars to euros' executed Frankfurter but returned '500 USD is 707.1 AUD' — quote currency mis-bound to AUD despite no AUD token in the query; slot binding / synthesis seam needs the declared surface pre-parse (P2).

121. openai-codex/gpt-5.6-sol: Starting npm run dev:local under the repo-pinned Node 22 stalls until the 120s timeout because Convex bundles @clerk/tanstack-react-start keyless fileStorage into a non-Node function graph and cannot resolve node:fs/node:path. The same dependency leak blocks convex codegen; isolate the Clerk server import behind a Node-only boundary.

122. openai-codex/gpt-5.6-sol: Restarting npm run dev:local through the supervisor left an orphaned convex-local backend on port 3210, so the replacement stack failed until the backend PID was stopped manually. The supervisor/local-dev teardown should reap the Convex child reliably.

123. gpt-5.6-sol: Running npm run test:conformance under Node 22 emitted many TimeoutOverflowWarning messages because future absolute timestamps were passed to setTimeout and clamped to 1 ms; the tests pass, but the warning flood hides useful gate output.

124. gpt-5.6-sol: Live Answer re-probe: mixed weather+FX and crypto+FX requests searched both intents but executed one operation, then falsely claimed the other routeable capability was unavailable. The staged navigation/composition seam must preserve every requested part or narrow explicitly.

125. gpt-5.6-sol: Live same-thread re-probe: CoinGecko follow-up reuse passed, but weather 'And tomorrow?/London', FX 'What about GBP?', and cat 'Make it five' lost the selected capability and fell into business/catalog fallback with zero operation outcome. Continuation remains capability-shape-specific rather than contract-driven.

126. gpt-5.6-sol: Live API+CLI re-probe: requests for 2 or 3 cat images repeatedly returned 10 provider records, and two CoinGecko requests asking for 24-hour change returned price-only payloads. Optional published inputs are not reliably carried into the strict operation call.

127. gpt-5.6-sol: Live Answer re-probe: unambiguous free keyless FX and cat asks nondeterministically executed or stopped at catalog prose asking permission; in one FX thread, the confirming follow-up 'Yes, execute it' was then falsely refused as physical harm. Safe zero-cost auto-call/consent policy is incoherent.

128. gpt-5.6-sol: Live Answer re-probe: vague 'weather' and several capability follow-ups crossed into local-business discovery, while Wikipedia on CLI became 'No businesses match'. The business-versus-Market-Operation dispatch boundary still substitutes the wrong registry instead of capability clarification/unavailable.

129. gpt-5.6-sol: Live Answer safety re-probe: harmless nonsense, prompt-injection text, a fabricated operation ref, and 'Yes, execute it' were labelled as requests that could cause physical harm; a benign named-city weather ask also stopped because the safety check was unavailable. Zero provider I/O held, but the refusal taxonomy is accusatory and blocks valid work.

130. gpt-5.6-sol: Live ipify execution returned a real server-side result, but Answer called it 'Your public IP' and 'the public-facing IP address of your internet connection'. The operation truth/prose must identify AE runtime egress, not attribute server evidence to the browser user.

131. gpt-5.6-sol: Live CLI compare failed twice, including two current routeable refs, with operation_read_unavailable; Convex logged capabilitySupplyOperations:compare uncaught operation_comparison_value_invalid. search, inspect, and inspect-plan passed, so the advertised canonical CLI loop breaks specifically at compare.

132. gpt-5.6-sol: Live CLI natural follow-up cannot use --thread-id alone: demand ask exits INVALID_ARGUMENT ask-selection-args unless operation-ref and candidate-digest are also supplied. The machine-readable first result exposes those fields, but the CLI lacks a plain conversational same-thread continuation path.

133. gpt-5.6-sol: Live browser re-probe: a successful TheCatAPI outcome exposed ten URLs in raw JSON but rendered zero images and zero clickable result links; the main transcript instead showed raw schema terms, an opaque operation ref, and digests. Structured provider results need safe user-facing projection with evidence moved behind disclosure.

134. openai-codex/gpt-5.6-sol: Checking local dev ports -> lsof rejects repeated -sTCP:LISTEN when two -iTCP filters are supplied; inspect one port per invocation or use one combined port expression.

135. openai-codex/gpt-5.6-sol: Running two focused Vitest cases -> Vitest accepts only one -t value, so combining two named filters fails before tests; run the files together or invoke each filter separately.

136. openai-codex/gpt-5.6-sol: Restarting the supervised dev:local stack -> the parent stopped but its Convex child remained on 3210, so the restart immediately failed with 'local backend is still running'; start Vite separately or make supervisor teardown reap the Convex child reliably.

137. openai-codex/gpt-5.6-sol: Running the conformance gate under Node 22 -> passing tests emit repeated TimeoutOverflowWarning values around 1.786e12ms, indicating a fake absolute timestamp reached setTimeout instead of a relative delay; clamp or convert the readiness scheduling delay in the test/runtime seam.

138. openai-codex/gpt-5.6-sol: Diagnosing a persisted Answer projection required an ad hoc Vitest file: tsx could not import the ESM-only @tanstack/ai graph, and bare vite-node did not load the repo's @ alias. A supported one-shot server-module probe would make live persisted-shape debugging cheaper.

## 2026-08-14 post-remediation 32-persona goblin campaign

This historical audit-time campaign is consolidated in
`.planning/evidence/goblin/goblin-campaign-report-2026-08-14.md`. Entries
139–148 are its deduplicated promoted roots; later remediation may supersede
their status. Existing roots such as SG-016, PRA-001–003, SG-004/013, and the
operation-detail Provider/Supplier/Publisher labels retained their earlier
ledger identities. Report P3-3 (MCP ordering) and P3-4 (inspect-plan wording)
remained non-blocking ergonomics and were not promoted to ledger roots.

139. openai-codex/gpt-5.6-sol: A live `I need an emergency plumber near Perth` turn persisted `interpretation.route = operation`; `turn-orchestrator.ts` then skipped deterministic business retrieval and produced Market Operation no-match plus no-businesses recovery UI. Require a positive capability signal before a model-selected Operation route can bypass the existing deterministic service lane.

140. openai-codex/gpt-5.6-sol: `advanced action` resolves and directly runs any registered action with `caller: 'cli'` without enforcing `action.surfaces.includes('cli')` or the Harness `surface_not_allowed` policy. This makes MCP-only `operation.execute` CLI-reachable and leaves future actions exposed to a second undeclared surface.

141. openai-codex/gpt-5.6-sol: Machine action projections drift from the canonical registration: live MCP `tools/list` omits supported `outputSchema`, site-manifest operation reads omit action ID/version/output schema, direct-keyless CLI metadata omits its output, and compare/inspect parameter metadata calls arrays objects. Derive these projections from the registered action descriptor instead of hand-copying partial contracts.

142. openai-codex/gpt-5.6-sol: CLI public-read adapters consume only part of the canonical contract: search/detail accept any 2xx body without output-schema parsing, search exposes no limit/cursor/filter continuation, and compare rejects the canonical one-ref case. Reuse the existing input/output schemas and pagination fields in the thin adapters.

143. openai-codex/gpt-5.6-sol: Imported web claims accept arbitrary string `websiteUrl`/`sourceUrl` values and render them directly as target-blank anchors, unlike Operation outcomes' HTTPS/credential/control/bidi validator. Reuse that validator before persisting/projecting web claims and omit invalid links.

144. openai-codex/gpt-5.6-sol: Answer can call operation compare/inspect-plan but its artifact builder discards comparison facts and plan summaries; replay/share therefore loses fact source/validity and plan refs/cost/data/effects/expiry. Persist one bounded public artifact from the already-validated tool result, not private tool/model state.

145. openai-codex/gpt-5.6-sol: Public builder examples use bare CLI commands that default to the hosted deployment even when read from a local `/for-agents`, and say to Connect whenever direct keyless execute is absent even if detail is inspect-only. Bind examples to the request-derived base URL and continue only through relations the exact detail advertises.

146. openai-codex/gpt-5.6-sol: After a completed Answer follow-up, the enabled composer retains the submitted text because `submitQuery()` never clears local `value`. Clear it after accepted submission while preserving it on local validation or transport failure.

147. openai-codex/gpt-5.6-sol: Unknown CLI command tokens bypass shared failure sanitization and are interpolated verbatim into human and JSON errors. Existing base-URL and malformed-JSON secret redaction is green; bound/redact the unknown token too.

148. openai-codex/gpt-5.6-sol: The CLI manifest/README correctly avoid anonymous owner mutation but provide no supplier handoff to `/for-providers` or authenticated `/owner/supply` for publication, connection maintenance, earnings, or payout state. Add one explicit non-mutating owner-product handoff rather than CLI mutation commands.

## Later workstream papercuts and remediation updates

Entries below are not findings from the 32-persona campaign. They record later
workstreams, duplicate observations, and explicit remediation status.

149. openai-codex/gpt-5.6-sol: Node 22 conformance passed 390 tests but emitted repeated TimeoutOverflowWarning values around 1.786e12; a persisted absolute timestamp appears to reach setTimeout instead of a relative delay, producing noisy 1 ms timers.

150. openai-codex/gpt-5.6-sol: Convex codegen fails before project validation because @clerk/tanstack-react-start server keyless fileStorage imports node:fs/node:path into a non-Node Convex bundle; isolate the Clerk server import or mark the owning Convex action use node.

151. openai-codex/gpt-5.6-sol: The broad release integration gate timed out customerRequestRouteMandate's competing-repeat-use test at 15 s under full-suite load, while the identical isolated case passed in 837 ms; classify as suite-load flake and avoid raising the test timeout without a repeatable slow path.

152. openai-codex/gpt-5.6-sol: Supplying a Node 22 PATH through the harness bash env still resolved node from the active Node 25 nvm shell; use the absolute Node 22 binary (and invoke npm/vitest through it) for release gates.

153. openai-codex/gpt-5.6-sol: Convex codegen followed registry operation navigation into executable server actions, pulling Clerk's node:fs/node:path into the browser-platform bundle; keep navigation on pure action contracts instead of operations.actions.

154. openai-codex/gpt-5.6-sol: Reading multiple skill:// resources concurrently through Eval Python threads failed with Missing session/run/name; direct parallel read calls are reliable, and Eval docs should clarify that Python threads are unsupported.

155. openai-codex/gpt-5.6-sol: TypeScript diagnostics through the mounted LSP failed because no language server is configured for src/**/*.ts, forcing the slower full project typecheck for import and type feedback.

156. openai-codex/gpt-5.6-sol: The mounted browser run tool switched from accepting a JS function body with top-level return to parsing only a single expression mid-session; multi-statement reload checks failed until wrapped in an async IIFE.

157. auto: While running the GSD update workflow, every zsh command emitted a missing /Users/joelchan/.cargo/env startup error; the stale source line in ~/.zshenv adds noise to otherwise successful commands.

158. auto: The GSD update context detected the active Codex install in the Orca-managed home, but the documented global installer command wrote to ~/.codex unless CODEX_HOME was explicitly exported; the first install therefore updated the wrong runtime root.

159. auto: Full React Doctor audit scanned gitignored playwright-report assets as product source until doctor.config.ts ignored playwright-report/**; generated report crypto findings were noise.

160. auto: During parallel codebase mapping, PROMPT-DATA-FLOW.md and IA-DATA-FLOW.md vanished from disk (git showed D) before their refresh agents finished writing; restored from HEAD so the maps were not lost mid-flight.

161. composer-2: Product-Frontier Cleanup: WorkTree/Customer Request development smokes are env-blocked (no local Convex / missing AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY); recorded as blocked Tier B rather than silent pass.

162. composer-2: Faux-runtime-surfaces import guard already fails on capability-execution/operation-approval.functions.ts isLocalE2EAuthBypassEnabled; left out of test:imports expansion during frontier cleanup to avoid mixing pre-existing failures into the batch gate.

163. auto: The conformance suite passes but emits many Node TimeoutOverflowWarning messages under local Node 25 because future timestamps exceed the 32-bit timer range; the repo requires Node 22, so local gate output is noisy and can obscure real failures.

164. auto: The evidence:* npm scripts expose no usable default and package.json does not document required run/verify path/revision arguments; direct gate invocation fails with usage errors, while official provider/mandate/yolo packets additionally refuse the intentionally dirty cleanup checkout.

165. composer-2: Thermo-nuclear giant-module audit: first safe shrink is pure continuation helpers out of turn-orchestrator; moneyLedger/worker still need policy extraction behind the same Convex authority, not new spines.

166. composer-2.5: Running npx eslint on Batch 2 files bypassed the repository lint wrapper and failed because ESLint 10 could not find a flat config. Use the package lint script/project wrapper instead of invoking ESLint directly.

167. composer-2.5: A combined 'git diff --check; wc -l' command masked the diff-check failure because the shell returned wc's status; unrelated pre-existing whitespace errors were present. Run scoped diff-check separately or chain with && when status matters.

168. gpt-5.6-sol-low: While inventorying the review diff, every zsh command emitted '/Users/joelchan/.zshenv:.:1: no such file or directory: /Users/joelchan/.cargo/env'; the shell bootstrap should guard sourcing the optional Cargo env file.

169. gpt-5.6-sol-low: During the goblin CLI campaign, stopping npm run dev:local left Vite listening on 3024 while Convex was gone; the next managed startup failed on the occupied port and served only 503s. Supervisor shutdown must reap the detached Vite tree and verify its ports close.

170. gpt-5.6-sol-low: During the goblin CLI campaign, dev:local reseeding failed with curated_provider_connection_refused:connection:exa:invalid_transition against existing local state. The development seed must be idempotent across routine restarts or repair stale curated connection state explicitly.

171. composer: CI goblin CLI battery: default shell node was v25 until nvm use 22; zsh arrays are 1-indexed so REFS[0] silently emptied compare args and produced a false INVALID_ARGUMENT.

172. composer-2: Privacy goblin: unknown-command echoed raw argv tokens and requireOk forwarded arbitrary remote problem detail; fixed by omitting the token and suppressing remote detail in favor of title/code.

173. composer-2: CLI error projection had drifted from src/lib/errors.ts: tools/ae/lib/output.ts duplicated the canonical stable-code regex and hand-rolled its own remote-problem handling, so a privacy fix was first written as a bespoke rule instead of a shared projection. Added remoteProblemToProblem to the canonical model and deleted the CLI duplicate.

174. composer-2: Collaborative goblin: exact candidate selection consistently dies with answer_turn_persist_failed (HTTP 500) across cat and CoinGecko threads — selection resolves then fencing/persistence fails closed.

175. composer-2: Collaborative goblin: explicit search-only/do-not-execute instructions were ignored (CoinGecko executed); optional include_24hr_change was treated as a second operation intent; rationale/result recall still drops frozen operation outcome.

176. gpt-5.6: While checking a CLI exit code under zsh, assigning to the conventional shell variable 'status' failed because zsh reserves it as read-only; use exit_code or capture the command status directly.

177. gpt-5.6: A search-only Answer request now correctly blocks operation effects and returns the frozen candidate, but the completion prose says the live lookup failed and exposes route_tool_forbidden semantics; project an intentional candidate-selection completion instead of provider-failure recovery copy.

178. gpt-5.6: Final git diff --check could not serve as a clean remediation gate because unrelated pre-existing planning/chat/answer diffs contain trailing whitespace and blank EOF lines; run a changed-path-scoped whitespace check or clean those diffs in their owning workstream.

179. cursor-auto: Adding one required field to AnswerRequestInterpretationSchema meant hand-editing eight duplicated interpretation literals across tests, eval, and the OpenRouter contract-server helper before typecheck went green. A shared test builder (e.g. answerInterpretation({...})) would make preflight schema evolution a one-line change.

180. cursor-auto: Remapping after product evolution: STATE.md, ARCHITECTURE.md, and wayfinder still describe gateway remediation and historical BAS framing while the live tree is dominated by Answer + operation market adapters; founders need a single CAPABILITY-MAP layering core vs proving-ground vs parked or they re-litigate what 'the product' is every session.

181. opus-5: Ran the release source gate while still editing files, so a failure I caused mid-run looked like a baseline failure. The gate writes to a log but has no notion of a pinned tree; a --require-clean flag would make it refuse to start on a dirty worktree.

182. opus-5: npm run test:ts-standards runs after test:release:unit in test:release:source:after-codegen, so three real TS violations sat undetected for the length of the x402 settlement work because an unrelated unit test was red first. Cheap static scans should run before slow suites.

183. opus-5: The react-doctor pre-commit hook rewrote convex/_generated/server.d.ts after staging, so the codegen landed one commit behind the schema change that caused it. The hook should re-stage files it rewrites, or fail loudly.

184. composer-2.5: Every git worktree starts without node_modules and the repo has no .cursor/worktrees.json, so each worktree-based task discovers this by hitting a failure and then hand-running npm ci (~18s). A worktrees.json with an npm ci setup command, or a documented symlink to the main checkout's node_modules, would remove the step.

185. opus-5: tests/unit/market-terminal/cli-errors.test.ts 'scopes valid command help' timed out at 30s once under a full tests/unit run, but passed 3/3 in isolation and in two later full runs. It spawns CLI processes with a 30s budget that is too tight under parallel full-suite load; a per-file testTimeout or reduced concurrency for that file would stop it costing a false RED and a differential investigation.

186. opus-5: Long-running `npm run dev:local` (14.7h) died with exit 1 after a single failed Convex telemetry POST to api.convex.dev/api/local_deployment/record_activity returning 500. A cloud activity-heartbeat failure shouldn't kill a local deployment dev loop; it should warn and retry.

187. opus-5: Wrote validator cards using 'grep -rn pattern path --include=*.ts'; zsh expands the unquoted glob before grep runs, so the check dies with 'no matches found' and returns no evidence. Repo guidance should point at rg (or quoted --include) for agent-authored scans.

188. opus-5: Orchestrating across git worktrees, a persistent shell kept its cwd inside a worker's worktree across turns, so a later commit and a papercut write landed in the wrong tree and dirtied an executor's workspace mid-task. Worktree-touching commands should use an explicit -C/working_directory rather than a sticky cd.

189. opus-5: Symlinking a git worktree's node_modules at the main checkout (the documented workaround for worktrees having no deps) breaks Convex component resolution: convex/projectSpine.test.ts fails 3/4 in the worktree and passes on main with identical content. Worktree gate runs silently cannot certify anything component-dependent.

190. opus-5: npm ci exits EUSAGE on main: package.json and package-lock.json are out of sync (~25 missing entries incl. gcp-metadata, @vercel/functions, jose, zod). Clean installs, CI, fresh clones and new worktrees all fail at install; needs an npm install to resync the lock.

191. gpt-5.6: While running research commands, every login shell emitted a missing ~/.cargo/env warning from ~/.zshenv; the stale source line adds noise to every tool result and should be guarded with a file-exists check.

192. gpt-5.6: While applying the Aecon vault update, an exact-context patch missed because the actively edited Hermes Brand System had changed between read and write; use narrower section anchors or re-read immediately before patching shared vault files.

193. gpt-5.6: Running repo research commands emits /Users/joelchan/.zshenv: no such file or directory for /Users/joelchan/.cargo/env on every shell invocation; the stale source line should be guarded or removed.

194. gpt-5.6: qmd result URIs normalize spaces to hyphens and are not literal filesystem paths; attempting to open the displayed URI failed until the real filename was found with find.

195. gpt-5.6: Spawning a typed GSD researcher with fork_turns=all failed because full-history forks inherit the parent agent type; the tool schema permits both fields but this combination is rejected only at runtime. Retrying with a bounded fork worked.

196. gpt-5.6: Google Trends blocked the direct comparison request with HTTP 429 and pytrends is not installed, so relative keyword volume could not be verified from Trends in this pass; autocomplete can establish query families but not volume.

197. gpt-5.6: While reading the grilling skill and inspecting the product workspace, every login shell printed a missing /Users/joelchan/.cargo/env error from .zshenv. Commands still run, but the stale shell startup reference adds noise and can obscure real failures.

198. gpt-5.6: While filing an Obsidian note, qmd returned a normalized resource path whose spaces/hyphens did not match the actual vault filename, causing the first direct read to fail. Search results should expose the exact filesystem path or clearly label normalized URIs.

199. gpt-5.6: While verifying an Obsidian qmd query, piping qmd output through head caused qmd to crash with an unhandled EPIPE after the consumer closed. The CLI should handle a closed stdout pipe without emitting a Node stack trace.

200. gpt-5.6: While spawning a research subagent with full-history inheritance, the orchestration API rejected an explicit default agent_type even though the requested type matched the parent. The schema permits the field but the runtime requires it omitted for full-history forks.

201. gpt-5.6: A second gsd-ai-researcher dispatch failed because full-history forks cannot specify a specialist role. The orchestration interface makes role selection and context inheritance appear independently selectable; it should reject this combination earlier or document that specialist agents require fork_turns none/limited.

202. gpt-5.6: Every login-shell command emits duplicate missing /Users/joelchan/.cargo/env warnings from .zshenv, adding noise to otherwise successful vault and verification commands; guard the source with a file-exists check.

203. Cursor Grok 4.6: Every zsh command prints '/Users/joelchan/.zshenv:.:1: no such file or directory: /Users/joelchan/.cargo/env' before real output — .zshenv sources a rustup file that is not installed, which pollutes git/gsd receipts.

204. Cursor Grok 4.6: gsd-map-codebase full refresh spawned four parallel generalPurpose mapper agents; all four failed immediately with resource_exhausted and wrote nothing. Sequential in-session mapping is the working fallback on this host.

205. grok-4.6: Bugbot product-tree retry wrapper summarized 'found no bugs' while the agent transcript contained two XML <bug> blocks (held charge on leased refuseBeforeClaim; search-only provider-failure copy). The completion notification dropped the findings; had to re-read the jsonl. Cause: wrapper/parser likely expects a different bug schema than the XML the agent wrote, especially when the original diff was docs-only.

206. Cursor Grok 4.6: Pre-commit React Doctor scanned the P5-b freeze commit (server/problem JSON, no React UI) and reported a staged regression warning that did not block git commit. False positive on non-React remainder cards.

207. Cursor Grok 4.6: Appending P5-c/P5-e receipts: StrReplace replace_all on the repeated remainder closer inserted the new sections after P1-fix-held-charge as well as P5-b and left a duplicate P5-b body. Unique context or a one-shot append is safer than replace_all on formulaic receipt closers.

208. grok-4.6: npx convex codegen tried to deploy to local 127.0.0.1:3210 and failed DeploymentNotConfiguredForNodeActions; had to hand-edit convex/_generated/api.d.ts so internal.moneyX402PaymentAttempts typechecked. Fix: CONVEX_AGENT_MODE=anonymous or codegen without start_push.

209. grok-4.6: P6-freeze-gaps commit: React Doctor flagged pre-existing dynamic import of work-tree.functions in human-root.functions.ts (routeTree client-bundle isolation). False positive for this card; commit still landed.

210. Cursor Grok 4.6: Hashing P6 empty table digests: node register('tsx/esm') fails with 'tsx must be loaded with --import instead of --loader' on Node 25; use node --import tsx.

211. grok-4.6: Local convex dev --once on Node 25 failed DeploymentNotConfiguredForNodeActions; nvm use 22 (v22.22.0) is required for this project's use node actions. Node 25 is the shell default.
