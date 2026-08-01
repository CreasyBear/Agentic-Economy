# T20 — Self-onboard one real AE-operated endpoint through the supply funnel

Labels: `wayfinder:task` (AFK core done 2026-07-31; HITL publication step open). Map: [Agent engine](../MAP-engine.md).

## Question

Stand up one genuinely real AE-operated service endpoint (production-shaped: real HTTP service we operate, real availability/pricing logic — not the sandbox fixture) and take it through the T11 supply funnel end-to-end: describe → connect → check → price → test → go live. This proves the funnel with a real endpoint and gives the engine one non-fixture provider to plan against, without depending on recruiting an external business (ruled out of scope). Record what the funnel got wrong as feedback to the parity map. Choose a service whose quotes are honestly computable (e.g. a demo scheduling/quote service we host).

## Resolution

Core resolved 2026-07-31. Real operated endpoint: `AE Demo Services` — TanStack routes
`src/routes/api.demo-provider.{health,quote}.ts` on the app origin (no sandbox-supply imports; fixed
AUD price list; deterministic Adelaide business-hours slot computation; malformed bodies refused 400).
Live hosted proof: `https://agentic-economy-phi.vercel.app/api/demo-provider/health` → 200
`{status:ok,provider:AE Demo Services}`; POST `/quote` → 200 `kind:quoted`, AUD 18,900 bounded quote.
Evidence file: `output/eval/t20-evidence.json` (request/response, timestamps, proof ceiling).
Funnel work landed: owner supply Convex handlers (`advanceOwnerSupplyStep`, auth-gated readiness/test
probes with public-target restrictions, `publishOwnerCapability` via publication command + catalog
origin, funnel pricing honoured, indexed offering lookup) and `AeSupplyFunnel` payload contract fixed
(funnel feedback: UI/handler payload shapes had drifted; readiness/test actions initially shipped
without owner auth — both fixed at source).
**Open HITL step:** an operator signs into the deployed owner surface with a Clerk owner credential and
completes Describe → Connect (hosted quote URL) → Check → Price → Test → Go live; publicationRef /
capabilityOfferingRef / registry discovery evidence remain unproven until then (proof ceiling recorded
in t20-evidence.json).
