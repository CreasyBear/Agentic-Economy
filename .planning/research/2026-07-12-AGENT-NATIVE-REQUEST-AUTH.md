# Agent-Native Request Authentication for Issue 136

Date: 2026-07-12

Scope: the smallest production path by which a cold external agent can authenticate to AE's TanStack Start request boundary and reach Convex under a stable, scoped, revocable principal. Sources are limited to official Clerk and Convex documentation.

## Decision

Use **Clerk user- or organization-delegated API keys as AE's first agent credentials**, verified by the TanStack Start server with an explicit AE scope. Represent the calling agent by the immutable Clerk API-key ID, with the Clerk user or organization ID as its owner. Cross into Convex through one narrow service-authenticated gateway that receives the already-verified agent principal.

This is the smallest usable production path because it gives a cold agent a standard bearer credential, stable credential identity, AE-defined scopes, optional expiry, immediate revocation, and no browser session or interactive authorization flow on each request.

## Options compared

| Option | What Clerk defines it for | Cold-agent fit | Scope and revocation | Convex fit | Decision |
|---|---|---|---|---|---|
| OAuth access token | A third-party application acting on behalf of a user through authorization-code consent | Works after an interactive user grant and refresh-token setup; not a zero-setup cold call | OAuth tokens can be JWT or opaque. Clerk's currently documented OAuth scopes cover identity/org data; custom OAuth scopes are not generally available | A JWT may be accepted only if its issuer, audience, algorithm, and claims match a configured Convex OIDC/custom-JWT provider. Opaque tokens cannot be passed to Convex as identity | Later interoperability path for ChatGPT/Claude-style user consent, not issue 136's first credential |
| Clerk M2M token | Communication between machines inside one operator's infrastructure | Requires AE to preconfigure each external agent as a Clerk machine and its communication partners | Machine-to-machine allowlists; opaque tokens are revocable, JWTs are locally verifiable but not revocable | A conforming M2M JWT could be configured as a Convex custom JWT only after its exact `iss`, `aud`, `sub`, `kid`, and algorithm are proven. Opaque M2M tokens cannot become Convex identity | Reserve for AE-owned services and subagents, not arbitrary external customers |
| Clerk API key carrying AE scopes | User- or organization-delegated access to the application's API | Direct fit: provision once, then send `Authorization: Bearer <key>` from any HTTP client | Stable key ID and subject; arbitrary application scope strings; optional expiration; immediate revocation; opaque verification | Cannot be used directly as Convex JWT identity. Verify at TanStack, then cross a narrow service-authenticated Convex boundary with the verified principal | **Build first** |
| Fully AE-owned credential store | AE mints, hashes, verifies, scopes, rotates, audits, and revokes its own secrets | Direct fit | Everything must be designed and operated by AE | Still needs either a Convex service bridge or an AE-operated JWT issuer/JWKS accepted by Convex | Do not build while Clerk API keys satisfy the boundary |

## Primary-source findings

### Clerk machine-token roles are deliberately distinct

Clerk defines OAuth access tokens for third-party applications acting on behalf of a user, M2M tokens for services within the same infrastructure, and API keys for users delegating access to an application's API. Clerk also states that it does not currently support OAuth client credentials. This rules out using M2M as the public default and rules out pretending authorization-code OAuth is a noninteractive machine bootstrap.

Sources:

- [Clerk machine authentication overview](https://clerk.com/docs/guides/development/machine-auth/overview)
- [Clerk M2M tokens](https://clerk.com/docs/guides/development/machine-auth/m2m-tokens)

### Clerk API keys provide the required external-agent properties

Clerk API keys are opaque, user- or organization-associated credentials. They can carry application-defined scopes and claims, have optional expiration, and be revoked immediately. The secret is returned only at creation. Requests use the standard bearer header. Server verification returns the key's stable ID, subject, scopes, claims, and validity state.

Sources:

- [Clerk API keys](https://clerk.com/docs/guides/development/machine-auth/api-keys)
- [Verify machine tokens with Clerk](https://clerk.com/docs/reference/backend/authenticate-request)
- [TanStack Start `auth()` token types](https://clerk.com/docs/reference/tanstack-react-start/auth)

### TanStack Start can explicitly accept machine credentials

Clerk's TanStack Start middleware establishes request auth state, but `auth()` defaults to session tokens. The API route must explicitly call `auth({ acceptsToken: 'api_key' })` or use `authenticateRequest(..., { acceptsToken: 'api_key' })`. Accepting `any` or a mixed token list would enlarge issue 136's authority boundary without delivering more value.

Sources:

- [TanStack Start Clerk middleware](https://clerk.com/docs/reference/tanstack-react-start/clerk-middleware)
- [TanStack Start `auth()`](https://clerk.com/docs/reference/tanstack-react-start/auth)
- [Clerk `authenticateRequest()`](https://clerk.com/docs/reference/backend/authenticate-request)

### Convex requires JWT identity, not an opaque API key

Convex authenticates application calls with OIDC/custom JWTs. `ctx.auth.getUserIdentity()` derives a unique `tokenIdentifier` from issuer and subject. A custom JWT provider requires signed tokens with `kid`, `alg`, `typ`, `sub`, `iss`, and `exp`; audience verification is strongly recommended. `ConvexHttpClient.setAuth()` likewise accepts a JWT-encoded OIDC identity token. Therefore a Clerk opaque API key must not be forwarded to Convex as though it were a Convex auth token.

Sources:

- [Convex authentication overview](https://docs.convex.dev/auth/overview)
- [Convex custom JWT provider](https://docs.convex.dev/auth/advanced/custom-jwt)
- [Convex auth in functions](https://docs.convex.dev/auth/functions-auth)
- [Convex HTTP client authentication](https://docs.convex.dev/api/classes/browser.ConvexHttpClient.html)

### Convex explicitly supports a narrow service-auth boundary

For controlled servers that cannot obtain end-user OIDC JWTs, Convex recommends exposing narrowly scoped public functions that check a shared secret before doing anything else. That is the minimum bridge for issue 136: TanStack verifies the external Clerk API key, then invokes one Convex gateway protected by a high-entropy AE service secret. The gateway treats principal fields as trusted only after the service-secret check.

Source:

- [Convex service authentication](https://docs.convex.dev/auth/overview#service-authentication)

## Exact request path

1. An AE user or organization creates a Clerk API key through AE with required scope `customer_requests:create`. AE records the returned Clerk key ID as the agent credential ID; the raw secret is shown once and never stored by AE.
2. The cold external agent calls `POST /api/v1/requests` with:
   - `Authorization: Bearer <Clerk API key>`
   - `Idempotency-Key: <caller-generated value>`
   - the typed CustomerRequest body.
3. TanStack Start's Clerk middleware runs. The route accepts only `api_key`, rejects invalid/revoked/expired keys, and requires `customer_requests:create`.
4. The route obtains the full verified API-key record when necessary and derives:
   - `principalId = "clerk_api_key:" + apiKey.id`
   - `ownerId = apiKey.subject`
   - `credentialId = apiKey.id`
   - verified scopes and claims.
5. The route creates a request-local Convex client and calls one public gateway with the AE service secret plus the verified principal and command. It must never reuse a stateful `ConvexHttpClient` across incoming requests.
6. The Convex gateway checks the service secret before reading or writing, validates the asserted principal shape, then calls internal CustomerRequest logic. Every durable request and receipt stores `principalId`, `ownerId`, and `credentialId`.

## Security and product invariants

1. The public request route accepts only Clerk `api_key` credentials in issue 136.
2. A key without `customer_requests:create` is unauthorized even if Clerk says it is valid.
3. The stable agent principal is the Clerk API-key ID, not a display name, request field, IP address, or user ID alone.
4. Owner identity and agent identity are stored separately; multiple agents owned by one user or organization do not collapse into one principal.
5. Revocation is checked by Clerk on every request because the recommended API key is opaque.
6. The raw API key is never logged, persisted in AE, forwarded in a Convex argument, or returned after provisioning.
7. The TanStack-to-Convex service secret authorizes only the narrow CustomerRequest gateway. It is not an agent identity and never appears in receipts.
8. No caller-provided principal field is trusted. Principal material comes only from the verified Clerk key record.
9. OAuth and M2M credentials are rejected until separately implemented and proven; token-type ambiguity is an authorization bug.

## Why not mint AE JWTs now

An AE JWT issuer would remove the service bridge and let Convex expose the agent as `ctx.auth.getUserIdentity()`. It would also require AE to operate signing-key custody, rotation, JWKS publication, issuer availability, audience policy, token refresh, revocation or short lifetimes, and incident response. Convex's custom JWT support makes this possible, but it is not the smallest production-grade route. Build it only when direct-to-Convex agent calls become a measured requirement.

## Acceptance proof for issue 136

The path is proven when a fresh command-line client with no cookies can:

1. create a request with a valid scoped key;
2. receive `401` for a missing, revoked, or wrong-type credential;
3. receive `403` for a valid key missing `customer_requests:create`;
4. replay safely under the same idempotency key;
5. retrieve only requests owned by the same API-key principal or its explicitly authorized owner scope; and
6. produce a Convex record and receipt containing the exact stable Clerk key ID without containing either bearer secret.
