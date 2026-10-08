import { useRouter, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { adminInvestigationReturnHref, adminInvestigationSearchSchema, withAdminInvestigationScope } from './admin-investigation-return'

function ReturnControl() {
  const search = useRouterState({ select: state => state.location.search })
  const scope = adminInvestigationSearchSchema.parse(search)
  if (scope.returnKind === undefined) return null
  return <a href={adminInvestigationReturnHref(scope)} className={actionLinkClassName('secondary', 'md')}>Return to exceptions</a>
}
export function AdminInvestigationReturn() {
  const router = useRouter({ warn: false })
  return router ? <ReturnControl /> : null
}

type InvestigationLinkProps = Readonly<{ href: string; children: ReactNode; className?: string }>
function ScopedLink({ href, children, className }: InvestigationLinkProps) {
  const search = useRouterState({ select: state => state.location.search })
  const scope = adminInvestigationSearchSchema.parse(search)
  return <a href={withAdminInvestigationScope(href, scope)} className={className}>{children}</a>
}
export function AdminInvestigationLink(props: InvestigationLinkProps) {
  const router = useRouter({ warn: false })
  return router ? <ScopedLink {...props} /> : <a {...props} />
}
