import type { NotificationProviderFamily } from './schema'

export type NotificationOutboxSourceStateLoadScope =
  | Readonly<{ kind: 'thread'; inquiryThreadId: string; operationKeys?: readonly string[] }>
  | Readonly<{ kind: 'dispatch'; dispatchId: string }>
  | Readonly<{
      kind: 'webhook'
      providerFamily: NotificationProviderFamily
      providerEventId: string
      logicalObjectKey: string
      dispatchId?: string
    }>

