
export type InquirySourceStateLoadScope =
  | {
      kind: 'target'
      businessId: string
      offeringRef: string
      operationKey: string
    }
  | {
      kind: 'owner_inbox'
      ownerId: string
    }
  | {
      kind: 'thread'
      threadId: string
      operationKey?: string
    }
  | {
      kind: 'operator'
      filter: {
        threadId?: string
        correlationId?: string
        dispatchId?: string
      }
    }

