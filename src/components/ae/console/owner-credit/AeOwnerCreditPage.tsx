import { FundingReturnNavigation } from '@/components/ae/funding/FundingReturnNavigation'
import { AeOwnerCredit } from '@/components/ae/console/owner-credit/AeOwnerCredit'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'

import { useOwnerCredit, type OwnerCreditReads } from './useOwnerCredit'

export function AeOwnerCreditPage({ reads }: { reads?: OwnerCreditReads }) {
  const credit = useOwnerCredit(reads)

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Credit"
      description="Add AUD credit for paid Calls. Each Agent’s spending limit remains separate."
      currentPath="/owner/credit"
    >
      <AeSettingsStack>
        <FundingReturnNavigation />
        <AeOwnerCredit {...credit} />
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
