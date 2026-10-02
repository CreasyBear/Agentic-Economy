import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'

import type { ReturnToAddToolProps } from '../connection-handoff.contracts'
import '../ConnectionHandoffComposition.css'

export function ReturnToAddTool({ returnSearch }: ReturnToAddToolProps) {
  return (
    <Link
      to="/owner/operations/new"
      search={returnSearch}
      className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-connection-return`}
    >
      Return to Add Tool
    </Link>
  )
}
