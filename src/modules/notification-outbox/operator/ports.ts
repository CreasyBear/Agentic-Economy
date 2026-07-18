import type {
  NotificationDispatchAttemptRecord,
  NotificationDispatchRecord,
  NotificationOperatorAuthority,
  NotificationOutboxSourceState,
  NotificationWebhookEventRecord,
} from '../internal/schema'

export type NotificationReconstructionInput = Readonly<{
  code: string
  dispatch?: NotificationDispatchRecord
  attempt?: NotificationDispatchAttemptRecord
  webhookEvent?: NotificationWebhookEventRecord
  operationKey: string
  correlationId: string
  actorKind: 'admin' | 'system'
  actorRef: string
}>

export type NotificationOutboxOperatorPorts = Readonly<{
  now: () => number
  loadSourceState: () => Promise<NotificationOutboxSourceState>
  persistSourceState: (state: NotificationOutboxSourceState) => Promise<void>
  readOperatorAuthority: () => Promise<NotificationOperatorAuthority | undefined>
  recordReconstruction: (input: NotificationReconstructionInput) => Promise<void>
}>
