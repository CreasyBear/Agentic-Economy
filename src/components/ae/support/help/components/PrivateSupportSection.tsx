import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import { ISSUE_URL } from '../help.contracts'

export function PrivateSupportSection() {
  return (
    <AeSection
      title="Contact support privately"
      description="For account, billing, security or Call problems, email support@aecon.ai with what you expected, what happened and a safe request reference. Do not include credentials, raw inputs or private results."
    >
      <p className="text-sm text-muted-foreground">
        GitHub issues are public. Use them only for non-sensitive developer reports.
      </p>
      <a
        href={ISSUE_URL}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: 'outline' }), 'mt-related min-h-touch')}
      >
        Open a public developer issue <ArrowUpRightIcon aria-hidden="true" />
      </a>
      <div className="mt-related flex flex-wrap gap-related">
        <Link to="/for-providers" className="inline-flex min-h-touch items-center rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Review Provider requirements</Link>
        <Link to="/privacy/remove-business" className="inline-flex min-h-touch items-center rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Request a listing correction</Link>
      </div>
    </AeSection>
  )
}
