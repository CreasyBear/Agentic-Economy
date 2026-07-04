# S3 identity preflight — Web Bot Auth + identity-is-not-authority

**Scope:** S3-G2 / S3-G4 preflight for `03-02-agent-door-identity-public-posture-PLAN.md`.

**Created:** 2026-07-04.

**Boundary:** source-local planning artifact only. This does **not** claim deployed attribution, provider production proof, marketplace liquidity, booking, payment, dispatch, autonomous fulfillment, or any new public authority.

**Trust contract:** Web Bot Auth (WBA) proves a request signer for attribution/quota/audit only. It never authorizes a verb. AE writes still require the AGENTS.md safe contract plus the separate mandate/checkpoint/receipt layer.

---

## 1. Verdicts

### S3-G2 — Web Bot Auth fixture/header proof before route integration

**Verdict: ADAPT.**

AE can execute 03-02 Task 1, but only with a narrowed initial trust posture:

1. exact-pin `web-bot-auth@0.1.3`;
2. treat Cloudflare `web-bot-auth.verify()` as crypto + minimal timestamp/tag enforcement, **not** as the whole WBA policy;
3. implement AE-owned checks for required components, host/proxy normalization, allowed `Signature-Agent`, key-directory fetch/cache, key selection, directory self-signature policy, nonce policy, and typed 400/401/403 outcomes;
4. start `ALLOWED_AGENTS` with **OpenAI ChatGPT agent only**: `https://chatgpt.com`;
5. document a temporary OpenAI-specific directory-self-signature exception because the observed OpenAI directory is HTTPS JWKS with thumbprint `kid`, but does not currently return `Signature` / `Signature-Input` response headers. Dynamic or non-pretrusted directories must not use this exception.

**Evidence:**

- [web/documented] OpenAI says ChatGPT agent signs every outbound HTTP request; headers include `Signature`, `Signature-Input`, and `Signature-Agent: "https://chatgpt.com"`; public key directory is `https://chatgpt.com/.well-known/http-message-signatures-directory`: <https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting>.
- [observed/source-local] GET `https://chatgpt.com/.well-known/http-message-signatures-directory` returned `200`, `content-type: application/http-message-signatures-directory+json`, one Ed25519 OKP key, and `kid == RFC8037 thumbprint`. The response did **not** include directory response `Signature` / `Signature-Input` headers in this probe.
- [web/documented] Cloudflare docs require/signpost WBA with Ed25519 keys, directory at `/.well-known/http-message-signatures-directory`, `tag="web-bot-auth"`, `created`, `expires`, `keyid`, `Signature-Agent`, `@authority`, and recommend short `expires`; Cloudflare states it currently does not validate nonces and recommends about one minute as replay defense: <https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/>.
- [source] npm reports `web-bot-auth` latest/current package version is `0.1.3`, Apache-2.0, with dependencies `http-message-sig ^0.2.0` and `jsonwebkey-thumbprint ^0.1.0`.
- [source] Packed `web-bot-auth@0.1.3` `dist/index.mjs` enforces `tag === "web-bot-auth"`, `created <= Date.now()`, `expires >= Date.now()`, and presence of `keyid` before calling the supplied verifier; it does not fetch directories, select keys, enforce component coverage, enforce max-age/skew, enforce nonce uniqueness, or verify directory self-signatures.

**Missing evidence:**

- [documented missing] No deployed AE end-to-end signer request or attributed audit row; that remains a Scope 1 deployed gate.
- [documented missing] No live ChatGPT-agent request fixture captured against AE; local tests must use source-owned fixtures and/or a synthetic key.
- [documented missing] No OpenAI directory self-signature observed; either OpenAI changes the directory, or AE records an explicit pretrusted-anchor exception.
- [documented missing] No exhaustive signer landscape proof for Anthropic, Perplexity, Google Gemini, or Bedrock AgentCore live traffic against AE.

**Blocks / Unlocks:**

- **Unlocks:** 03-02 Task 1 can pin `web-bot-auth@0.1.3` and produce the enforce-vs-AE-add matrix.
- **Blocks:** Route integration must not trust `verify()` alone; it must include the AE-owned policy checks below.
- **Blocks:** `ALLOWED_AGENTS` must not include non-OpenAI signers until their `Signature-Agent` URI, header dialect, key lookup semantics, and directory validation behavior are intentionally supported in tests.

**Next consuming plan:** `03-02-agent-door-identity-public-posture-PLAN.md`, Task 1 then Task 2.

### S3-G4 — identity-is-not-authority dispatch review before threading `agentIdentity`

**Verdict: GO.**

03-02 can thread `ActionContext.agentIdentity` if tests prove it is inert for authorization: attribution/quota/audit only, no new verbs, and signed-but-unmandated writes still refuse.

**Evidence:**

- [source/documented] Scope 3 index D10 states WBA proves signer; Handshake clears the action; a signature never authorizes a verb; rate buckets key on `(signatureAgent, keyid)`.
- [source/documented] ADR-003 D10 states identity is an input to clearance, never a substitute; D5 states unsigned reads served, unsigned writes `403 + Accept-Signature`; D6 states new verbs come solely from mandate + checkpoint + action contract.
- [source/documented] AGENTS.md allows assistants to read/compare/summarize/route and send a qualified inquiry only when published; it forbids booking, payment, dispatch, availability assumptions, autonomous fulfillment, and invented provider facts.

**Missing evidence:**

- [documented missing] No 03-02 unit/integration tests yet. The required matrix is listed in §7.
- [documented missing] No deployed WBA proof. S3-G4 is a source-local dispatch invariant, not a provider/deployed proof.

**Blocks / Unlocks:**

- **Unlocks:** `agentIdentity?: { signatureAgent, keyid, verifiedAt }` may be added to `ActionContext` if every action continues to use existing write-admission/mandate/checkpoint gates.
- **Blocks:** Any code path deriving `allowWrites`, action availability, owner authority, published capability, or protected-action approval from WBA identity alone.

**Next consuming plan:** `03-02-agent-door-identity-public-posture-PLAN.md`, Task 2 tests and route pre-check.

---

## 2. Current signer landscape

| Candidate | Status for AE now | Evidence | Confidence | Trust-anchor decision |
|---|---:|---|---:|---|
| OpenAI ChatGPT agent (`Signature-Agent: "https://chatgpt.com"`) | **Confirmed signer, initial AE anchor** | [web/documented] OpenAI Help Center says ChatGPT agent signs every outbound request and gives the exact `Signature-Agent` and directory URL. [observed/source-local] Directory returned HTTPS JWKS with one Ed25519 key; `kid` matched RFC8037 thumbprint. | High for signer identity; medium for directory-self-signature because none was observed. | **ALLOW initially:** `https://chatgpt.com`, with explicit out-of-band pretrusted-directory exception recorded in tests/docs. |
| Google AI agents / `Google-Agent` subset (`Signature-Agent: g="https://agent.bot.goog"`) | **Documented experimental WBA, not initial AE anchor** | [web/documented] Google says a subset of `Google-Agent` requests are signed as `https://agent.bot.goog`, not every request, and fallback verification remains required: <https://developers.google.com/crawling/docs/crawlers-fetchers/web-bot-auth>. [observed/source-local] `https://agent.bot.goog/.well-known/http-message-signatures-directory` returned signed JWKS; local WebCrypto verification of the directory response signature over `"@authority";req` succeeded. | Medium-high for Google's experimental subset; low for generic Gemini/Google-agent production coverage. | **DO NOT ALLOW initially.** Add later only after 03-02 supports dictionary-form `Signature-Agent`, label `g`, and Google `kid` semantics explicitly. |
| Amazon Bedrock AgentCore Browser | **Documented product feature, not AE-verifiable anchor yet** | [web/documented] AWS says Bedrock AgentCore Browser Web Bot Auth is Preview and signs requests when `browserSigning` is enabled; headers include `Signature`, `Signature-Agent`, `Signature-Input`: <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-web-bot-auth.html>. Docs consulted here did not provide a concrete `Signature-Agent` origin or public directory URI. [observed/source-local] probes against guessed AWS service domains did not produce a valid directory. | Medium for product feature; low for AE integration/trust anchor. | **DO NOT ALLOW.** Needs concrete signer origin + directory + fixture. |
| Anthropic / Claude | **UNVERIFIED** | [web/search] Search of Anthropic docs for WBA / HTTP Message Signatures did not surface a primary signer document. [observed/source-local] `https://claude.ai/.well-known/http-message-signatures-directory` returned HTML, not JWKS; `https://www.anthropic.com/.well-known/http-message-signatures-directory` returned 404. | Low / unknown. | **DO NOT ALLOW.** |
| Perplexity | **UNVERIFIED** | [web/search] Search of Perplexity docs did not surface a primary signer document. [observed/source-local] `https://www.perplexity.ai/.well-known/http-message-signatures-directory` returned 404/HTML; bare domain redirected to same. | Low / unknown. | **DO NOT ALLOW.** |
| Cloudflare, Akamai, HUMAN, Vercel | **Verifier / bot-management side, not signers for AE requests** | [web/documented] OpenAI and Cloudflare docs describe these as infrastructure that can verify signed agent traffic for site owners. | High. | Not `ALLOWED_AGENTS`; they may sit in front of AE and create header-preservation/attribution considerations. |

**Non-claim:** This artifact does not assert Anthropic, Perplexity, generic Google/Gemini, or Bedrock live signer support for AE. Google and AWS rows are bounded to their primary docs above; neither is admitted as an initial AE trust anchor.

---

## 3. Exact package/version recommendation

**Recommendation:** add exactly:

```json
"web-bot-auth": "0.1.3"
```

Do **not** use `^0.1.3` in `package.json`.

**Why this exact pin:**

- [source] `npm view web-bot-auth version license dependencies dist.tarball --json` returned version `0.1.3`, Apache-2.0, tarball `https://registry.npmjs.org/web-bot-auth/-/web-bot-auth-0.1.3.tgz`.
- [source] The package is 0.x and its README says: "This software has not been audited. Please use at your sole discretion." Main-branch README now tracks newer draft semantics, while the packed `0.1.3` README/source reflects older architecture semantics; exact pin avoids silent API/dialect churn.
- [source] `web-bot-auth@0.1.3` is Fetch-`Request` friendly and exports `verify`, `signatureHeaders`, `generateNonce`, `validateNonce`, `jwkToKeyID`, plus `web-bot-auth/crypto` helpers.
- [source] `web-bot-auth@0.1.3` delegates RFC 9421 parsing/building to `http-message-sig@0.2.0`; that dependency rejects multiple signatures and parses only a single `Signature-Input` dictionary entry.

**Pin caveat:** package-lock will pin transitive dependencies, but `web-bot-auth@0.1.3` declares `http-message-sig` with a caret. If 03-02 changes package files, verify lockfile entries after install and avoid relying on unpinned transitive behavior in prose.

---

## 4. Enforce-vs-AE-add matrix

| Check | `web-bot-auth@0.1.3` / `http-message-sig@0.2.0` enforces internally | AE must add on top | Decision for 03-02 |
|---|---|---|---|
| `Signature` / `Signature-Input` parse | [source] `http-message-sig.verify()` requires both headers, parses RFC 8941 dictionary, rejects multiple signatures as unsupported, checks the `Signature` label matches the single `Signature-Input` label, and rebuilds the signature base. | Map parse failures to typed `400 malformed_signature`; decide whether multiple signatures are rejected or explicitly selected. For 03-02, reject multiple signatures unless a tested multi-label use case is admitted. | **AE add typed policy.** |
| `tag="web-bot-auth"` | [source] `web-bot-auth.verify()` throws unless `params.tag === "web-bot-auth"`. | Pre-filter absent/non-WBA signatures as unsigned for read paths only; on gated writes, malformed/wrong tag is not trusted and should produce a typed refusal. | **Library enforces; AE maps outcome.** |
| Required components | [source] Signing helper defaults to `@authority`, and adds `signature-agent` only when signing with that header in main-source semantics; packed 0.1.3 signing examples omit `Signature-Agent`. Verify path does **not** require `@authority`, `signature-agent`, `@method`, or `@path`. | Require `@authority` for every WBA identity. Require `signature-agent` coverage when `Signature-Agent` is present. [INFERENCE] For write/gated POSTs, consider additionally requiring `@method` + `@path` + body digest in a later hardening pass, but do not widen 03-02 unless tests demand it. | **AE must add.** |
| `expires` / skew / max age | [source] `http-message-sig.verify()` rejects expired `expires` if present; `web-bot-auth.verify()` then calls `created.getTime()` and `expires.getTime()`, effectively requiring both, rejects future `created`, and rejects expired `expires`. It has no clock-skew allowance and no max-age limit. | Enforce configured `MAX_SIGNATURE_AGE_S` (recommend 60s for read-path replay defense), `SKEW_S` (recommend 30-60s), friendly typed statuses, and tests for expired/future/stale signatures. | **Library enforces raw now; AE must add skew/max-age.** |
| `@authority` match | [source] If `@authority` is covered, signature verification binds to the authority derived from the `Request.url` / Host. The package does not require that component. | Require coverage and define canonical host behind Vercel/CDN/proxy. Reject if the signed authority does not match AE's external host. Do not use mutable `Forwarded`/`Via` values as signed authority. | **AE must add.** |
| `keyid -> JWKS` | [source] `verify()` only passes `keyid` to the supplied verifier. `verifierFromJWK()` verifies with whichever JWK AE gives it; it does not fetch a directory, match `keyid`, cache, or re-fetch on rotation. | Parse/allowlist `Signature-Agent`; fetch directory with timeout; honor `Cache-Control`; select key by RFC8037 thumbprint for OpenAI-style keys and by documented `kid` only for an explicitly admitted signer such as Google; re-fetch on key miss; reject unknown key. | **AE must add.** |
| Directory self-signature | [source] Package exports helpers to sign directory responses, but packed 0.1.3 does not include a directory verifier or discovery client. | Verify directory response signatures for dynamic/non-pretrusted signers. **Adaptation:** OpenAI's observed directory is unsigned, so initial `https://chatgpt.com` can be trusted only as an out-of-band pretrusted HTTPS origin with `kid == thumbprint`; record that exception and keep it narrow. | **AE must add; initial OpenAI exception.** |
| Nonce | [source] `generateNonce()` / `validateNonce()` exist for 64-byte base64 nonce shape; `verify()` passes `nonce` through but does not require it or enforce uniqueness. Cloudflare docs say it currently does not validate nonces and relies on short `expires`. | For 03-02 read/list tools: no nonce store required if `expires` max-age is short. For any side-effecting/gated write: either require nonce uniqueness in a shared store or rely on the separate clearance/action idempotency layer and document that WBA identity alone is not replay authority. | **AE owns policy; do not let nonce absence authorize writes.** |
| `Signature-Agent` format | [source/web] Cloudflare production docs require legacy quoted sf-string (`"https://..."`) and say dictionary form such as `sig2="https://..."` fails. Google docs use dictionary form `g="https://agent.bot.goog"`. Packed `web-bot-auth@0.1.3` does not export the newer parser present on main. | For initial OpenAI anchor, parse only legacy quoted `"https://chatgpt.com"`. Treat dictionary-form agents as unsupported until intentionally added and tested. | **AE must add parser policy.** |

---

## 5. Initial `ALLOWED_AGENTS` trust-anchor decision

```ts
const ALLOWED_AGENTS = new Set([
  "https://chatgpt.com",
]);
```

**Rationale:**

- [web/documented] OpenAI is the only candidate here with primary documentation saying its agent signs every outbound request and giving the exact `Signature-Agent` and directory URL.
- [observed/source-local] OpenAI's directory served HTTPS JWKS and its key `kid` matched the RFC8037 JWK thumbprint, which aligns with older WBA/Cloudflare guidance.
- [source/web] Google is real but experimental, not all requests are signed, and its header dialect/key IDs differ from the OpenAI/Cloudflare legacy path. That is a separate compatibility task, not initial scope.
- [web/documented] AWS Bedrock AgentCore Browser WBA is Preview and lacks a concrete signer origin/directory in the docs read here.
- [observed/source-local] Anthropic and Perplexity probes did not produce WBA directories.

**OpenAI directory-self-signature adaptation:**

Initial `https://chatgpt.com` is allowed as an out-of-band trust anchor despite missing directory response signatures in the observed directory. This is a deliberate ADAPT decision, not a generic rule. The verifier should record the evidence reason as `pretrusted_directory_origin` or equivalent in tests/comments, and dynamic discovery should require signed directories.

---

## 6. Route/proxy/header preservation risks

| Risk | Why it matters | 03-02 requirement |
|---|---|---|
| CDN/proxy strips `Signature`, `Signature-Input`, or `Signature-Agent` | OpenAI explicitly warns to preserve these headers; if stripped, AE sees unsigned traffic and cannot attribute. | Source-local tests should simulate missing headers as `unsigned`; deployed smoke remains Scope 1. Document required Vercel/CDN header forwarding before deployed claim. |
| Host canonicalization mismatch | `@authority` is derived from the request host. Vercel preview domains, custom domains, `x-forwarded-host`, or local dev ports can make valid signatures fail if AE compares the wrong host. | Define `expectedAuthority` from configured public origin, not arbitrary inbound mutable headers. Tests should cover canonical host, wrong host, and local fixture host. |
| Header normalization/folding | RFC 9421 signature base is sensitive to covered component values. Proxies can normalize whitespace or fold repeated headers. | Only require stable components in 03-02: `@authority` + `signature-agent`; avoid signing mutable `Forwarded`, `Via`, `Date`, or rewritten query components. |
| Proxy-verification vs origin-verification split | A CDN may verify WBA and set its own bot fields, but AE still needs source-owned attribution if threading `agentIdentity`. | For source-local implementation, origin verifies itself. If later trusting a proxy assertion header, protect it as an internal-only header and threat-model spoofing separately. |
| Dictionary vs legacy `Signature-Agent` dialect | Cloudflare docs and OpenAI use quoted legacy string; Google uses dictionary label `g=`. | 03-02 should support OpenAI legacy first. Dictionary dialect is blocked behind tests and a separate trust-anchor decision. |
| Replay inside validity window | WBA signatures are bearer-replayable until `expires`; Cloudflare says it does not store nonces. | Short max age for identity; clearance/idempotency remains the authority layer for writes. Signed identity never grants the write. |

---

## 7. Identity-not-authority test matrix for 03-02

These tests are source-local and should not claim deployed/provider proof.

### Unit verifier matrix (`tests/unit/clearance/web-bot-auth.test.ts`)

| Case | Expected result | Purpose |
|---|---|---|
| No signature headers on read/list path | `{ kind: "unsigned" }`; caller may serve read | Unsigned reads remain allowed. |
| No signature headers on write/invoke path | route returns `403` with `Accept-Signature` | Unsigned writes step up, never fail-open. |
| Malformed `Signature-Input` | typed error status `400` | Bad syntax is not trusted. |
| Wrong `tag` | typed error or unsigned per policy; gated write refuses | Only WBA tag counts. |
| Missing `@authority` coverage | `400` / policy error | Prevent replayable insufficient coverage. |
| `Signature-Agent` present but not covered | `400` / policy error | Bind identity header into signature. |
| `@authority` signed for wrong host | `401` or policy error | Prevent cross-origin replay. |
| Expired signature | `401` | Time validity enforced. |
| Future `created` beyond skew | `401` | Clock-skew bounded. |
| `created` older than `MAX_SIGNATURE_AGE_S` even if `expires` is later | `401` | Short replay window. |
| Unknown `Signature-Agent` | `401` untrusted agent | Allowlist is explicit. |
| Known agent but unknown `keyid` | re-fetch directory once, then `401` | Supports rotation without failing open. |
| Bad signature over valid key | `401` | Crypto failure not trusted. |
| Valid OpenAI-style synthetic fixture | `{ kind: "identity", signatureAgent:"https://chatgpt.com", keyid, verifiedAt }` | Positive source-local proof. |
| OpenAI directory fetch returns unsigned JWKS | accepted only under `pretrusted_directory_origin` policy | Captures the initial ADAPT exception. |
| Non-OpenAI unsigned/dictionary-form fixture | refused unless separately admitted | Prevent accidental Google/AWS/unknown widening. |
| Nonce absent on read identity | identity may verify if other checks pass | Matches Cloudflare short-expiry baseline. |
| Nonce repeated on write identity | write still not authorized by WBA; clearance/idempotency must refuse replay | Identity does not own action replay authority. |

### Agent-door integration matrix (`tests/integration/agent-tools-api.test.ts`)

| Case | Expected result | Purpose |
|---|---|---|
| `GET /api/agent/tools` unsigned | `200`; no `agentIdentity`; action list unchanged | Read/list remains available. |
| `POST /api/agent/tools` unsigned for read-only tool | Existing read-only behavior preserved | Identity not required for read tools unless policy later changes. |
| `POST /api/agent/tools` unsigned for `inquiry.submit` | `403 + Accept-Signature` or existing write-admission refusal per 03-02 policy | Gated write does not fail open. |
| `POST /api/agent/tools` signed valid principal, read-only tool | `200`; context includes `agentIdentity`; no extra actions | Attribution only. |
| `POST /api/agent/tools` signed valid principal, but no mandate/approval for protected/write action | Refused with typed reason; no inquiry/protected action side effect unless existing safe contract allows it | Signed identity does not authorize a verb. |
| Signed principal with revoked/disabled `agentPrincipal` | Refused before action execution | Principal status is an input to policy, not public claim. |
| Agent-tools descriptor snapshot | unchanged except deliberate identity metadata if any | No new verbs advertised from identity. |
| Public/agent copy scan | no `Handshake`/`HSK`/`kernel`/`greenlight`/`clearance`/`mandate`/`protocol`/`gateway`/`ActionContract` in public/agent payloads | D9 posture remains intact. |

### Dispatch invariant assertions

- [source/documented] `ActionContext.agentIdentity` is optional attribution data only.
- [INFERENCE] Rate-limit buckets may key on `(signatureAgent, keyid)` because ADR-003 D10 says so, but quota decisions must not become action authorization decisions.
- [source/documented] `allowWrites` must remain governed by route/action policy and source-write/clearance gates, not by WBA verification success.
- [source/documented] `inquiry.submit` remains the only assistant-exposed write under AGENTS.md, and still cannot book, pay, dispatch, or autonomously fulfill.

---

## 8. Primary-source links used

- OpenAI Help Center, **ChatGPT agent allowlisting**: <https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting>
- OpenAI ChatGPT agent key directory: <https://chatgpt.com/.well-known/http-message-signatures-directory>
- Cloudflare Docs, **Web Bot Auth**: <https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/>
- Google Developers, **Authenticate requests with Web Bot Auth (experimental)**: <https://developers.google.com/crawling/docs/crawlers-fetchers/web-bot-auth>
- Google key directory: <https://agent.bot.goog/.well-known/http-message-signatures-directory>
- AWS Docs, **Reducing CAPTCHAs with Web Bot Auth — Amazon Bedrock AgentCore Browser**: <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-web-bot-auth.html>
- RFC 9421, **HTTP Message Signatures**: <https://www.rfc-editor.org/rfc/rfc9421>
- Cloudflare `web-bot-auth` package source/package metadata: <https://github.com/cloudflare/web-bot-auth> and <https://www.npmjs.com/package/web-bot-auth>

---

## 9. Decision summary for Main

- **Execute 03-02 Task 1?** Yes, with ADAPT constraints: exact-pin `web-bot-auth@0.1.3`, OpenAI-only initial trust anchor, AE-owned policy checks, and a documented OpenAI pretrusted-directory exception.
- **Keep researching before Task 1?** No, unless Main requires a non-OpenAI signer in the initial allowlist. Non-OpenAI signers are either experimental/not initially admitted (Google), preview-without-origin (AWS), or UNVERIFIED (Anthropic/Perplexity).
- **Execute 03-02 Task 2 route integration immediately after Task 1?** Only after Task 1 records the matrix in package/code comments/tests and the unit fixtures prove identity remains non-authoritative.
