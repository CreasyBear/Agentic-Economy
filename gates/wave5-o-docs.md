# Gates: Packet O documentation

Scope: Document the Operation market product, thin chat adapter, five-tool boundary, retained surfaces, staged rollback, and current architecture diagram.

- [ ] G1: README and codebase map name Operation market as product and chat as adapter.
  CHECK: rg -n "Operation market|thin chat|registry\.operations\.search|operation\.execute" README.md .planning/codebase && echo DOC_PRODUCT_OK
  EXPECT: DOC_PRODUCT_OK
  EVIDENCE: pending

- [ ] G2: Rollback documentation records K1/K2/Release B and per-table JSONL restore order without full-ZIP replacement.
  CHECK: rg -n "Release A|Release B|documents\.jsonl|full ZIP|rollback" README.md .planning/codebase && echo DOC_ROLLBACK_OK
  EXPECT: DOC_ROLLBACK_OK
  EVIDENCE: pending

- [ ] G3: Current diagram matches website -> thin chat -> five tools -> registry/execution and retained API/MCP/CLI.
  EVIDENCE: pending
