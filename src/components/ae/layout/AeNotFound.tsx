import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteButton } from '@/components/ae/website/AeSiteButton'

export function AeNotFound() {
  return (
    <AePublicPage
      kind="tool"
      eyebrow="Route missing"
      title="This page is not here."
      description="The address moved, expired, or was never published. Search the catalog, or list a tool."
      actions={
        <>
          <AeSiteButton asChild>
            <a href="/market?window=30d">Browse tools</a>
          </AeSiteButton>
          <AeSiteButton asChild variant="outlined">
            <a href="/for-providers">List a tool</a>
          </AeSiteButton>
        </>
      }
    />
  )
}
