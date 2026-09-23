import { Link } from '@tanstack/react-router'

import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'

export function PrivateSupportSection() {
  return (
    <AeCollectionRail
      title="Contact support privately"
      deck="For account, billing, security or Call problems, email support@aecon.ai with what you expected, what happened and a safe request reference. Do not include credentials, raw inputs or private results."
    >
      <div className="flex flex-wrap gap-related">
        <Link to="/for-providers" className="inline-flex min-h-touch items-center rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Review Provider requirements</Link>
        <Link to="/privacy/remove-business" className="inline-flex min-h-touch items-center rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Request a listing correction</Link>
      </div>
    </AeCollectionRail>
  )
}
