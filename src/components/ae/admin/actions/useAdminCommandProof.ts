import { useServerFn } from '@tanstack/react-start'

import type { AdminActionSheetReceipt, AdminCommandRequest } from '@/components/ae/admin/actions/actions.contracts'
import { submitAdminCommandServer } from '@/components/ae/admin/actions/submitAdminCommand.functions'
import { useTypedReverification } from '@/lib/client/useTypedReverification'

export function useAdminCommandProof(): (request: AdminCommandRequest) => Promise<AdminActionSheetReceipt> {
  const send = useServerFn(submitAdminCommandServer)
  const submit = useTypedReverification(
    async (args: { data: AdminCommandRequest }) => await send(args),
    (receipt) => receipt.kind === 'refused' && receipt.code === 'mfa_reverification_required' ? 'strict_mfa' : null,
  )
  return async (request) => await submit({ data: request })
}
