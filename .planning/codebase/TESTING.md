# Testing

## Deterministic local gates

All commands below exist in `package.json`.

```sh
npm run test:chat:conformance   # five tools, Agent, anonymous/durable/share/UI
npm run test:conformance        # retained invocation, supply, recovery, payment
npm run test:unit
npm run test:integration
npm run test:imports
npm run test:types
npm run test:ts-standards
npm run test:seo
npm run test:ui-contract
npm run test:e2e
npm run test:e2e:a11y
npm run test:e2e:paid-operation
npm run test:cli-package
npm run parity:check
npm run check:convex-codegen
npm run build
```

`npm run test:release:source` composes deployment-manifest validation,
Operation conformance, chat conformance, normal Convex generation, dry-run
codegen verification, lint, typecheck, unit/integration/static/browser/a11y/paid
Operation checks, CLI packaging, and production build.

## Chat proof

`test:chat:conformance` covers:

- exactly five chat tool IDs and absence of invoke/payment/supply tools;
- canonical input/output validation, sanitization, and 64 KiB output bound;
- four generation steps, four tool calls, one execute;
- existing keyless and SSRF-safe execution seams;
- anonymous body/proxy/admission/no-persistence behavior;
- durable owner isolation, pagination, title/search, busy/stale admission;
- Agent message streaming, share/revoke/delete, and compact public projection;
- thin transcript/composer and typed Operation cards;
- route/provider boundaries for `/t`, `/s`, and anonymous chat.

Convex tests register components through `agentTest.register` in
`tests/helpers/convex-fixtures.ts`. Model-shaped tests use Agent `mockModel`, so
routine source proof requires neither OpenRouter credentials nor live network.

Representative suites:

- `tests/unit/chat/operation-chat-agent-tools.test.ts`
- `tests/unit/chat/anonymous-chat-boundary.test.ts`
- `tests/integration/chat-anonymous-transport.test.ts`
- `tests/integration/chat-thread-metadata.test.ts`
- `tests/integration/chat-durable-messaging-share.test.ts`
- `tests/unit/operation-chat-ui/operation-chat.test.tsx`

## Retained product proof

- `test:conformance` protects the durable invocation kernel, keyless/provider
  transports, recovery, payment reconciliation, and capability supply.
- `parity:check` validates the Operation programme across HTTP/MCP/CLI and
  rejects discovery of services compatibility, anonymous chat, or old answer
  surfaces as authority.
- `test:cli-package` rebuilds and exercises `packages/cli/dist/ae.js`.
- `smoke:gateway:production` is the opt-in consequential production smoke.
- Browser and accessibility suites cover catalogue/chat journeys; the paid
  Operation suite remains a distinct proof class.

## External evidence gates

Local deterministic success is not deployed proof. Keep these separate:

- `npm run smoke:chat:staging` needs an exact deployed revision, hosted base URL,
  and private owner browser storage state. It validates real anonymous HTTP
  streaming and signed-in/share behavior.
- `npm run smoke:gateway:production` may move money and needs explicit spend
  confirmation, exact deployment identity, production credentials, and receipt
  validation.
- Production K1 drain observation, rollback export, Release A/B deployment, and
  eleven table deletions are human operational evidence, not test fixtures.

Never label mocks, local fixtures, retained captures, or a source commit as
staging/production proof.

## Test placement

- `tests/unit/`: pure contracts, routes, UI, adapters, CLI formatting.
- `tests/integration/`: Convex/component and cross-module flows.
- `tests/e2e/`: browser journeys; `tests/e2e/a11y/`: accessibility.
- `tests/deploy-smoke/`: hosted exact-revision checks.
- `tests/imports/`: architecture and dependency boundaries.
- `tests/seo/`: machine discovery and metadata.
- `eval/parity/`: retained cross-surface Operation programme.

Use exact contract assertions and negative authorization/isolation cases. Mock
network/provider boundaries, not the domain behavior under test. Generated
files are verified after normal generators run; they are never hand-edited.
