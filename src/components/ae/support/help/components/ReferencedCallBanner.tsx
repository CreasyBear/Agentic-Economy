import type { ReferencedCallBannerProps } from '../help.contracts'

export function ReferencedCallBanner({ callRef }: ReferencedCallBannerProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-related py-related text-sm">
      Referenced Call: {callRef}
    </div>
  )
}
