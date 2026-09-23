import type { OwnerProviderConnectionAttemptReadback } from '@/modules/capability-supply/supply-funnel.functions'

import {
  CONNECTION_HANDOFF_COPY,
  type ConnectionHandoffPageViewModel,
} from './connection-handoff.contracts'

export function projectConnectionHandoffPage(
  loaded: OwnerProviderConnectionAttemptReadback,
): ConnectionHandoffPageViewModel {
  if (loaded.kind !== 'available') {
    return {
      title: CONNECTION_HANDOFF_COPY.pageTitle,
      description: CONNECTION_HANDOFF_COPY.unavailableDescription,
    }
  }

  const accessKind = loaded.attempt.authentication.kind === 'api_key'
    ? CONNECTION_HANDOFF_COPY.accessKind.apiKey(loaded.attempt.authentication.name)
    : loaded.attempt.authentication.kind === 'http_bearer'
      ? CONNECTION_HANDOFF_COPY.accessKind.bearer
      : CONNECTION_HANDOFF_COPY.accessKind.oauth

  return {
    title: CONNECTION_HANDOFF_COPY.providerTitle(new URL(loaded.attempt.sourceOrigin).hostname),
    description: CONNECTION_HANDOFF_COPY.providerAccessDescription(accessKind),
    environmentLabel: CONNECTION_HANDOFF_COPY.environment[loaded.attempt.environment],
  }
}
