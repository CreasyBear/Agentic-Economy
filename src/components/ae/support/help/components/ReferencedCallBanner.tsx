import type { ReferencedCallBannerProps } from '../help.contracts'
import '../SupportComposition.css'

export function ReferencedCallBanner({ callRef }: ReferencedCallBannerProps) {
  return (
    <div className="arc-market arc-support-reference">
      Referenced Call: {callRef}
    </div>
  )
}
