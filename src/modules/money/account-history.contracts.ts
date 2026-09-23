import type { AccountHistoryResult } from './internal/account-history'

export type AccountHistoryPort = Readonly<{
  read: (input: Readonly<{ cursor?: string }>) => Promise<AccountHistoryResult>
}>
