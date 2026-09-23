import { useReverification } from '@clerk/tanstack-react-start'
import { useServerFn } from '@tanstack/react-start'

import type { AdminActionSheetReceipt, AdminCommandRequest } from '@/components/ae/admin/actions/actions.contracts'
import { submitAdminCommandServer } from '@/components/ae/admin/actions/submitAdminCommand.functions'

export function useAdminCommandProof(): (request: AdminCommandRequest) => Promise<AdminActionSheetReceipt> {
  const submit = useReverification(useServerFn(submitAdminCommandServer))
  return async (request) => await submit({ data: request })
}
