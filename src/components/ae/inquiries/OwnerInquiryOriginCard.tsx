import type { OwnerInquiryDetailReadback } from '@/modules/inquiries/public'
import { AeInquiryOriginCard } from './AeInquiryOriginCard'

export function InquiryOriginCard({ detail }: { detail: OwnerInquiryDetailReadback }) {
  const origin = detail.inquiry.origin
  if (origin === undefined) {
    return null
  }

  return <AeInquiryOriginCard origin={origin} />
}
