# T5 — No-credential adapter sentinel for public endpoints

Labels: `wayfinder:task` (AFK-capable). Status: open, unclaimed. Graduated from fog by T4's resolution.

## Question

Every capability transport adapter (`http-json:v1`, `mcp-jsonrpc:v1`, `x402-fetch:v2`) requires an `env:NAME` credentialRef, so a truly keyless public endpoint cannot be admitted, probed, or routed by AE. Define and implement the smallest honest change: a `none`/public credential sentinel for `http-json:v1` (admission validates it, readiness probe skips credential resolution, route runtime sends no auth header), so the first independently operated keyless provider (T4 shape) can reach `routeable` readiness. Refusal semantics, bounded config, and evidence classes stay exactly as the project payment and capability-supply contracts define them.

## Resolution

- Transport: `http-json:v1` only; `mcp-jsonrpc:v1` and `x402-fetch:v2` retain required `env:NAME` credentials.
- Sentinel: `credentialRef: 'none'` is the public/no-credential value. Adapter admission accepts it only for `http-json:v1`; the existing Convex `credentialRef` boundary remains opaque and delegates legality to module admission.
- Seams touched: transport adapter credential validation, readiness probing (skip credential resolution and `Authorization` for the sentinel), and route runtime preparation/cancellation/HTTP headers (no `Authorization` for the sentinel). Refusal codes and bounded configuration are unchanged.
- Evidence class: focused unit tests plus labelled local/dev/test seam coverage only; this proves the development contract, not hosted reachability, independent provider fulfilment, or customer value.
