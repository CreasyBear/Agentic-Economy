import { reverificationError } from '@clerk/shared/authorization-errors'
import { useRef } from 'react'
import { useReverification } from '@clerk/tanstack-react-start'
import { useServerFn } from '@tanstack/react-start'

import type { AdminActionSheetReceipt, AdminCommandRequest } from '@/components/ae/admin/actions/actions.contracts'
import { submitAdminCommandServer } from '@/components/ae/admin/actions/submitAdminCommand.functions'

export function useAdminCommandProof(): (request: AdminCommandRequest) => Promise<AdminActionSheetReceipt> {
  const attempted = useRef(false)
  const send = useServerFn(submitAdminCommandServer)
  const submit = useReverification(async (args: { data: AdminCommandRequest }) => {
    const receipt = await send(args)
    if (receipt.kind === 'refused' && receipt.code === 'mfa_reverification_required' && !attempted.current) {
      attempted.current = true
      return reverificationError('strict_mfa')
    }
    return receipt
  })
  return async (request) => {
    attempted.current = false
    return await submit({ data: request })
  }
}
