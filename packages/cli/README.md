# Agentic Economy CLI

Search and inspect public Operations, connect one origin-bound caller key, call
an Operation, follow its durable receipt, and privately revisit jobs the market
cannot satisfy yet.

```sh
npx @agentic-economy/cli search "weather forecast"
npx @agentic-economy/cli request create "translate a handwritten invoice"
npx @agentic-economy/cli request list
npx @agentic-economy/cli inspect "$AE_OPERATION_REF"
npx @agentic-economy/cli connect
npx @agentic-economy/cli call "$AE_OPERATION_REF" --input '{"city":"Perth"}' --wait
```

The package contains one compiled executable and has no runtime dependencies on
the Agentic Economy source repository. Its supported npm interface is the `ae`
binary only; package-root and deep JavaScript imports are intentionally blocked.
