import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'

import { useOwnerCredit } from './useOwnerCredit'

export function AeOwnerCreditPage() {
  const credit = useOwnerCredit()

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Credit"
      description="Add AUD credit for paid Calls. Each Agent’s spending limit remains separate."
      currentPath="/owner/credit"
    >
      <AeSettingsStack>
        <AeOwnerCredit {...credit} />
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
