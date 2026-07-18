import type {
  InquiryCustomerAccessGrant,
  InquirySourceState,
  InquiryThreadRecord,
} from '../schema'

export type InquirySourceStatePorts = Readonly<{
  load: () => Promise<InquirySourceState>
  loadCustomerRecord: (
    threadId: InquiryThreadRecord['threadId'],
    grant: InquiryCustomerAccessGrant,
  ) => Promise<InquirySourceState>
  loadCustomerAccessGrant: (
    accessId: string,
  ) => Promise<InquiryCustomerAccessGrant | undefined>
  persist: (state: InquirySourceState) => Promise<void>
  repairErasureKeys: (threadId: string) => Promise<void>
}>
