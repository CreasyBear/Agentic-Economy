export type AdminAuditFilter = {
  eventType?: string
  actorRef?: string
  target?: { type: string; ref: string }
  correlationId?: string
  from?: number
  to?: number
}

export type AdminAuditRow = {
  id: string
  createdAt: number
  eventType: string
  actorRef: string | null
  targetType: string | null
  targetRef: string | null
  outcome: string | null
  correlationId: string | null
  admin: {
    permission: string
    reasonCode: string
    evidenceRefs: readonly string[]
    beforeState: string | null
    afterState: string | null
  } | null
}
