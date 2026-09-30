# Convex root standard

Status: standing rule. Executable fences live in `npm run check`.

## Purpose

A Convex root is a registration file. The next change should touch one concern file, plus the root only when a signature changes.

| Property | Rule | Check |
| --- | --- | --- |
| Locality | One concern per lib file. The root changes only when a registration signature changes. | Review |
| Findability | From the RPC name to the handler body is at most two hops. No barrels. | Review |
| Direction | `src/` never imports `convex/*.ts`. `convex/lib` may import `src/modules`. `src/modules` may import `convex/lib` only for ctx-bound helpers. | `test:imports` |
| Identity | Surviving `api.<root>.<fn>` and `internal.<root>.<fn>` module, method and kind stay the same. | `tests/imports/convex-api-kind-snapshot.test.ts` and `tests/imports/convex-string-reference-ratchet.test.ts` |
| Paths | Convex paths are camelCase. Hyphens are rejected. | `tests/imports/convex-module-paths.test.ts` |
| Returns | Every query, mutation and action declares `returns`. | `tests/imports/convex-registration-returns.test.ts` |
| Size | No maintained `src/` or `convex/` file exceeds 1,000 lines. | `tests/imports/file-size-ceiling.test.ts` |

## The standard

The reference is `convex/capabilityQuotes.ts`: registrations in the root, depth in `convex/lib/`, one concern per file.

1. **Registration only.** Imports plus `query`, `mutation`, `action` and `http` exports. Handler bodies, validator unions and database logic live in lib.
2. **Depth in `convex/lib/<domain>/<feature>/`.** Group by concern, not by everything a feature touches.
3. **`src/` does not import the root.** Use the domain module or a lib helper.
4. **One core, many callers.** HTTP, MCP and chat share the core. Do not copy admission, command building or parsing.
5. **Execution boundary.** Call helpers directly inside a query or mutation so the work stays one transaction. `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction` and scheduler calls target internal functions only. Every registration declares `returns`. A handler that calls `ctx.run*` declares its return type, so generated API inference stays finite.

## Layout

- **Domain** is the module that owns the feature's primary table. Folder names match module names in camelCase. A workflow that also writes another module's tables stays in its primary domain and uses that domain's helper where one exists.
- **Feature** is `convex/lib/<domain>/<feature>/`, at most two levels deep.
- **Contracts.** `contracts.ts` holds validators and inferred types shared by two or more files in that feature. Other files name one concern and colocate a test when the concern needs one.
- **RPC symbols.** `<rpcName>Args`, `<rpcName>Result`, `<rpcName>Handler`, registered as `export const x = mutation({ args: xArgs, returns: xResult, handler: xHandler })`.
- **No hyphenated paths and no `index.ts` barrels.** Import the concern file.
- **No loose files under `convex/lib/`.** Cross-domain infrastructure goes in `convex/lib/platform/`. `adminConsole/` stays top-level because the operator console spans domains.
- **Dev and seed roots** keep fixture data separate from registration.

## Changing a root

Delete a proved-dead RPC before moving code. Operator and break-glass entries are not dead merely because the repository has no caller. A structural move does not change behaviour. Surviving RPC paths stay byte-identical; update the API snapshot only after a proved deletion. Do not edit `convex/_generated` by hand.
