export type DocumentAction =
  | Readonly<{ kind: 'create_statement' }>
  | Readonly<{ kind: 'create_daily_close' }>
  | Readonly<{ kind: 'open'; documentRef: string }>
  | Readonly<{ kind: 'sign'; documentRef: string }>

export type DocumentActionStatus = 'pending' | 'succeeded' | 'failed'

export type DocumentActionKey =
  | 'create_statement'
  | 'create_daily_close'
  | `open:${string}`
  | `sign:${string}`
