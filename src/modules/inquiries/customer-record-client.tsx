import { useEffect, useState, type ReactNode } from 'react'
import { useServerFn } from '@tanstack/react-start'

import {
  readCustomerRecordServer,
  type CustomerInquiryRecordServerResult,
} from '@/modules/inquiries/inquiry.functions'

export function isCustomerInquiryRecordClientAvailable(): boolean {
  return true
}

export function CustomerInquiryRecordProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function useCustomerInquiryRecord(input: {
  threadId: string
  accessKey: string | undefined
}): CustomerInquiryRecordServerResult | undefined {
  const readCustomerRecord = useServerFn(readCustomerRecordServer)
  const [result, setResult] = useState<CustomerInquiryRecordServerResult>()

  useEffect(() => {
    if (input.accessKey === undefined) {
      setResult(undefined)
      return
    }

    let active = true
    void readCustomerRecord({
      data: { threadId: input.threadId, accessKey: input.accessKey },
    }).then((nextResult) => {
      if (active) setResult(nextResult)
    }).catch(() => {
      if (active) {
        setResult({
          kind: 'error',
          code: 'inquiry_source_unavailable',
          retryable: true,
          reason: 'The record could not be loaded right now.',
        })
      }
    })

    return () => {
      active = false
    }
  }, [input.accessKey, input.threadId, readCustomerRecord])

  return result
}
