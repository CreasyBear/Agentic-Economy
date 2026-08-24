# Gates: Final source verification

Scope: Prove the pruned repository builds, tests, generates, preserves retained surfaces, and meets the net-deletion target.

- [x] G1: Lint, typecheck, import/type/UI/SEO suites, unit/integration, and production build pass.
  CHECK: npm run lint && npm run typecheck && npm run test:imports && npm run test:ts-standards && npm run test:ui-contract && npm run test:seo && npm run test:unit && npm run test:integration && npm run build && echo SOURCE_GREEN_OK
  EXPECT: SOURCE_GREEN_OK
  EVIDENCE: Independent final verification passed lint, typecheck, imports 29/29, TS standards 1/1, UI contract 1/1, SEO 32/32, unit 2,468/2,468, integration 570/570, and production build under Node 22.22.0.

- [x] G2: Normal then dry Convex codegen, deterministic chat, retained conformance, CLI package, and parity pass.
  CHECK: npm run generate:convex && npm run check:convex-codegen && npm run test:chat:conformance && npm run test:conformance && npm run test:cli-package && npm run parity:check && echo GENERATED_RETAINED_OK
  EXPECT: GENERATED_RETAINED_OK
  EVIDENCE: Normal and dry Convex generation leave no drift; chat 85/85, retained conformance 421/421, and CLI pass. After `52d27f7e`, a managed local stack reaches readiness and plain `npm run parity:check` passes C1-C7 at 7/7 with clean teardown.

- [x] G3: Net tracked line removal from `76e31dc72` is at least 55,000.
  CHECK: git diff --numstat 76e31dc72..HEAD | awk 'BEGIN{a=0;d=0} $1~/^[0-9]+$/&&$2~/^[0-9]+$/{a+=$1;d+=$2} END{net=d-a; print "NET_REMOVED=" net; exit(net>=55000?0:1)}'
  EXPECT: /NET_REMOVED=([5-9][5-9][0-9]{3}|[6-9][0-9]{4}|[1-9][0-9]{5,})/
  EVIDENCE: At final source HEAD, the base-revision numstat reports 92,960 deleted and 17,512 added tracked lines, for exactly 75,448 net removed.

- [ ] G4: Gateway production smoke and exact-revision staging evidence are validated.
  EVIDENCE: Pending external evidence. Source/unit gateway-smoke coverage is green, but no production gateway request or exact-revision staging smoke was run in this repository-only operation.
