import '@/components/ae/shared/ProviderCatalogueComposition.css'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'

export function ProviderListingPending() {
  return (
    <AePublicPage>
      <article className="ae-rail arc-provider-catalogue" aria-busy="true" aria-label="Loading provider">
        <p role="status" aria-label="Loading provider" className="sr-only">Loading provider catalogue…</p>
        <div aria-hidden="true" className="arc-provider-loading">
          <div className="h-11 w-36 max-w-full"><Skeleton lines={2} /></div>
          <header className="arc-provider-identity">
            <div className="arc-provider-loading"><div className="h-10 w-72 max-w-full overflow-hidden"><Skeleton lines={2} /></div><div className="h-5 w-full"><Skeleton lines={1} /></div></div>
            <div className="arc-provider-loading"><div className="h-5 w-40 max-w-full"><Skeleton lines={1} /></div><div className="h-11 w-full"><Skeleton lines={2} /></div></div>
          </header>
          <div className="arc-provider-layout">
            <div className="arc-provider-gallery">
              {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-64 w-full"><div className="arc-provider-card"><Skeleton lines={6} /></div></div>)}
            </div>
            <div className="arc-provider-aside h-72 w-full"><Skeleton lines={6} /></div>
          </div>
        </div>
      </article>
    </AePublicPage>
  )
}
