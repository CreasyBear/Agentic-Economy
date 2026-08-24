# Gates: Packet O documentation

Scope: Document the Operation market product, thin chat adapter, five-tool boundary, retained surfaces, staged rollback, and current architecture diagram.

- [x] G1: README and codebase map name Operation market as product and chat as adapter.
  CHECK: rg -n "Operation market|thin chat|registry\.operations\.search|operation\.execute" README.md .planning/codebase && echo DOC_PRODUCT_OK
  EXPECT: DOC_PRODUCT_OK
  EVIDENCE: `d67c0a47` rewrote the README and force-added seven current codebase maps. All five tool IDs, anonymous/durable ownership, and the separate API/MCP/CLI plane are documented; 38 paths and 20 scripts were verified against the repository.

- [x] G2: Rollback documentation records K1/K2/Release B and per-table JSONL restore order without full-ZIP replacement.
  CHECK: rg -n "Release A|Release B|documents\.jsonl|full ZIP|rollback" README.md .planning/codebase && echo DOC_ROLLBACK_OK
  EXPECT: DOC_ROLLBACK_OK
  EVIDENCE: The architecture runbook records drain observation, Release A, exact-production export, all eleven JSONLs and digests, Release B, separate typed deletions, pre/post-deletion rollback, and the prohibition on full-ZIP replacement. It explicitly marks all production evidence pending.

- [x] G3: Current diagram matches website -> thin chat -> five tools -> registry/execution and retained API/MCP/CLI.
  EVIDENCE: README embeds an 11-node/10-edge Mermaid flowchart. The offline renderer produced a valid 21,868-byte SVG, 1950x514 PNG, and 32-element editable Excalidraw scene in the external visualization workspace; the user-owned repository `diagrams/` remains untouched.
