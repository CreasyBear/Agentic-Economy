# Phase 2 Registered-Runtime Dominance Proof Mechanisms

**Status:** bounded primary-source research; implementation decision support only

**Date:** 2026-08-26

**Scope:** the finite Phase 2 authority inventory and its frozen 39 HTTP, 14 MCP, and 12 CLI edge surfaces. This note does not change the frozen contract or authorize a new authority model, test-only path, or bespoke runtime harness.

## Decision

CodeQL is not an option for this repository. The repository is public but has `licenseInfo: null`, contains no `LICENSE`, and has no evidenced paid GitHub Code Security entitlement. The CodeQL CLI license permits CI analysis of an open-source codebase hosted on GitHub.com, while other automated analysis requires the applicable commercial entitlement ([CodeQL CLI license](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md)). Do not download, install, or run CodeQL, and do not make the Phase 2 gate conditional on future CodeQL availability.

The finite proof can be made **architectural at supported registration seams**, but not across the whole current program without migration. The exact minimum is:

1. **Migrate every protected authority entry to an established framework wrapper/middleware seam** that necessarily executes the existing canonical Principal + Account resolver before the registered handler. The currently confirmed lower bound is 298 direct raw Convex registrations across 52 unique files; alias/factory forms still require parser-and-symbol resolution before the migration scope is complete. The wrappers are registration adapters only: they must call the existing canonical authority implementation unchanged, not create a second auth helper, accept caller-shaped provenance, or alter commercial behavior.
2. **Use a pinned, narrow local ESLint rule set** to prove only syntactic registration closure and intrafunction ordering: raw builders/registrars are absent outside approved registration modules, every protected registration uses the correct wrapper/middleware, and no declared consequence primitive occurs in the wrapper's own pre-authority code path. ESLint cannot prove imported or interprocedural behavior.
3. **Drive every actual registered handler through existing runtime harnesses.** Use the installed `convex-test` fixture and the `convex-verify` seed → multi-identity drive → positive/negative assert workflow for Convex functions, HTTP actions, and scheduled targets; use the existing built Start server/release harness for Start routes and server functions; send real MCP protocol requests through `/mcp`; and run the packaged CLI as a subprocess against those same server endpoints. No direct implementation-handler substitute, production export added for tests, dependency-injection branch, or new bespoke harness qualifies.
4. **Retain a machine-readable join** from every finite surface to registration seam, exact runtime handler, canonical authority mode, consequence class, and runtime test cases. Any missing, duplicate, dynamically unresolved, or unexercised row is red.

This combination can prove entry dominance only where the framework makes the wrapper unavoidable and the handler contains all subsequent surface-specific work. It does not prove consequence-time authority after a delay or across an external effect. Those paths need another existing registered authority boundary immediately before the effect and actual-handler evidence; otherwise they remain red.

Semgrep Community Edition is an optional independent syntax check, not part of the minimum. Commander can improve CLI dispatch structure, but a CLI is an untrusted client and cannot establish server-side authority. Neither closes a missing server boundary.

## Current-source feasibility snapshot

The read-only source snapshot on 2026-08-26 shows:

- `convex` 1.45.0, `convex-helpers` 0.1.123, `convex-test` 0.0.56, Vitest 4.1.9, TypeScript 5.9.3, `@tanstack/react-start` 1.168.26, and `@modelcontextprotocol/sdk` 1.30.0 are installed. The lock resolves TanStack Start core packages separately (`@tanstack/start-client-core` 1.170.12 and `@tanstack/start-server-core` 1.169.15), so CI must retain the exact lockfile rather than infer behavior from the facade version alone.
- The **direct syntax migration inventory is currently a lower bound of 298 raw Convex registrations across 52 unique files**. It consists of 208 ordinary builders (query 29, mutation 34, action 10, internalQuery 35, internalMutation 81, internalAction 18, httpAction 1) and 90 `*Generic` builders across another 12 files (queryGeneric 23, mutationGeneric 23, internalQueryGeneric 18, internalMutationGeneric 20, httpActionGeneric 6). Five typed ordinary declarations were missed by an earlier text-pattern count (`agentAccessPolicy` register/revoke, `marketRegistryGraduation` run/sweep, and `capabilitySupplyReadiness` probe), and the entire Generic family was then missed. The complete migration inventory must therefore parse TypeScript, resolve imported/aliased builder symbols, and enumerate factory-produced registrations; regex/callee-name counting is not acceptable. Until that resolution closes, 298 is not a completeness claim.
- The **runtime candidate inventory is a different namespace**: 47 Start server functions, 119 public Convex exports, seven Convex HTTP actions and seven route rows, 10 crons, and 52 background-family rows. These are the 242 runtime rows: 207 protected and 35 exemptions. Syntax declarations cannot stand in for runtime rows; the retained join must reconcile the 298-or-more declarations, aliases, and factories to each actual runtime surface without dropping either inventory. The one ordinary `httpAction` plus six `httpActionGeneric` declarations versus seven runtime action/route rows is a concrete example of why the namespaces must be joined rather than compared as a single count.
- The existing authority map currently reports 207 protected rows proved and zero red under `ordered_recursive_authority_dominance:v1`. That result does not satisfy this revised mechanism decision: the syntax namespace is incomplete, the verdict depends on the superseded hand-built interprocedural analyzer, and actual registered-handler coverage is not complete. For the architectural migration gate, all 207 protected rows are unproven/red until parser-and-symbol closure, wrapper/middleware closure, and actual-handler evidence are joined. This research conclusion does not itself mutate the contract ledger.
- No source file currently imports `convex-helpers/server/customFunctions`.
- None of the 47 `createServerFn` declarations attaches documented server-function middleware. `src/start.ts` has global request middleware for correlation, request safety, observability, headers, content negotiation, CSRF, source-write admission, and Clerk, but no Phase 2 canonical Principal + Account function middleware.
- No file route currently declares TanStack route-level or method-level `middleware`. Global authentication/request processing is not resource/account authorization.
- MCP has one `registerTool` call site, inside the central `createAeMcpServer` action loop. This is a strong existing seam, but the loop performs gateway admission and then delegates to `action.run`; it does not by itself prove each delegated consequence-time boundary.
- The CLI uses a central local command map and custom parser. Commander 14.0.2 is present only transitively, not as a declared dependency. ESLint and `@typescript-eslint/parser` are not direct dependencies, and Semgrep CE is not installed.

These are feasibility facts, not green evidence. The current architecture has not yet established wrapper closure.

## Established framework seams

### Convex queries, mutations, and actions

Convex recommends checking authorization at the beginning of every public function ([Convex authentication and authorization](https://docs.convex.dev/auth/overview)). The installed `convex-helpers` package exposes `customQuery`, `customMutation`, `customAction`, `customCtx`, and `customCtxAndArgs`; its documented purpose includes running authentication before a request and adding checked values to context ([official package README](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md), [official custom-functions source](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts)). Version 0.1.123's installed source invokes the customization input, waits for it, constructs the derived context/arguments, and only then calls the user handler. The same builders accept public or internal query/mutation/action builders.

That order can make authority structurally dominate the handler if all of the following hold:

- each protected public/internal function is constructed only through the correct custom builder;
- the customization calls an existing canonical interactive, agent, signed-callback, or workload resolver and returns its checked Principal + Account context;
- the customization itself performs no declared consequence before successful resolution;
- the handler cannot fall back to caller-supplied principal/account/provenance arguments;
- raw Convex builders are forbidden outside a small reviewed registration module;
- public/non-consequential builders are separate and can never construct a protected function.

This is an entry adapter, not a new auth helper. It must not use `getAuthUserId`, row-level security, or a new membership model in place of the frozen canonical authority semantics. `convex-helpers` row-level security can control document access, but it does not encode the program's generation-bound delegation, current-time authority, account context, signed callbacks, or workload provenance and therefore is not a substitute.

The migration blast radius is high: at least 298 direct builder sites in 52 unique files, plus any resolved alias/factory registrations, generated API identity/type changes, background target registrations, and direct tests. It is nevertheless an authority-entry architecture migration, not a checker patch. Preserve handler arguments, return values, transaction boundaries, retries, scheduling, money/chat/market behavior, and public function names.

**Limit:** custom functions establish order only at function entry. Convex actions can run for minutes and perform external effects; an entry snapshot can expire before the effect. The wrapper cannot prove current server-time authority at that later consequence point. Such actions must call an existing canonical consequence boundary immediately before the effect or remain red.

### Convex HTTP actions

Convex 1.45.0 registers `httpAction` handlers through `httpRouter.route`; HTTP actions may have side effects and are not automatically retried ([HTTP actions](https://docs.convex.dev/functions/http-actions)). The native router API exposes a route handler, not a documented route-middleware chain. `convex-helpers` custom query/mutation/action builders do not wrap `httpAction`.

Therefore the six protected Convex HTTP routes cannot receive architectural entry proof merely by migrating regular Convex builders. They remain red unless each registered `httpAction` is reduced to a thin, locally checkable adapter that performs the existing signed callback/workload/agent authority boundary before any body-dependent consequence and then delegates, and the actual route is invoked with `convex-test` `t.fetch`. A new generic HTTP auth helper or alternate test handler is prohibited. Migrating the router to another framework solely for evidence would materially broaden the blast radius and is not the minimum.

### Scheduled functions, crons, workers, jobs, and continuations

Convex crons register a named public/internal mutation or action by function reference ([cron jobs](https://docs.convex.dev/scheduling/cron-jobs)). Scheduled functions are durable, but auth is explicitly **not propagated** from the scheduling caller to the scheduled target; required authority information must be passed and rechecked ([scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions#auth)). Scheduling from mutations is atomic with the mutation, while scheduling from actions is not atomic and can survive a later action failure ([scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)).

Custom internal builders can structurally guard a registered target. They do not prove the scheduling call was authorized, that a durable envelope is authentic/current, or that a delayed target revalidates generation/expiry before its consequence. Each source and each target therefore needs its own registered wrapper, an existing durable workload authority record rather than caller-shaped fields, and actual scheduled execution. `convex-test` supports fake time and finishing scheduled functions, but does not execute crons automatically; cron targets must be triggered directly ([convex-test scheduled functions and limitations](https://docs.convex.dev/testing/convex-test)).

### TanStack Start server functions and routes

TanStack Start's documented middleware is next-able: server middleware runs before nested middleware and the final handler, and withholding `next()` short-circuits execution ([middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)). `createServerFn().middleware([...]).handler(...)` is the documented server-function seam, and route-level or method-level `middleware` runs before route handlers ([server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions), [server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)). The official guidance says to authorize every private server function/route at the endpoint; UI route guards are not the data boundary ([authentication overview](https://tanstack.com/start/latest/docs/framework/react/guide/authentication-overview)).

This can structurally dominate all code inside a Start handler if a protected handler attaches middleware that calls the existing canonical authority boundary and only calls `next()` with server-derived Principal + Account context after success. Client-sent middleware context is not trusted; TanStack explicitly warns to derive the session from a server-trusted source ([middleware security guidance](https://tanstack.com/start/latest/docs/framework/react/guide/middleware#client-sent-context-security)).

Global request middleware may establish request hygiene or a server session, but the protected/public mix and resource-specific policies make a universal global allow/deny decision unsafe. Use documented per-function/per-route middleware with fixed authority modes. A project registration adapter may compose the framework middleware with the existing canonical resolver, but it must not implement new authority semantics. Actual built-server requests must prove the transformed runtime registration; importing an untransformed handler in Vitest is insufficient.

### Clerk-backed Start identity feasibility

The installed Clerk TanStack router SDK is `@clerk/tanstack-react-start` 1.4.9 (`@clerk/backend` resolves to 3.8.5); `@clerk/testing` is not installed. The routed `clerk-tanstack-patterns` and `clerk-testing` skills are also unavailable, recorded separately as AE-PAP-017. The installed middleware accepts `jwtKey`, and Clerk documents that option as verifying an **existing Clerk session token** without a network key lookup ([`clerkMiddleware()`](https://clerk.com/docs/reference/tanstack-react-start/clerk-middleware)). It is verification input, not an official local session-token issuer or test-identity factory.

There is no documented hermetic, multi-identity path that drives unmodified production `clerkMiddleware` through the built Start server and then into local Convex. Clerk's supported Playwright route installs `@clerk/testing`, requires a development Clerk instance plus publishable and secret keys, and has `clerkSetup()` obtain a short-lived Testing Token; `clerk.signIn({ emailAddress })` creates a server-side token through Clerk's Backend API ([Playwright setup](https://clerk.com/docs/guides/development/testing/playwright/overview), [Playwright test helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers)). Those are supported real-identity tests, but they are service-backed rather than hermetic.

The Convex token hop is likewise not locally mintable through the installed production API. `SignedInAuthObject.getToken` is typed as `ServerGetToken`; the installed implementation delegates a requested template to `apiClient.sessions.getToken`. Clerk documents that call as a Backend API `POST /sessions/{session_id}/tokens/{template_name}` and requires the named template to be configured in the Clerk Dashboard ([session `getToken()`](https://clerk.com/docs/reference/backend/sessions/get-token), [JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates)). Thus `auth().getToken({ template: 'convex' })` requires Clerk service state even when `jwtKey` makes the incoming-token signature verification networkless. Clerk's Convex integration additionally requires an activated Clerk integration and configured issuer before Convex exposes verified claims ([Clerk–Convex integration](https://clerk.com/docs/guides/development/integrations/databases/convex)).

The evidence split cannot be applied yet because the current built dispatcher has a concrete **source/build defect**. From a clean candidate build, resolve the generated Vercel Node handler from `.vercel/output/functions/__server.func/.vc-config.json`, launch that handler, and request `GET /_serverFn/<full-generated-manifest-id>` with `x-tsr-serverFn: true`. The observed request fails before dispatch with HTTP 500, `ReferenceError: setErrorThrowerOptions is not defined`, at generated `_ssr/dist-CgNYPbvv.mjs:205`: the generated file calls the symbol without importing it, while the definition is in a separate generated Clerk chunk. Content hashes may change, so the regression artifact must retain the exact candidate, full manifest ID, `.vc-config` entrypoint, generated chunk/import evidence, request, and response from each run. This is not hosted-evidence debt; it blocks source acceptance until the built handler loads and the exact probe is regression-gated.

After that defect is fixed, the smallest supported evidence split is:

- **Credential-free source gate:** the generated built dispatcher loads; production `clerkMiddleware` remains present and ordered; protected requests with no token or an invalid token fail closed through the actual built dispatcher; request headers, body, and arguments cannot supply canonical Principal, Account, or provenance; every protected Start handler is attached to its fixed documented authority seam; and owner/member/workload/wrong-Account/stale-generation cases below Clerk verification execute through actual local Convex references. This proves the source-controlled middleware structure, negative boundary, and canonical local authorization behavior. It does not prove positive Clerk identity issuance or a real Clerk-to-Convex template token.
- **Hosted positive identity chain:** the later hosted security/production evidence gate—concretely P9-01 security/resilience/revision proof—owns genuine multi-identity Clerk evidence. Pin `@clerk/testing`, use a dedicated development Clerk instance and distinct owner/member/stranger identities, drive the built Start server through production `clerkMiddleware`, configure the Clerk Dashboard `convex` template/integration, and allow the documented Backend API token call. The evidence record must name its operator/CI owner; identify the development instance and non-secret configuration; pin the testing package and template/issuer/audience setup; bind the exact source candidate commit to the exact deployed revision/build digest; record the tested opaque Clerk identity and canonical Account bindings; and record token issue/expiry times plus evidence collection time. It is stale and must be rerun when the candidate/deployed revision differs, the Clerk/Convex configuration or identity bindings change, or the tested sessions expire.
- **Hermetic Convex boundary:** retain `convex-test.withIdentity` execution through actual registered Convex references for the seven denial/isolation shapes. It proves the local Convex authority boundary only; it does not prove Clerk issuance, Start middleware, or the Start-to-Convex token hop.

Internal `signJwt`, fake-Clerk identity, or a local auth bypass would test a different boundary and is ineligible. No new authentication helper or bespoke harness closes the positive-identity gap. The present `setErrorThrowerOptions` failure is source-red. Once it and every other source invariant pass, `SOURCE_ACCEPTED_EVIDENCE_OPEN` is supportable only when the genuine Clerk-issued session plus `convex` template-token run is the sole remaining Clerk item and is explicitly open at the hosted gate; it is not supportable while any dispatcher, middleware-order, fail-closed, caller-shaped-context, fixed-seam, or local canonical-authority invariant remains unproved.

### MCP SDK and existing action registry

The MCP TypeScript SDK 1.30.0 documents `McpServer.registerTool(name, config, handler)` with schema validation and a tool callback ([official server documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)). Its installed source keeps a registered-tool table, validates input, and invokes the registered callback from the central `tools/call` request handler ([official 1.30.0 SDK source](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.30.0/src/server/mcp.ts)). It does not expose a documented general tool-authorization middleware facility.

The project's single existing `registerTool` loop is therefore the correct architectural seam: select/admit the action first, then register a callback that receives only the server-derived authority context. A narrow rule can forbid any second `registerTool` site and require the callback shape. This proves MCP-entry ordering, not the behavior of `action.run` or a downstream HTTP/Convex consequence. All 14 tools still require real protocol requests through the registered `/mcp` route, including the seven denial shapes for protected tools and positive public-read behavior.

### CLI parser and dispatcher

Commander 14 provides command/action registration and `preAction` hooks that run before an action handler, including nested subcommands ([official Commander documentation](https://github.com/tj/commander.js/tree/v14.0.2#life-cycle-hooks)). If adopted as a direct pinned dependency, `parseAsync()` plus a root `preAction` hook could make local credential-origin and option validation structurally precede each command runner.

That would not prove Phase 2 authority: the CLI and its environment are caller-controlled. Principal, Account, resource, generation, expiry, and provenance must be resolved again at the server consequence boundary. The current central command map already provides a bounded dispatch seam, and adding Commander solely for evidence would create parser/output compatibility risk without closing the gate. Keep the 12 CLI commands as actual packaged subprocess tests mapped to proven HTTP/MCP endpoints; do not count a CLI hook as authority.

## What bounded local analysis can prove

### ESLint

ESLint exposes one code path per function/global scope, reachable segments, branches, returns, throws, and traversal suitable for checking whether a call occurs on every path within that function ([code-path analysis](https://eslint.org/docs/latest/extend/code-path-analysis)). It is intrafunction evidence, not import resolution or an interprocedural call graph.

If adopted, pin `eslint` 10.9.0 and `@typescript-eslint/parser` 8.68.0 in the lockfile. Their official registry metadata supports Node 22.22.0 and TypeScript 5.9.3 ([ESLint 10.9.0 metadata](https://registry.npmjs.org/eslint/10.9.0), [TypeScript ESLint parser 8.68.0 metadata](https://registry.npmjs.org/@typescript-eslint%2fparser/8.68.0)). The repository currently has neither as a direct dependency, so this adds installation and CI time.

Restrict the rule set to these decidable properties:

- raw Convex builders are imported/used only in approved registration modules;
- every protected Convex declaration uses the expected custom builder and every exempt declaration uses an explicit exempt builder;
- every protected Start server function/route attaches the expected middleware before `.handler`;
- `registerTool` exists only at the central MCP loop;
- within each registration adapter or middleware function, all paths to `next()`/the user handler follow the canonical boundary, and declared local consequence calls do not occur first;
- a TypeScript parser and symbol resolver accounts for ordinary, `*Generic`, imported-alias, and factory-produced registrations, and those syntax keys reconcile to the separate runtime surface inventory through the retained join.

Do not make ESLint resolve imports, infer dynamic callees, or prove consequences inside delegated functions. That would recreate the prohibited general analyzer. Hostile rule fixtures must include early return, alternate branch, `catch`/`finally`, alias registrar, second registration site, pre-boundary scheduler/fetch/write, and a safe all-path wrapper.

### Semgrep Community Edition

Semgrep CE can independently ban raw registrars, require literal wrapper shapes, extract finite registrations, and detect declared local dangerous calls. Its official documentation limits propagation to a file and says only proprietary Semgrep performs interfile analysis ([glossary](https://semgrep.dev/docs/writing-rules/glossary), [CE philosophy](https://semgrep.dev/docs/contributing/semgrep-philosophy)). Intraprocedural taint requires explicit propagators; it cannot infer imported function behavior.

Semgrep CE is LGPL-2.1 and can run locally without login, via its official container or `pipx`/`uv` installation ([official repository](https://github.com/semgrep/semgrep), [CI installation](https://semgrep.dev/docs/semgrep-ci/sample-ci-configs)). It is not installed here. Use it only as an optional independent syntax-policy check with a pinned container digest/version. It cannot replace ESLint code-path evidence or actual-handler tests, and no join/interfile mode qualifies as CE proof.

## Actual registered-handler evidence

The installed `convex-test` 0.0.56 can call public/internal queries, mutations, and actions through generated references, attach identities with `withIdentity`, invoke registered HTTP routes with `t.fetch`, and run scheduled chains under fake time ([official guide](https://docs.convex.dev/testing/convex-test)). The project's existing fixture imports the actual Convex module registry and schema. Follow the local `convex-verify` workflow: seed both same-account and other-account data through app functions where possible; drive owner, member, workload, missing workload, stranger, wrong account, and stale generation; assert positive behavior, denial, data isolation, and absence of durable/external effects.

`convex-test` is a mock backend: it differs in limits, runtime built-ins, IDs, search behavior, and cron support ([limitations](https://docs.convex.dev/testing/convex-test#limitations)). Use the existing local Convex backend/release jobs for a smaller parity set of platform-sensitive, scheduled, HTTP, and external-effect boundaries; do not replace the complete deterministic matrix with representatives.

For non-Convex families:

- invoke all 39 registered HTTP routes through the built Start server, not imported route functions;
- invoke all 14 MCP tools as protocol requests through `/mcp`, not `action.run` directly;
- invoke all 12 commands through the built/package-tested CLI subprocess against those same endpoints;
- invoke Start server functions through their transformed runtime endpoint or existing application flow, not a source-level mock of `createServerFn`;
- preserve exact authorized commercial/chat/market outputs and assert denied attempts produce no duplicate or partial effect.

An equivalence group is allowed only when the framework registry itself points each surface to the identical wrapped handler object and there is no registration-specific code before that object. Shared downstream behavior is not enough.

## Families that remain red without further architecture

The following do not obtain proof from the established seams alone and must remain red until the stated condition is met:

1. **All currently raw Convex entries:** 98 protected public Convex exports plus protected internal/background targets within the 298-or-more registration migration across at least 52 unique files. Every row remains red until parser/symbol inventory closure (including `*Generic`, aliases, and factories), custom-builder closure, narrow lint, and actual registered-reference tests all pass.
2. **All 38 protected Start server functions and protected Start HTTP routes:** current code has no per-entry authority middleware. Global Clerk/source-write middleware is not canonical resource/account authority. Each remains red until its documented middleware and built-runtime request test exist.
3. **Six protected Convex HTTP routes:** native `httpRouter` has no documented middleware and `convex-helpers` custom functions do not wrap `httpAction`. The five provider-consequence callbacks, secret-lifecycle callback, and their route registrations remain red until each thin registered adapter proves authority before body-dependent consequences and passes `t.fetch` hostility tests.
4. **Stripe webhook callback:** signature verification and account attribution must precede ledger effects through the actual Start route. Generic Start session middleware does not prove signed-callback provenance.
5. **Ten crons and 49 protected background rows:** specifically seven callbacks, two continuations, 18 consequential jobs, 14 consequential reconciliations, and eight workers. Auth does not propagate through Convex scheduling. Each source/target pair remains red until a durable canonical workload envelope is revalidated at the registered target and scheduled execution proves denial/no effect.
6. **External-effect and time-separated chains:** provider invocation/JIT secret boundary, x402 payment, payout/Stripe effects, connection cleanup, supplier settlement, workpool completion, and ambiguity/reconciliation paths. Entry middleware cannot prove current-time authority immediately before fetch, secret release, payment, write, retry, or pointer advance. Each needs an existing canonical consequence boundary at the effect or remains red.
7. **Reconciliation/domain aliases not themselves framework registrations:** a label mapping to a downstream registered function does not prove every caller or pre-call path. It remains red unless the alias is removed from the measured surface, becomes an actual wrapped registration, or every runtime registration that reaches it is independently proven and tested without a pre-call consequence.
8. **The 14 MCP tools:** the single registry loop can prove entry admission, but protected tools remain red until their exact registered callbacks and downstream consequence boundaries pass all seven cases. A tool-list filter or representative action test is insufficient.
9. **The 12 CLI commands:** CLI dispatch can never own authority. Protected/interactive commands remain red until packaged subprocess tests show they reach the exact proven server handlers; public commands still need tested exemptions.
10. **Public/non-consequential exemptions that delegate across files:** a syntax label cannot prove absence of downstream effects. Each of the 35 exemptions needs actual behavior and must either rely on a runtime-enforced read-only function class (for example, a Convex query) or remain red.

## CI, licensing, and blast-radius implications

- **CodeQL:** ineligible; zero install/run path.
- **Convex wrappers:** no new package (`convex-helpers` 0.1.123 is installed), but the migration is already at least 298 direct builders/52 unique files before alias/factory closure and touches generated API/type identity. Run codegen, typecheck, all focused authority tests, exact release, and parser-and-symbol-aware byte/count inventory regeneration.
- **TanStack middleware:** no new package, but 38 protected server functions plus protected routes need explicit middleware composition. Retain the exact lockfile because facade/core versions differ. Verify through the built runtime.
- **MCP:** no new package and one existing registration loop. Pin SDK 1.30.0; changing registration/callback composition requires all 14 protocol tests.
- **CLI:** do not add Commander solely for proof. If product reasons later justify it, declare/pin it directly and run byte/semantic compatibility for help, JSON, exit codes, stdout/stderr, and all 12 commands.
- **ESLint:** MIT; two new direct dev dependencies and a narrow custom rule/fixture suite. It is the only recommended new local checker because its documented code-path API proves the required intrafunction ordering without a general analyzer.
- **Semgrep CE:** LGPL-2.1, optional external binary/container, no login required. Pin image digest/version if used; never claim interfile proof.
- **Runtime:** `convex-test` and existing test infrastructure are already installed. The complete per-surface matrix will be the dominant CI cost. Local-backend/built-server parity is smaller but mandatory for platform-sensitive families.

## Exact acceptance rule

Phase 2 can pass this proof gate only when:

- a parser-and-symbol inventory resolves every ordinary, `*Generic`, alias, and factory-produced Convex registration; the machine-readable join then contains every resolved syntax registration, every measured runtime row, and every frozen HTTP/MCP/CLI surface, with exact reviewed counts and no silent omission;
- all protected registered entries use an established unavoidable wrapper/middleware that calls the unchanged canonical Principal + Account authority path before the handler;
- the narrow ESLint checks and hostile rule fixtures pass without claiming interprocedural proof;
- every protected surface executes all seven cases through its actual registered runtime handler, every exemption is behaviorally tested, and denied cases have no effect;
- every delayed/background/external consequence revalidates current authority at its own registered consequence point;
- every family listed red above has either obtained the stated architectural/runtime evidence or remains explicitly red.

The defensible minimum is therefore **established framework entry wrappers + bounded ESLint intrafunction/registration checks + complete actual-handler runtime tests + smaller real-runtime parity**, with the current canonical authority semantics unchanged. It is not CodeQL, a new auth framework, a general hand-written analyzer, a sink-representative suite, or a bespoke test harness.
