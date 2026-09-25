import { buttonVariants } from '@/components/ui/button-variants'
import type { CallReceiptLinkView } from './object-family.contracts'

export type CallObjectLinksProps = Readonly<{ view: CallReceiptLinkView }>

export function CallObjectLinks({ view }: CallObjectLinksProps) {
  return (
    <nav aria-label="Call object links" className="flex min-w-0 flex-wrap gap-2">
      <a className={buttonVariants({ variant: 'outline', className: 'min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2' })}
        href={`/tools/${encodeURIComponent(view.toolRef)}`}>View Tool</a>
      {view.provider.kind === 'verified_business' ? (
        <a className={buttonVariants({ variant: 'outline', className: 'min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2' })}
          href={`/${encodeURIComponent(view.provider.slug)}`}>View Provider: {view.provider.name}</a>
      ) : view.provider.kind === 'directory_host' ? (
        <a className={buttonVariants({ variant: 'outline', className: 'min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2' })}
          href={`/providers/${encodeURIComponent(view.provider.host)}`}>View directory Host: {view.provider.name}</a>
      ) : <p className="self-center text-xs text-muted-foreground">No verified Provider or directory Host link is recorded for this Call.</p>}
    </nav>
  )
}
