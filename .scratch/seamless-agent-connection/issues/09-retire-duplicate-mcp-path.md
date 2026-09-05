# Decide the duplicate MCP path disposition

Type: grilling
Status: resolved
Blocked by: 05

## Question

Should the legacy `ae connect --mcp` path—which writes a generic bearer-bearing import file—be removed in favor of the existing pinned `add-mcp` client-specific path, or retained temporarily for explicit compatibility evidence?

The selected familiar journey uses `add-mcp` as the sole setup owner. Removing `--mcp` simplifies the product but changes a public CLI flag; retaining it keeps two implementations alive. Resolve from current usage/tests and Joel's compatibility tolerance before prototyping or implementation.

## Answer

Remove `ae connect --mcp` and the generic `~/.config/ae/mcp.json` import-file path. The pinned, client-specific `add-mcp` integration is the sole supported MCP configuration owner.

Joel explicitly approved the public CLI change. No compatibility shim or hidden second path will remain.

### Removal boundary

- Remove the `--mcp` CLI option, parsing, usage copy and `import_required` result branch.
- Remove `storeMcpConnection`, the generic MCP config path and bearer-token duplication.
- Remove supplier guidance that points back to `ae connect --mcp`.
- Update affected behavioral tests and CLI manifest/help expectations to assert the simpler connection contract.
- Preserve `ae connect` for OAuth/device authorization and origin-bound buyer credential storage.
- Preserve `aeMcpInstallCommand` / `aeMcpListCommand` and pinned `add-mcp@2.3.0` as the harness-specific configuration boundary.
- Preserve the official MCP SDK server/client and canonical action registry unchanged.

### Observed dependency cone

The direct implementation cone is `tools/ae/commands/connect.ts`, `tools/ae/commands/manifest.ts`, `tools/ae/cli.ts`, and `tools/ae/lib/config.ts`, with focused tests under `tests/unit/market-terminal/` and existing negative documentation tests under `tests/unit/discovery/`. The feature plan must inspect the current dirty-tree diff before editing and preserve unrelated work.

### Consequence

MCP setup and purchasing authorization become two explicit steps with different owners:

```text
add-mcp for the selected harness -> Ready to browse
ae connect when paid authority is requested -> Ready to buy
```

Neither command writes the other's configuration or implies the other's readiness.
