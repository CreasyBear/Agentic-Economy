# Gates: Final source verification

Scope: Prove the pruned repository builds, tests, generates, preserves retained surfaces, and meets the net-deletion target.

- [ ] G1: Lint, typecheck, import/type/UI/SEO suites, unit/integration, and production build pass.
  CHECK: npm run lint && npm run typecheck && npm run test:imports && npm run test:ts-standards && npm run test:ui-contract && npm run test:seo && npm run test:unit && npm run test:integration && npm run build && echo SOURCE_GREEN_OK
  EXPECT: SOURCE_GREEN_OK
  EVIDENCE: pending

- [ ] G2: Normal then dry Convex codegen, deterministic chat, retained conformance, CLI package, and parity pass.
  CHECK: npm run generate:convex && npm run check:convex-codegen && npm run test:chat:conformance && npm run test:conformance && npm run test:cli-package && npm run parity:check && echo GENERATED_RETAINED_OK
  EXPECT: GENERATED_RETAINED_OK
  EVIDENCE: pending

- [ ] G3: Net tracked line removal from `76e31dc72` is at least 55,000.
  CHECK: git diff --numstat 76e31dc72..HEAD | awk 'BEGIN{a=0;d=0} $1~/^[0-9]+$/&&$2~/^[0-9]+$/{a+=$1;d+=$2} END{net=d-a; print "NET_REMOVED=" net; exit(net>=55000?0:1)}'
  EXPECT: /NET_REMOVED=([5-9][5-9][0-9]{3}|[6-9][0-9]{4}|[1-9][0-9]{5,})/
  EVIDENCE: pending

- [ ] G4: Gateway production smoke and exact-revision staging evidence are validated.
  EVIDENCE: pending
