import { Link } from '@tanstack/react-router'


import type { ReturnToAddToolProps } from '../connection-handoff.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import '../ConnectionHandoffComposition.css'

export function ReturnToAddTool({ returnSearch }: ReturnToAddToolProps) {
  return (
    <Link
      to="/owner/operations/new"
      search={returnSearch}
      className={`${actionLinkClassName('secondary', 'md')} arc-connection-return`}
    >
      Return to Add Tool
    </Link>
  )
}
