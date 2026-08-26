# Gates: Phase 2 authority-entry MCP and CLI composition

Scope: Prove all 14 MCP tools and 12 packaged CLI commands reach the same protected runtime handlers without client-owned authority.

- [ ] G1: `/mcp` POST/DELETE drives rate-limit → admission → single SDK `registerTool` loop → registered callback → action.run; a second registration site or pre-admission business effect fails.
  EVIDENCE: pending

- [ ] G2: Every MCP tool receives its exact protected/exempt cases through real protocol requests; bounded scrubbed rate-limit/telemetry effects are the only permitted pre-authority writes.
  EVIDENCE: pending

- [ ] G3: Every packaged CLI command drives argv/parser/descriptor/runner into the same proven HTTP/MCP endpoint; no imported runner or CLI-owned Principal/Account proof qualifies.
  EVIDENCE: pending

- [ ] G4: Authorized tool/command schemas, help, JSON, exit codes and stdout/stderr remain compatible; denial yields no protected effect or secret leakage.
  EVIDENCE: pending

- [ ] G5: Focused protocol/subprocess tests, typecheck, lint, import/bundle scans and exact changed-path 100% coverage pass.
  EVIDENCE: pending

- [ ] G6: Worker owns only focused edge tests/manifests; the driver alone edits shared MCP/CLI registration/wiring after a proven composition defect and reruns every raw command.
  EVIDENCE: pending

- [ ] G7: Four Unlazy passes find no further correctness, hostile-case or free-polish improvement; worker explicitly stops.
  EVIDENCE: pending
