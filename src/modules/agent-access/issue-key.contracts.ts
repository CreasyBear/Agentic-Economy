/**
 * One-time machine-credential reveal and the UI-narrowed issue adapter.
 *
 * SECURITY: `secret` is a one-time bearer credential. It is shown once in
 * AeKeyRevealDialog and then dropped from React state. Do not widen this
 * shape, do not add serialization / toString / logging helpers, and do not
 * treat `secret` as loggable. `keyId` is a credential locator, not a secret.
 *
 * Do not alias `AgentAccessKeyIssueResult` to the wider server-side
 * `AgentAccessKeyResult` in `./agent-access.ts`.
 */

export type IssuedAgentAccessReveal = Readonly<{
  keyId: string
  /** One-time machine-credential secret. Never log. */
  secret: string
  displayName: string
  environment: 'sandbox' | 'production'
}>

export type AgentAccessKeyIssueResult =
  | Readonly<{
      kind: 'created' | 'replayed'
      keyId: string
      /** One-time machine-credential secret. Never log. */
      secret: string
    }>
  | Readonly<{ kind: 'error'; code: string; retryable: boolean }>
  | Readonly<{ kind: 'refused'; code: 'reverification_required' }>
