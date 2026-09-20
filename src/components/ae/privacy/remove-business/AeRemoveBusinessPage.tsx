import { CorrectionPathCards } from './components/CorrectionPathCards'
import { RemovalRequestForm } from './components/RemovalRequestForm'
import { correctionPaths } from './remove-business.contracts'
import { AeRemoveBusinessPageSkeleton } from './AeRemoveBusinessPageSkeleton'
import { useRemoveBusinessPage } from './useRemoveBusinessPage'

export function AeRemoveBusinessPage() {
  const { hydrated, form } = useRemoveBusinessPage()

  return (
    <div className="ae-rail grid max-w-prose gap-page pb-page">
      <CorrectionPathCards paths={correctionPaths} />
      {!hydrated ? <AeRemoveBusinessPageSkeleton /> : <RemovalRequestForm {...form} />}
    </div>
  )
}
