import type { FormEvent } from 'react'

import type { OwnerProviderConnectionAttemptReadback } from '@/modules/capability-supply/supply-funnel.functions'

export type HandoffReturnSearch = Readonly<{
  connection?: string
  environment?: 'sandbox' | 'production'
  draft?: string
}>

export type ConnectionHandoffPageViewModel = Readonly<{
  title: string
  description: string
  environmentLabel?: 'Sandbox' | 'Production'
}>

export const CONNECTION_HANDOFF_COPY = {
  pageTitle: 'Connect Provider',
  pageDescription: 'Connect the credential required by this Provider source.',
  providerTitle: (providerName: string) => `Connect ${providerName}`,
  providerAccessDescription: (accessKind: string) => `${accessKind} access for this Provider.`,
  accessKind: {
    apiKey: (name: string) => `${name} API key`,
    bearer: 'Bearer token',
    oauth: 'OAuth',
  },
  environment: {
    sandbox: 'Sandbox',
    production: 'Production',
  },
  unavailableTitle: 'Connection link unavailable',
  unavailableDescription: 'Return to Add Tool and reconnect.',
  expiredTitle: 'Connection link expired',
  expiredDescription: 'Return to Add Tool and reconnect.',
} as const

export type ConnectionHandoffSurface =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'consumed'; title: string; description: string; returnSearch: HandoffReturnSearch }>
  | Readonly<{ kind: 'expired'; returnSearch: HandoffReturnSearch }>
  | Readonly<{
      kind: 'http_pending'
      sourceOriginLabel: string
      credentialLabel: string
      credential: string
      busy: boolean
      error: string | undefined
    }>
  | Readonly<{
      kind: 'mcp_pending'
      sourceOriginLabel: string
      beginBusy: boolean
      cancelBusy: boolean
      error: string | undefined
    }>

export type AeConnectionHandoffProps = Readonly<{
  loaded: OwnerProviderConnectionAttemptReadback
}>

export type HandoffStatusPanelProps = Readonly<{
  title: string
  description: string
  returnSearch: HandoffReturnSearch
}>

export type HttpCredentialFormProps = Readonly<{
  sourceOriginLabel: string
  credentialLabel: string
  credential: string
  busy: boolean
  error: string | undefined
  onCredentialChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}>

export type McpOAuthStartPanelProps = Readonly<{
  sourceOriginLabel: string
  beginBusy: boolean
  cancelBusy: boolean
  error: string | undefined
  onBegin: () => void
  onCancel: () => void
}>

export type ReturnToAddToolProps = Readonly<{
  returnSearch: HandoffReturnSearch
}>

export function refusalCopy(code: string): string {
  switch (code) {
    case 'attempt_expired':
    case 'not_found':
      return 'This connection request is no longer available. Return to Add Tool and start again.'
    case 'reauthentication_required':
      return 'Your confirmation expired. Submit once more to confirm this connection.'
    case 'secret_unavailable':
      return 'The credential could not be stored. Try again; no Provider connection was created.'
    case 'connection_conflict':
      return 'The Provider connection changed. Return to Add Tool and review the current connection.'
    default:
      return 'AE could not confirm the connection. Try again.'
  }
}

export function buildHandoffReturnSearch(input: Readonly<{
  connectionRef?: string | undefined
  environment?: 'sandbox' | 'production' | undefined
  draftRef?: string | undefined
}>): HandoffReturnSearch {
  const { connectionRef, environment, draftRef } = input
  if (connectionRef === undefined || environment === undefined) {
    return draftRef === undefined ? {} : { draft: draftRef }
  }
  return {
    connection: connectionRef,
    environment,
    ...(draftRef === undefined ? {} : { draft: draftRef }),
  }
}
