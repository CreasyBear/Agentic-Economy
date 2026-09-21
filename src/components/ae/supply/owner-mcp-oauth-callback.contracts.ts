export const OWNER_MCP_OAUTH_CALLBACK_COPY = {
  pageTitle: 'Provider connection',
  pageDescription: 'Return to Add Tool after the Provider confirms access.',
  action: 'Return to Add Tool and retry',
  environment: {
    sandbox: 'Sandbox',
    production: 'Production',
  },
  outcome: {
    not_found: {
      title: 'Connection link missing',
      description: 'Return to Add Tool and start the connection again.',
    },
    attempt_expired: {
      title: 'Connection link expired',
      description: 'Return to Add Tool and reconnect.',
    },
    not_supported: {
      title: 'Provider connection unsupported',
      description: 'This Provider does not support this connection method.',
    },
    reauthentication_required: {
      title: 'Confirmation expired',
      description: 'Return to Add Tool and confirm the connection again.',
    },
    secret_unavailable: {
      title: 'Connection not saved',
      description: 'AE could not store the Provider connection.',
    },
    connection_conflict: {
      title: 'Connection changed',
      description: 'Return to Add Tool and review the saved Provider connection.',
    },
    source_unavailable: {
      title: 'Provider connection unavailable',
      description: 'AE could not confirm the Provider response. No connection status is claimed.',
    },
  },
} as const

export type OwnerMcpOAuthCallbackRefusalCode = keyof typeof OWNER_MCP_OAUTH_CALLBACK_COPY.outcome

export type AeOwnerMcpOAuthCallbackProps = Readonly<{
  result: Readonly<{
    kind: 'refused'
    code: OwnerMcpOAuthCallbackRefusalCode
    continuationDraftRef?: string | undefined
    environment?: 'sandbox' | 'production' | undefined
  }>
}>
