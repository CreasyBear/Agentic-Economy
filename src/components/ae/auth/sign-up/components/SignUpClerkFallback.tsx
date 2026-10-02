import { Skeleton } from '@/components/ui/skeleton'
import '@/components/ae/website/AuthComposition.css'

export function SignUpClerkFallback() {
  return (
    <div
      data-slot="ae-site-auth-clerk-fallback"
      className="arc-market arc-auth-loading"
      aria-hidden
    >
      {[0, 1, 2, 3].map(index => <Skeleton key={index} className="arc-auth-loading-field" />)}
    </div>
  )
}
