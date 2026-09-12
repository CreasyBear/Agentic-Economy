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
            <a href="/market#tools">Browse Tools</a>
          </AeSiteButton>
          <AeSiteButton asChild variant="outlined">
            <a href="/for-providers">Publish a Tool</a>
          </AeSiteButton>
        </>
      }
    />
  )
}
