import { Skeleton } from '@/components/arc/skeleton/skeleton'
import '@/components/ae/website/AuthComposition.css'

export function SignUpClerkFallback() {
  return (
    <div
      data-slot="ae-site-auth-clerk-fallback"
      className="arc-market arc-auth-loading"
      aria-hidden
    >
      {[0, 1, 2, 3].map(index => (
        <div key={index} className="arc-auth-loading-field" aria-hidden="true">
          <Skeleton lines={2} />
        </div>
      ))}
    </div>
  )
}
