import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import type { AdminCallRelatedRef } from '../call-object.contracts'
import { ADMIN_CALL_OBJECT_COPY } from '../call-object.contracts'

export type AdminCallReferencesProps = Readonly<{
  refs: readonly AdminCallRelatedRef[]
}>

export function AdminCallReferences({ refs }: AdminCallReferencesProps) {
  return (
    <AeSection
      title={ADMIN_CALL_OBJECT_COPY.relatedTitle}
      description={ADMIN_CALL_OBJECT_COPY.relatedDescription}
      className="rounded-card border border-border p-gutter"
    >
      <div className="grid gap-related">
        {refs.map((ref) => (
          <div key={`${ref.label}:${ref.value}`} className="grid gap-intra">
            {ref.href === undefined ? (
              <span className="text-sm font-medium text-foreground">{ref.label}</span>
            ) : (
              <a
                href={ref.href}
                className="min-h-touch w-fit content-center text-sm font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
