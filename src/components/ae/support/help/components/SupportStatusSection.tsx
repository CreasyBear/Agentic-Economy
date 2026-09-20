import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function SupportStatusSection() {
  return (
    <AeSection
      id="message-troubleshooting"
      title="Continue from the current status"
      description="The original Call shows its current status and next action. If the result is uncertain, check that Call before trying again."
    >
      <div className="flex flex-col gap-related sm:flex-row sm:flex-wrap">
        <Link to="/activity" className={cn(buttonVariants(), 'min-h-touch w-full sm:w-auto')}>Open Calls</Link>
        <Link to="/owner/operations" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch w-full sm:w-auto')}>Continue Provider setup</Link>
        <Link to="/owner/credit" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch w-full sm:w-auto')}>Review account credit</Link>
      </div>
    </AeSection>
  )
}
