# handshake-protocol-kernel provenance

Scope 03 / 03-01 acquired the kernel from npm, not by vendoring compiled runtime files.

| Field | Value |
|---|---|
| Package | `handshake-protocol-kernel` |
| Version | `0.4.0` exact pin |
| Acquisition path | npm registry install via `npm install handshake-protocol-kernel@0.4.0 --save-exact` |
| Retrieved | 2026-07-04 |
| License | Apache-2.0 |
| Repository | https://github.com/CreasyBear/handshake-protocol-kernel |
| gitHead | `93de6633338bf9d778c7e20edf76cece08a93b5f` |
| Tarball | https://registry.npmjs.org/handshake-protocol-kernel/-/handshake-protocol-kernel-0.4.0.tgz |
| Integrity | `sha512-Im98MnYbkANQOiwnfEyx8Vu2OR5J9jroP6RcHSks5miOtsu2zT74Z91+sT84NBu3TI2jC8ofdWa8m+3zGvLDyw==` |
| Node engine | `>=20` |

## Import posture

AE allows runtime imports only from:

- `handshake-protocol-kernel`
- `handshake-protocol-kernel/adapter-sdk`

The import/source-mining scans forbid `handshake-protocol-kernel/x402-protected-tool`, `/mcp`, `/http`, `/agentic-endpoint-middleware`, `/customer-edge`, `/experimental`, and direct `@x402/*`, `viem`, or `@modelcontextprotocol/*` imports in `src/**` and `convex/**`.

## Runtime-spike finding

The npm root export resolves, but source inspection found it bundles the Hono HTTP surface and does not export the self-hosted `HandshakeKernel` class. The 03-01 spike therefore records a `FALLBACK` verdict for 03-03: do not wire a Convex `ProtocolStore` against the npm root API until the package exposes the self-hosted kernel through an allowed export or AE deliberately vendors a minimal Apache-2.0 core dist in a later scoped task.
