import type { ReactNode } from 'react'
import { ConvexProvider, ConvexReactClient, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'

import type { CustomerInquiryRecordServerResult } from '@/modules/inquiries/inquiry.functions'

const readCustomerRecordQuery = makeFunctionReference<
  'query',
  { threadId: string; accessKey: string },
  CustomerInquiryRecordServerResult
>('inquiries:readCustomerRecord')

const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
const customerRecordConvexClient = convexUrl === undefined || convexUrl.length === 0
  ? undefined
  : new ConvexReactClient(convexUrl)

export function isCustomerInquiryRecordClientAvailable(): boolean {
  return customerRecordConvexClient !== undefined
}

export function CustomerInquiryRecordProvider({ children }: { children: ReactNode }) {
  if (customerRecordConvexClient === undefined) {
    return <>{children}</>
  }

  return <ConvexProvider client={customerRecordConvexClient}>{children}</ConvexProvider>
}

export function useCustomerInquiryRecord(input: {
  threadId: string
  accessKey: string | undefined
}): CustomerInquiryRecordServerResult | undefined {
  return useQuery(
    readCustomerRecordQuery,
    input.accessKey === undefined ? 'skip' : { threadId: input.threadId, accessKey: input.accessKey }
  )
}
