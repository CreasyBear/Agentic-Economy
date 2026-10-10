import { ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item'
import type { ProviderConnectionInspection } from '@/modules/capability-supply/provider-connection.contracts'

/** Adapted from official ReUI Dialog 14; x402 authority has one exact resource, never invented scopes. */
export function ProviderConnectionReviewDialog({ open, onOpenChange, resourceUrl, method, environment, inspection, reauthorizing, pending, refreshRequired, notice, onConfirm, onRefresh }: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceUrl: string
  method: 'GET' | 'POST'
  environment: string
  inspection?: ProviderConnectionInspection
  reauthorizing: boolean
  pending: boolean
  refreshRequired: boolean
  notice?: Readonly<{ kind: 'error' | 'status'; text: string }>
  onConfirm: () => void
  onRefresh: () => void
}>) {
  return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
    <DialogContent showCloseButton={!pending} className="flex max-h-[88vh] min-h-0 flex-col overflow-y-auto sm:max-w-lg">
      <DialogHeader className="items-center gap-2 text-center">
        <ShieldCheckIcon className="size-9" aria-hidden="true" />
        <DialogTitle>{reauthorizing ? 'Review endpoint reauthorization' : 'Review Provider connection'}</DialogTitle>
        <DialogDescription>Connect the verified payment recipient for this exact endpoint. Tool publication and buyer availability are checked separately.</DialogDescription>
      </DialogHeader>
      <ItemGroup className="gap-2">
        <Item className="flex-nowrap items-start"><ItemMedia variant="icon"><ExternalLinkIcon aria-hidden="true" /></ItemMedia><ItemContent><ItemTitle>Exact resource</ItemTitle><ItemDescription className="break-all">{method} {resourceUrl}</ItemDescription><ItemDescription>Environment: {environment}</ItemDescription></ItemContent></Item>
        <Item className="flex-nowrap items-start"><ItemMedia variant="icon"><ShieldCheckIcon aria-hidden="true" /></ItemMedia><ItemContent><ItemTitle>Permission and custody</ItemTitle><ItemDescription>AE may route x402 payment to the proved payee for this method and resource. No Provider API key or wallet secret is stored. Connection authority can be revoked in settings.</ItemDescription></ItemContent></Item>
      </ItemGroup>
      <ItemSeparator />
      <section className="grid gap-2" aria-label="Observed payment lane">
        <h2 className="text-sm font-medium">Observed payment lane</h2>
        {inspection === undefined ? <p>The payment lane is no longer available. Inspect and prove this endpoint again.</p> : <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt>Amount</dt><dd className="break-all">{inspection.amount}</dd><dt>Network</dt><dd className="break-all">{inspection.network}</dd><dt>Asset</dt><dd className="break-all">{inspection.asset}</dd><dt>Payee</dt><dd className="break-all">{inspection.payTo}</dd>
        </dl>}
      </section>
      {notice === undefined ? null : <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{notice.text}</p>}
      {pending ? <p role="status">Confirming the connection. Wait for recorded status before starting another action.</p> : null}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Back to endpoint</Button>{refreshRequired ? <Button type="button" disabled={pending} onClick={onRefresh}>Reload current connections</Button> : <Button type="button" disabled={pending || inspection === undefined} onClick={onConfirm}>{pending ? 'Confirming…' : reauthorizing ? 'Reauthorize this endpoint' : 'Connect this endpoint'}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>
}
