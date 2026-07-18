import type { NotificationOutboxSourceState } from './schema'

export type NotificationOutboxSourceStatePorts = Readonly<{
  load: () => Promise<NotificationOutboxSourceState>
  persist: (state: NotificationOutboxSourceState) => Promise<void>
}>
