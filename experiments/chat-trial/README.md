# Research-to-action trial

Local comparison of the current Convex Agent chat, Dify 1.17.1 classic Chatflow,
and LangGraph JS 1.5.0. Run commands from the repository root using Node 22 and
npm 11.5.1. This package is outside the product workspaces and runtime graph.

## What this tests

The Dify trial executes real Code, HTTP, condition, variable-assignment and
Answer nodes through its published chat API. LangGraph executes its actual
StateGraph, interrupts and checkpoints. Both share AE-validated synthetic
search, Quote, Call and status results. Tool selection and answer rendering are
fixture logic, including when the optional live classifier is enabled.

The current baseline runs actual `streamDurableChatResponse`, its Agent tools,
Convex component persistence, model-cost writes and answer fallback. Only the
external catalogue and purchase ports are simulated. Its natural research case
uses scripted model decisions; its explicit Run cases use the actual card path.

These are orchestration tests. They do not qualify real research quality,
production login/credit continuity, Tool delivery, receipts or settlement.
No production Tool/payment credentials or customer content are supplied.

## Setup and scripted cases

Docker Desktop must be running. The maintained trial uses ten selected services
(nine remain running after permissions initialization), loopback ports 5140/5141,
and a host fixture service on loopback port 5142. The proxy allows only the
Docker Desktop fixture hostname as an additional private destination. No beta
Agent, vector database, RAG or collaboration service is started.

```sh
npm ci --prefix experiments/chat-trial
mkdir -p output/chat-trial/evidence output/chat-trial/vendor
git clone --depth 1 --branch 1.17.1 https://github.com/langgenius/dify.git output/chat-trial/vendor/dify
node experiments/chat-trial/dify-local.mjs prepare
node experiments/chat-trial/dify-local.mjs up
```

In another terminal, keep the synthetic service running:

```sh
./node_modules/.bin/tsx experiments/chat-trial/service.ts
```

Then install the generated Chatflow and run the scenarios:

```sh
node experiments/chat-trial/dify-app.mjs install
node experiments/chat-trial/run.mjs dify
node experiments/chat-trial/run.mjs langgraph
node experiments/chat-trial/transport.mjs
node experiments/chat-trial/persistence.mjs
AE_CHAT_TRIAL_REPORT=1 ./node_modules/.bin/vitest run tests/integration/chat-research-action-trial.test.ts tests/unit/chat/chat-runtime-fixture.test.ts
./node_modules/.bin/tsc --project experiments/chat-trial/tsconfig.json --noEmit
```

`persistence.mjs` restarts **only** `ae-chat-trial-api-1`, then checks that its
stored conversation observes the existing uncertain Call. It separately shows
that LangGraph's MemorySaver survives same-process reconnects but does not
survive replacement of the graph runtime. It is not a production checkpointer.

The 18 scenarios cover research tables, discovery without purchase, audit,
missing inputs, guest/expired authority, funding/approval return, transient and
held pending/uncertain delivery, no supply, changed terms, denial, research then
action, model failure before any market I/O, and denial followed by a new funded
request. Guest/authority transitions are controller simulations, not browser SSO.
Model failure recovery is an explicit client retry before any purchase.

## Optional live inference

Stop the scripted fixture service before starting it with `--live`. That option
retrieves **only** `OPENROUTER_API_KEY` from Convex `upbeat-cricket-954` into process
memory via the official CLI. It sends synthetic prompts to the existing
DeepSeek model through AE's model gateway, with real model-provider charges.
It does not read `.env` files or call production Tools/payment endpoints.

```sh
./node_modules/.bin/tsx experiments/chat-trial/service.ts --live
node experiments/chat-trial/run.mjs dify --live
node experiments/chat-trial/run.mjs langgraph --live
node experiments/chat-trial/current-live.mjs
```

The classifier allows at most 12 requests per service process, 700 output
tokens/request, a 30-second model deadline, no automatic provider retries, and
stops issuing requests after observed cost reaches US$0.05. Missing cost stays
unknown; that threshold is not a provider-enforced money cap. Current chat uses
its existing 15-second step and 12-second final-answer deadlines, plus the trial's
60-second total bound and 1,000-output-token/request setting.

Dify/LangGraph live results test **intent classification followed by fixture
selection/rendering**. The live current result tests an autonomous Agent; their
pass rates and latencies are not a reasoning-quality comparison. Initial failed
classifier runs remain in local evidence. Dify's own Agent/LLM nodes were not
configured or qualified by this trial.

## Evidence and cleanup

Reports and generated DSL are under ignored `output/chat-trial/`. The committed
comparison records the material results. Do not commit local admin credentials,
API tokens, generated runtime configuration, vendor checkout or database files.

```sh
node experiments/chat-trial/dify-local.mjs stop
```

Stop the owned fixture process, remove `output/chat-trial/local-admin` and
`output/chat-trial/dify-access`, and remove the owned vendor directory (which
contains the generated runtime configuration and local database). Preserve only
nonsecret evidence/DSL as needed. Do not stop unrelated Docker projects or prune
global Docker resources. These scripts never deploy or renew production authority.
