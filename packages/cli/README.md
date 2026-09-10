# Agentic Economy CLI

Search and describe public Tools, connect one origin-bound caller key, make a
Call, follow its durable receipt, and privately revisit jobs the market
cannot satisfy yet.

After installing the pinned archive from your Agentic Economy deployment:

```sh
ae --version
ae doctor --json
ae search "weather forecast"
ae request create "translate a handwritten invoice"
ae request list
ae describe "$AE_TOOL_REF"
ae connect
ae call "$AE_TOOL_REF" --input '{"city":"Perth"}' --wait
```

The package contains one compiled executable and has no runtime dependencies on
the Agentic Economy source repository. Its supported npm interface is the `ae`
binary only; package-root and deep JavaScript imports are intentionally blocked.

For Provider Tool inventory, replace the quoted variables below with the exact
origin and references from your Agentic Economy deployment, keeping the shell
quotes unchanged. `supply status` requires both `BUSINESS_REF` and `TOOL_REF`:

```sh
AE_ORIGIN="https://replace-with-your-ae-origin"
BUSINESS_REF="business:replace-with-your-business-ref"
TOOL_REF="tool:replace-with-your-tool-ref"

ae connect --provider --base-url "$AE_ORIGIN"
ae supply tools "$BUSINESS_REF" --base-url "$AE_ORIGIN" --json
ae supply status "$BUSINESS_REF" "$TOOL_REF" --base-url "$AE_ORIGIN" --json
```
