# Public surface inventory

`public-surface-inventory.json` is the Phase 0 machine-readable inventory of
implemented public machine contracts. Each HTTP route, MCP tool, and dispatched
CLI command has exactly one owning bounded context.

## Inventory boundary

- TanStack route modules count when they declare server `handlers` and do real
  work. The wildcard `src/routes/api.$.ts` 404 sentinel is recorded as excluded
  infrastructure rather than represented as a callable contract.
- The independently hosted Convex HTTP router is inventoried separately from
  the TanStack edge routes.
- Browser pages and server functions are not public machine contracts. Their
  backing public HTTP handler is inventoried when one exists.
- MCP tools come from the central action registry. Tool names are the
  deterministic `ae_` projection of action IDs.
- CLI entries are the root commands actually dispatched by `tools/ae/cli.ts`,
  not stale command examples or an action merely declaring a `cli` surface.
- `plannedNotImplemented` records frozen maturity-plan contracts without
  pretending they exist in the current source.

## Canonical invocation

`operation.invoke:v1` is served at `POST /api/v1/operations/call`. There is no
public `/api/v1/operations/execute` HTTP contract. The similarly named
`operation.execute` contract is an anonymous MCP-only read operation and is not
an alternate paid HTTP gateway.

The executable leaf test prevents a new route module, Convex HTTP route, MCP
tool, or CLI root command from being added without assigning it an owner here.
