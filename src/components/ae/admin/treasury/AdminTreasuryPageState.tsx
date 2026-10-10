import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/arc/skeleton/skeleton'

export const TREASURY_PAGE_DESCRIPTION = 'Company USDC float, customer credit coverage and payment controls.'
export const TREASURY_PAGE_CHROME = { operatorRole: 'admin' as const, title: 'Treasury', description: TREASURY_PAGE_DESCRIPTION,
  currentPath: '/admin/treasury' }
export function AdminTreasuryPageSkeleton() {
  return <AeOperatorPage {...TREASURY_PAGE_CHROME} pending><div className="grid gap-section" aria-busy="true" aria-label="Loading treasury">{['Float', 'Runway', 'Coverage', 'In flight', 'Actions'].map(label => <Skeleton key={label} label={`Loading ${label}`} lines={4} />)}</div></AeOperatorPage>
}
