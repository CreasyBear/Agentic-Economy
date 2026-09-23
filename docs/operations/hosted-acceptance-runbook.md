# Hosted acceptance runbook

**Revised:** 2026-09-17  
**Wave:** 5.1 (hosted-only closure after source-complete handoff)  
**Register rows:** AM-01, AM-25, AM-28, AM-30, AM-31, AM-32  
**Authority:** [alpha maturity register](alpha-maturity-register.md), [alpha release design](alpha-release-design.md), `PRODUCT.md`, `CONTEXT.md`

This runbook turns the six **hosted-only** alpha rows into executable verification. It does not change acceptance standards, waive sandbox-only funding and Tool payment policy, or substitute green unit tests or `/api/ready` for journey proof.

## Scope and vocabulary

| Register ID | Acceptance question (summary) |
| --- | --- |
| AM-01 | One named candidate; health and release identities align; sandbox fences refuse live Stripe and mainnet EVM even through direct requests |
| AM-25 | Infisical hosted secret create, use, rotate, revoke, and delete in the intended scope; the supported app action consumes the stored credential without manual copying |
| AM-28 | Deliberate failure yields a user-visible correlation reference and matching operator event at the intended Sentry and PostHog destinations |
| AM-30 | Runtime interruption recovery from the declared procedure; recovery-point loss at most 300 seconds on authoritative data |
| AM-31 | Cold auditors complete assigned Customer and Provider jobs in three turns; six decision turns or twelve minutes per assignment |
| AM-32 | Release owner traces every row to evidence, passing regression gates, and no open critical child defect before waitlist invitation |

Use canonical product language: **Customer**, **Agent**, **Account**, **Provider**, **Seller**, **Tool**, **Quote**, **Call**, **Charge**, **Purchase** resolution/status, **Outcome** records. Do not treat funding as spending authority, settlement as delivery, or a green health probe as sellable state.

## Operator prerequisites

1. **Named candidate** recorded before any row closes: Git commit SHA (40 hex), Vercel deployment id, Convex deployment name, public origin (`AE_SITE_URL`), and `AE_RELEASE_SOURCE_REVISION` on web and backend.
2. **Node 22 and npm 11.5.1** for repository commands (see `AGENTS.md`).
3. **Environment placeholders** (export once per session; never commit values):

   ```sh
   export AE_HOST='https://app.example.com'          # canonical hosted origin
   export CONVEX_DEPLOYMENT='prod:your-deployment'   # approved alpha backend only
   export RUN_ID="hosted-acceptance-$(date -u +%Y%m%dT%H%M%SZ)"
   ```

4. Read [deployment registry](deployment-registry.yaml) and [credentials and access](credentials-and-access.md). Do not print secret values, webhook bodies, or Infisical payloads in receipts.
5. **Stop conditions:** missing intended observability project ids, RPO above 300 seconds on a current drill, or any fence check that admits live funding or Base mainnet (`eip155:8453`) paid effects keeps the row **NOT VERIFIED** or **FAILING** — not waived.

## Shared response contracts

### Successful JSON (200)

| Route | Required shape (subset) |
| --- | --- |
| `GET /api/health` | HTTP 200; body is implementation-defined liveness |
| `GET /api/ready` | `{ "status": "ready", "checks": { "config": "ready", "convex": "ready" }, "commercial": { "catalogue", "quoting", "funding", "sellable" } }` |
| `GET /api/v1/release` | `{ "kind": "ok", "sourceRevision": "<40-char hex>" }` |

Header on readiness and problem responses: `X-AE-Request-Id` (correlation reference for AM-28).

### RFC 9457 problem (`application/problem+json`)

Every error body must include at least: `type` (`about:blank`), `title`, `status`, `kind`, `code`, and `detail`. Optional: `retryable`, `invalid-params`, extension fields in `extras`.

Schema conformance check (replace `body.json` with captured response):

```sh
node -e '
const p = require("./body.json")
const required = ["type","title","status","kind","code"]
for (const k of required) {
  if (!(k in p)) throw new Error(`missing ${k}`)
}
if (p.type !== "about:blank") throw new Error("bad type")
if (!Number.isInteger(p.status)) throw new Error("bad status")
console.log("problem_ok", p.code, p.kind)
'
```

### Signed receipt block (all rows)

Copy into the register evidence log (no secrets):

```text
parent ID / scenario | actor and starting state | action or injected fault |
expected → observed | surface + deployment + date | durable references |
recovery/replay result | reviewer
```

---

## AM-01 — Target alignment and sandbox fences

**Failure check:** An unavailable dependency must not produce false success; live funding and mainnet execution must be refused.

### 1. Record the named candidate

```sh
git rev-parse HEAD
curl --silent --show-error "${AE_HOST}/api/v1/release" | tee /tmp/release.json
node -e '
const r = require("/tmp/release.json")
if (r.kind !== "ok") throw new Error(JSON.stringify(r))
if (!/^[a-f0-9]{40}$/.test(r.sourceRevision)) throw new Error("bad sourceRevision")
console.log("release_ok", r.sourceRevision)
'

npx vercel@59.11.2 inspect "${AE_HOST}" --scope creasybears-projects
# Record deployment id and git metadata; must match release.json sourceRevision.

npx convex dashboard --prod
# Record deployment name and deployed commit; must match the same sourceRevision.
```

**Pass:** Web `sourceRevision`, Vercel deployment source, and Convex deployed revision are identical and match the recorded candidate SHA.

### 2. Health and readiness (not sellable by default)

```sh
curl --silent --show-error -o /tmp/health.body -w '%{http_code}\n' "${AE_HOST}/api/health"
curl --silent --show-error -D /tmp/ready.headers -o /tmp/ready.body -w '%{http_code}\n' "${AE_HOST}/api/ready"
grep -i '^x-ae-request-id:' /tmp/ready.headers || true
cat /tmp/ready.body | node -e '
const b = JSON.parse(require("fs").readFileSync(0,"utf8"))
if (b.status !== "ready") throw new Error(JSON.stringify(b))
for (const k of ["catalogue","quoting","funding","sellable"]) {
  if (!(k in b.commercial)) throw new Error(`missing commercial.${k}`)
}
console.log("ready_ok", b.commercial)
'
```

**Pass:** `/api/health` → 200. `/api/ready` → 200 with `commercial` object. Retain `X-AE-Request-Id`. A 503 readiness response is a **failed** AM-01 check unless the row is explicitly documenting a known incomplete candidate (still **NOT VERIFIED** for alpha-ready).

### 3. Deployment snapshot (configuration fence)

From repository root, with MFA-backed AWS role and approved Convex deployment name:

```sh
AE_DEPLOYMENT_AWS_PROFILE=package4-release-deployer \
AE_DEPLOYMENT_CONVEX_DEPLOYMENT="${CONVEX_DEPLOYMENT#prod:}" \
AE_DEPLOYMENT_STRICT=1 \
  .agents/skills/deployment-operations/scripts/deployment_snapshot.sh
```

**Pass:** Strict snapshot exits 0. Confirm manifest expectations: `AE_SERVICE_MODE=hosted_alpha`, Stripe command key prefix `rk_test_` (never `sk_live_` / `rk_live_`), sandbox Tool network `eip155:84532` (Base Sepolia) for supported paid Calls. Document any skip as **PARTIAL**, not VERIFIED.

### 4. Fail-closed — live Stripe (direct request)

Hosted alpha must refuse live Stripe configuration before Checkout or credit effects.

**4a. Provider readback (no secret values):**

```sh
stripe webhook_endpoints list --limit 3 --color off \
  | node -e '
let d=""
process.stdin.on("data",c=>d+=c)
process.stdin.on("end",()=>{
  const j=JSON.parse(d)
  for (const x of j.data ?? []) {
    if (x.livemode === true) throw new Error(`live webhook ${x.id}`)
  }
  console.log("stripe_mode_ok", (j.data??[]).map(x=>x.id))
})'
```

**4b. Application boundary (authenticated funding config):** With a valid owner session cookie or bearer credential, request funding constraints. If the deployment were misconfigured with a live secret, the server returns a **refusal** (not a Checkout handoff):

```sh
curl --silent --show-error \
  -H "Cookie: $(cat /path/to/hosted-owner-session.cookie)" \
  "${AE_HOST}/api/v1/account/funding/config" | tee /tmp/funding-config.json
```

**Pass:** Response is not a live Checkout URL. On misconfiguration, body matches `{ "kind": "refused", "code": "stripe_setup_required", "retryable": false }` (JSON API shape from the money boundary — not a Problem envelope). With correct test keys, constraints show sandbox funding policy without `livemode: true` Stripe objects in subsequent Checkout creation.

Do **not** place live Stripe keys on the alpha host to “test” refusal; use snapshot validation plus the documented refusal contract above and unit-proven `hosted_alpha` + `sk_live` refusal in `tests/unit/money/account-funding-http.test.ts`.

### 5. Fail-closed — mainnet EVM (direct Quote / Call path)

Supported alpha Calls admit **Base Sepolia only** (`eip155:84532`). Base mainnet is `eip155:8453`.

**5a. CLI doctor on hosted origin (read-only probe):**

```sh
node --import tsx tools/ae/cli.ts doctor --base-url "${AE_HOST}" --json | tee /tmp/doctor.json
```

Inspect JSON for sandbox quoting and funding gates; doctor must not report a sellable mainnet Tool path.

**5b. Authenticated Quote against a production-runtime Tool (negative):** When the catalogue contains a Tool whose current publication `runtimeEnvironment` is `production`, an Agent Quote request must refuse before upstream paid effects:

- HTTP `POST /api/v1/tools/quote` with Agent bearer authorization and schema-valid body.
- **Expected:** refusal `{ "kind": "refused", "code": "tool_unsupported", "retryable": false }` (see `tests/unit/convex/capability-quotes.test.ts` hosted_alpha cases).
- **Must not occur:** x402 signature creation, USDC movement, or `environment_mismatch` bypass.

**5c. Call worker fence:** A Call whose reserved Tool environment is `production` in `hosted_alpha` records `state: refused`, `code: environment_mismatch`, with zero provider transport and zero custody signing (see `tests/unit/convex/capability-call-worker-run.test.ts`).

**Pass:** All three layers documented with observed JSON and Call references. Any mainnet payment attempt or live Stripe Checkout on the candidate is **FAILING**.

### AM-01 sign-off checklist

- [ ] Candidate SHA recorded on web, Vercel, and Convex
- [ ] `/api/v1/release` 200 and SHA match
- [ ] `/api/ready` 200; `commercial` recorded; correlation header retained
- [ ] Strict deployment snapshot pass (or explicit PARTIAL gaps listed)
- [ ] Live Stripe and mainnet EVM fence evidence attached
- [ ] Release owner signature and date

---

## AM-25 — Infisical hosted secrets lifecycle

**Failure check:** Missing trust or denied access shows a truthful setup state; operators do not copy secret values between services to complete the test.

### Intended scope (record before testing)

| Field | Record in receipt |
| --- | --- |
| Infisical organization | platform and customer slugs |
| Projects | `AE_INFISICAL_*_PROJECT_ID` names only |
| Environments | e.g. `production` |
| Secret paths | `/agentic-economy/platform`, `/agentic-economy/customer` |
| Machine identities | OIDC to Vercel; ids only |

Setup reference: [hosted cutover 2026-09-12](hosted-cutover-2026-09-12.md) (Infisical section).

### 1. Create (hosted canary secret)

Use Infisical official UI or API to create a **canary** secret at the customer path (name example: `ae-hosted-acceptance-${RUN_ID}`). Record secret **name and version id**, never the value.

Prove the Vercel route can provision into Convex pointer storage:

```sh
# POST /api/internal/secret-lifecycle — server-only; requires AE_SECRET_LIFECYCLE_RPC_TOKEN
# Body schema (strict): action, authority, secretRef, idempotencyRef, materialBase64 (provision/rotate)
# See tests/unit/routes/secret-lifecycle.test.ts for authority and CANARY material pattern.

curl --silent --show-error -X POST "${AE_HOST}/api/internal/secret-lifecycle" \
  -H "Authorization: Bearer ${AE_SECRET_LIFECYCLE_RPC_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @/path/to/provision-body.json | tee /tmp/secret-provision.json
```

**Expected:** HTTP 200 with `{ "kind": "ok", ... }` and journal state `active`. **409/503** with `{ "kind": "unavailable", "code": "secret_lifecycle_conflict" | "secret_lifecycle_ambiguous" }` must be reconciled, not ignored.

### 2. Use (supported app action consumes credential)

Run the supported connection or consequence action documented for Package 5 secret consumption (Provider connection proof or isolated secret-canary harness path on hosted). **Expected:** Operation succeeds using the Infisical-backed generation; external provider readback confirms authentication without displaying material.

### 3. Rotate

```sh
curl --silent --show-error -X POST "${AE_HOST}/api/internal/secret-lifecycle" \
  -H "Authorization: Bearer ${AE_SECRET_LIFECYCLE_RPC_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @/path/to/rotate-body.json | tee /tmp/secret-rotate.json
```

**Expected:** New generation active; previous generation rejected on use after overlap window; idempotent replay returns the same active generation.

### 4. Revoke / delete (Infisical + pointer)

1. Revoke machine identity access or delete the secret version in Infisical (official console/API).
2. Re-run the app action. **Expected:** Truthful failure or setup-required state — not silent success with stale material.
3. Confirm Convex pointer/journal reflects failure or reconciliation (`secret_pointer_reconciliation_failed` resumable states per source tests).

Infisical delete generation is invoked by the store on failed validation (`infisical-cloud.ts` `#deleteGeneration`); receipts cite Infisical audit log ids and internal `operationRef`, not bytes.

### AM-25 sign-off checklist

- [ ] Scope ids recorded (projects, paths, identities)
- [ ] Create → use → rotate → revoke/delete each have provider readback
- [ ] No manual copy of secret values between Infisical, Vercel, and Convex
- [ ] Failed trust path shows understandable recovery state
- [ ] Secrets owner signature and date

---

## AM-28 — Observability and error delivery

**Failure check:** Missing delivery is a failed check, not proof from an enabled integration toggle.

### 0. Record intended destinations (mandatory before injection)

| System | Record |
| --- | --- |
| Sentry | Project slug, DSN host fingerprint (not full DSN), `SENTRY_ENVIRONMENT`, release |
| PostHog | Project id, host (`POSTHOG_HOST`), key fingerprint |
| Log stream | Axiom/Datadog dataset if used for `[ae.degraded]` (see [Convex observability setup](convex-observability-setup.md)) |

If any destination is unset, keep AM-28 **NOT VERIFIED**.

### 1. Deliberate server-side failure with correlation

Trigger an authenticated route that returns `problem()` (500/503) in a **non-money** path, or use a controlled test flag if deployed for acceptance only. Capture:

```sh
curl --silent --show-error -D /tmp/fault.headers -o /tmp/fault.body -w '%{http_code}\n' \
  "${AE_HOST}/api/..." 
CORR=$(grep -i '^x-ae-request-id:' /tmp/fault.headers | awk '{print $2}' | tr -d '\r')
echo "correlation=${CORR}"
cat /tmp/fault.body | node -e 'const p=require("fs").readFileSync(0,"utf8"); console.log(p); JSON.parse(p)'
```

**Pass:** Problem schema validates; `CORR` is non-empty and matches user-visible reference in the UI error surface for the same request.

### 2. Sentry delivery

In Sentry, search issues/events by `CORR` tag or `request_id` within 15 minutes. **Pass:** Matching event with stack or handled problem, no secret fields in breadcrumbs.

Thrown Convex exceptions use Convex→Sentry integration; caught degradations use log streams — do not expect `[ae.degraded]` in Sentry ([convex observability setup](convex-observability-setup.md)).

### 3. PostHog non-sensitive test event

Emit a uniquely tagged event (example name: `ae_hosted_acceptance_probe`, properties: `{ "run_id": "'"${RUN_ID}"'", "probe": true }`) through an approved server capture path or UI funnel that calls `captureServerEvent`. Query PostHog Live events by `run_id`.

**Pass:** Event arrives with sanitized properties (no credentials, cards, or webhook bodies). SDK acknowledgement alone is insufficient.

### 4. Client error pipeline (optional cross-check)

```sh
curl --silent --show-error -X POST "${AE_HOST}/api/observability/client-error" \
  -H "Content-Type: application/json" \
  -d '{"message":"hosted acceptance probe '"${RUN_ID}"'","metadata":{"feature":"hosted-acceptance"}}' \
  -w '\n%{http_code}\n'
```

**Expected:** HTTP 204 when Sentry is enabled; rate limit → 429 Problem; misconfiguration → 503 `client_error_rate_limit_unavailable`. Match event in Sentry by message tag.

### AM-28 sign-off checklist

- [ ] Destination ids recorded before test
- [ ] Correlation reference links UI, HTTP header, and Sentry event
- [ ] PostHog probe event located by `run_id`
- [ ] No secret material in telemetry payloads
- [ ] Observability owner signature and date

---

## AM-30 — Disaster recovery (RPO ≤ 300 s)

**Failure check:** Exceeded recovery-point loss is **FAILING**; missing current proof stays open. The 308 s result on the 4 September drill is historical only ([deployment registry](deployment-registry.yaml) `recoveryDrill`).

### Measurement definitions

| Metric | Definition |
| --- | --- |
| **Cutoff time** | Last authoritative write timestamp before induced fault (RDS `LatestRestorableTime` or documented write marker) |
| **Restored point** | Newest restorable timestamp recovered in the drill |
| **RPO loss** | `restoredPoint - cutoff` in seconds; must be ≤ 300 |
| **RTO** | Service restoration time separately; alpha operating target 3,600 s |

### Current drill procedure (Package 4 isolated restore)

Follow [recovery drill README](../../infra/package4/recovery-drill/README.md) and [AWS foundation](aws-foundation.md):

1. MFA AWS session; confirm account `197716152388`.
2. Record `LatestRestorableTime` immediately before restore request:

   ```sh
   aws rds describe-db-instances \
     --profile package4-release-deployer \
     --region ap-southeast-2 \
     --db-instance-identifier package4-release-formance \
     --query 'DBInstances[0].LatestRestorableTime' \
     --output text
   ```

3. Plan and apply **dated** recovery-drill OpenTofu root with unique state key (`recovery-drill` — saved plan only).
4. Attach isolated Formance stack; run `verify-restored-formance.sh` on the k3s host (schema, balance digests, idempotent replay).
5. Prove SNS or configured infrastructure alert delivery during the exercise (same subscriber recorded in registry).
6. Reconcile retained **Call**, **Charge**, and Formance transaction identities against pre-fault exports.

**Pass:** `rpoSeconds ≤ 300` on the **current** candidate environment. **Fail:** any miss on current measurement, or using only the September 2026 retired-environment numbers.

### Convex authoritative data (supplementary)

For backend state loss scenarios, record Convex export before fault:

```sh
npx convex export --prod --path "convex-backup-${RUN_ID}.zip"
shasum -a 256 "convex-backup-${RUN_ID}.zip"
```

Restore per Convex official restore runbook for the approved deployment class; RPO for relational ledger remains governed by RDS PITR evidence above.

### AM-30 sign-off checklist

- [ ] Cutoff and restored timestamps recorded
- [ ] RPO ≤ 300 s arithmetic shown
- [ ] RTO and alert delivery recorded
- [ ] Financial records reconcilable post-restore
- [ ] Operations owner signature and date

---

## AM-31 — Cold usability audit (3 turns / 6 decisions)

**Failure check:** Unfinished assignments stay unverified; findings get disposition, not silent scope cuts. More than three turns is a friction flag, not automatic failure.

### Auditor rules

| Rule | Value |
| --- | --- |
| Auditors | Independent cold models (e.g. Luna / max) or human testers without codebase access |
| Turns per assignment | Up to **3** conversational turns |
| Decision budget | Stop at **6 decision turns** or **12 minutes** (whichever first) |
| Surfaces | Desktop, compact layout, keyboard — each supported UI journey in the frozen inventory |
| Evidence | Every surface tested or explicitly **failed / untested** |

A **decision turn** is one user choice: navigation, form submit, dialog confirm, CLI command selection, or MCP tool invocation.

### Assigned user jobs (minimum set)

Record each job in a separate worksheet. Use isolated test Accounts only.

| Job | Actor | Goal | Primary surfaces |
| --- | --- | --- | --- |
| J1 — Fund credit | Customer (owner) | Request AUD credit, complete sandbox Checkout, return with exact credited balance | Balance, funding return |
| J2 — Connect Agent | Customer (owner) | Approve Agent connection; Agent obtains first Quote without manual Account identifiers | Agent access, installed CLI or supported client |
| J3 — Buy sandbox Tool | Customer + Agent | Search (no spend), Quote, funded Call with literal output and receipt | Market, Call status, Outcome records |
| J4 — Publish sandbox Tool | Provider (owner) | Approved connection, validation Call, publication visible for sandbox Quotes | Provider supply funnel |
| J5 — Recover uncertain Call | Customer + Agent | Resume by **Call** reference after interruption; no fresh purchase when reconciliation required | Call receipt, CLI `ae status` / `ae help recover` |
| J6 — Help with reference | Customer | Open support path with **Call** reference prefilled | `/support?callRef=...` |

### Worksheet template (per job)

```text
Job: J_
Auditor:
Layout: desktop | compact | keyboard
Turn 1 decisions: (list)
Turn 2 decisions: (list)
Turn 3 decisions: (list)
Outcome: completed | blocked | untested
Easy steps:
Difficult steps:
Likes:
Dislikes:
Papercuts: (id + disposition → parent AM-__)
Blocked by: (exact missing precondition)
Elapsed minutes:
```

### AM-31 sign-off checklist

- [ ] All six jobs have worksheets or explicit untested rationale
- [ ] Decision counts and timers recorded
- [ ] Papercuts mapped to register parent ids
- [ ] No screenshot-only evidence (observed behavior required)
- [ ] Audit owner signature and date

---

## AM-32 — Final release rollup and waitlist clearance

**Failure check:** Green health or source tests cannot substitute for hosted behavior; unmet contract blocks the alpha-ready claim.

### 1. Row trace matrix

Complete one row per AM-01 … AM-31:

| AM id | Hosted status | Evidence link / receipt id | Open child defects |
| --- | --- | --- | --- |
| AM-01 | | | |
| … | | | |
| AM-31 | | | |

**Pass for AM-32:** Every row is **VERIFIED** or an explicit **PARTIAL** with documented blocker and owner — no blank cells.

### 2. Regression and release gates on candidate SHA

On the same commit as `${AE_HOST}` release:

```sh
git checkout '<candidate-sha>'
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run gate
```

Record CI run URLs for the integration branch. A single local gate pass does not replace CI; both must be cited or waivers explicitly rejected.

### 3. Kernel probes (after gates)

```sh
curl --fail --silent --show-error "${AE_HOST}/api/health"
curl --fail --silent --show-error "${AE_HOST}/api/ready"
curl --fail --silent --show-error "${AE_HOST}/api/v1/release"
```

### 4. Waitlist clearance

Before inviting waitlist users:

- [ ] Sandbox-only funding and Tool payment policy restated in release notes
- [ ] No open **critical** child defect in [register defect queue](alpha-maturity-register.md#current-defect-queue)
- [ ] Joel source-complete handoff acknowledged (register sequencing)
- [ ] Support and incident contacts current
- [ ] Rollback boundary documented (Vercel alias + Convex deployment pin)

### Release owner attestation

```text
I attest that AM-01 through AM-31 hosted acceptance evidence is complete,
regression gates passed on candidate SHA ____________, and no known critical
defect blocks the sandbox alpha waitlist invitation.

Release owner: __________________  Date: __________  Candidate SHA: __________
```

---

## Related documents

| Document | Use |
| --- | --- |
| [Hosted cutover runbook](hosted-cutover-runbook.md) | Ordered migration commands (distinct from acceptance proof) |
| [Deployment commands](deployment-commands.md) | Snapshot, probes, recovery cleanup |
| [Convex observability setup](convex-observability-setup.md) | Sentry vs log streams |
| [Alpha maturity register](alpha-maturity-register.md) | Authoritative pass/fail and evidence log format |
