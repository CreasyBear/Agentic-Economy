import type { InquirySourceStatePorts } from '../src/modules/inquiries/public'
import type { RuntimeDb } from './source_state'
import {
  loadInquiryCustomerAccessGrant,
  loadInquiryCustomerRecordState,
  loadInquirySourceState,
} from './inquirySourceStateLoad'
import {
  persistInquirySourceState,
  repairGovernedSendErasureKeys,
} from './inquirySourceStatePersist'

export function inquirySourceStatePorts(db: RuntimeDb): InquirySourceStatePorts {
  return {
    load: () => loadInquirySourceState(db),
    loadCustomerRecord: (threadId, grant) => loadInquiryCustomerRecordState(db, threadId, grant),
    loadCustomerAccessGrant: (accessId) => loadInquiryCustomerAccessGrant(db, accessId),
    persist: (state) => persistInquirySourceState(db, state),
    repairErasureKeys: (threadId) => repairGovernedSendErasureKeys(db, threadId),
  }
}
