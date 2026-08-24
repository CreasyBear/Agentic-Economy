# Gates: Packet N dependency and environment cleanup

Scope: Remove obsolete packages/environment contracts only after a clean import audit.

- [x] G1: Six obsolete packages are absent and required retained packages remain.
  CHECK: node -e "const p=require('./package.json'); const all={...p.dependencies,...p.devDependencies}; for(const n of ['braintrust','promptfoo','@shadcn/react','use-stick-to-bottom','@solana/sysvars','@x402/svm']) if(all[n]) process.exit(1); for(const n of ['ai','@tanstack/ai','@openrouter/ai-sdk-provider','@ai-sdk/provider-utils','convex-helpers','yaml','@convex-dev/agent']) if(!all[n]) process.exit(2); console.log('DEPENDENCIES_OK')"
  EXPECT: DEPENDENCIES_OK
  EVIDENCE: `43ace4bf` removed the six direct roots, reducing root packages from 79 to 73. The required Agent 0.7.1, AI SDK, OpenRouter, TanStack AI, Convex helpers, and YAML roots remain. `cc3c688e` completed the removal by externalizing the retained CDP SDK through Convex's native seam; Solana/x402 strings are transitive Coinbase/CDP metadata only.

- [x] G2: Old answer/model/share environment names are absent and chat names are documented/fingerprinted.
  CHECK: ! rg -n "AE_LLM_MODELS|AE_ANSWER_|VITE_AE_ANSWER_MODE|BRAINTRUST" .env.example src/lib/deployment package.json .github && rg -n "AE_LLM_MODEL|AE_CHAT_PROXY_SECRET|AE_CHAT_SHARE_SECRET|AE_CHAT_SHARE_KEY_ID" .env.example src/lib/deployment && echo ENV_CLEANUP_OK
  EXPECT: ENV_CLEANUP_OK
  EVIDENCE: The tracked runtime/config scan passes. The environment example and deployment manifest now expose one `AE_LLM_MODEL`, the chat proxy/share keyring, and the exact nine mounted Convex components; the release workflow supplies every required live-gateway name.

- [x] G3: Lockfile, manifest, package audit, and build remain green.
  CHECK: npm ci --ignore-scripts && npm run verify:deployment-manifest -- --environment development && npm run build && echo PACKAGE_CLEANUP_OK
  EXPECT: PACKAGE_CLEANUP_OK
  EVIDENCE: Node 22/npm 11 regenerated the lockfile; clean install, 62 focused tests, 18 gateway-smoke unit tests, development manifest validation, lint, typecheck, and production build pass. The CDP follow-on adds 46/46 focused, 29/29 imports, 421/421 conformance, normal/dry Convex codegen, a managed `dev:local`, and 7/7 parity. `npm audit --omit=dev` reports zero vulnerabilities.
