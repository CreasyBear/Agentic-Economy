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
