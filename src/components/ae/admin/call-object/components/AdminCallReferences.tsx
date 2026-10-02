import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import type { AdminCallRelatedRef } from '../call-object.contracts'
import { ADMIN_CALL_OBJECT_COPY } from '../call-object.contracts'
import '../../RecordWorkspaceComposition.css'

export type AdminCallReferencesProps = Readonly<{
  refs: readonly AdminCallRelatedRef[]
}>

export function AdminCallReferences({ refs }: AdminCallReferencesProps) {
  return (
    <AeSection
      title={ADMIN_CALL_OBJECT_COPY.relatedTitle}
      description={ADMIN_CALL_OBJECT_COPY.relatedDescription}
      className="arc-admin-related-records"
    >
      <div className="arc-admin-related-list">
        {refs.map((ref) => (
          <div key={`${ref.label}:${ref.value}`} className="arc-admin-related-row">
            {ref.href === undefined ? (
              <span>{ref.label}</span>
            ) : (
              <a
                href={ref.href}
                className="arc-admin-record-link"
              >
                {ref.label}
              </a>
            )}
            <AeCopyReference label={ref.label} value={ref.value} />
          </div>
        ))}
      </div>
    </AeSection>
  )
}
