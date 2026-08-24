# Gates: Packet N dependency and environment cleanup

Scope: Remove obsolete packages/environment contracts only after a clean import audit.

- [ ] G1: Six obsolete packages are absent and required retained packages remain.
  CHECK: node -e "const p=require('./package.json'); const all={...p.dependencies,...p.devDependencies}; for(const n of ['braintrust','promptfoo','@shadcn/react','use-stick-to-bottom','@solana/sysvars','@x402/svm']) if(all[n]) process.exit(1); for(const n of ['ai','@tanstack/ai','@openrouter/ai-sdk-provider','@ai-sdk/provider-utils','convex-helpers','yaml','@convex-dev/agent']) if(!all[n]) process.exit(2); console.log('DEPENDENCIES_OK')"
  EXPECT: DEPENDENCIES_OK
  EVIDENCE: pending

- [ ] G2: Old answer/model/share environment names are absent and chat names are documented/fingerprinted.
  CHECK: ! rg -n "AE_LLM_MODELS|AE_ANSWER_|VITE_AE_ANSWER_MODE|BRAINTRUST" .env.example src/lib/deployment package.json .github && rg -n "AE_LLM_MODEL|AE_CHAT_PROXY_SECRET|AE_CHAT_SHARE_SECRET|AE_CHAT_SHARE_KEY_ID" .env.example src/lib/deployment && echo ENV_CLEANUP_OK
  EXPECT: ENV_CLEANUP_OK
  EVIDENCE: pending

- [ ] G3: Lockfile, manifest, package audit, and build remain green.
  CHECK: npm ci --ignore-scripts && npm run verify:deployment-manifest -- --environment development && npm run build && echo PACKAGE_CLEANUP_OK
  EXPECT: PACKAGE_CLEANUP_OK
  EVIDENCE: pending
