import { Link } from '@tanstack/react-router'

import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import {
  MALFORMED_CALL_REFERENCE_MESSAGE,
  OPEN_CALL_LABEL,
  OPEN_CALLS_LABEL,
  type SupportStatusSectionProps,
} from '../help.contracts'

export function SupportStatusSection({ callRef }: SupportStatusSectionProps) {
  return (
    <AeCollectionRail
      title="Continue from the current status"
      deck="The original Call shows its current status and next action. If the result is uncertain, check that Call before trying again."
      className="scroll-mt-anchor"
    >
      {callRef.kind === 'malformed' ? (
        <p className="text-sm text-muted-foreground">{MALFORMED_CALL_REFERENCE_MESSAGE}</p>
      ) : null}
      <div id="message-troubleshooting" className="flex flex-col gap-related sm:flex-row sm:flex-wrap">
        {callRef.kind === 'valid' ? (
          <Link
            to="/calls/$callRef"
            params={{ callRef: callRef.value }}
            className={cn(buttonVariants(), 'min-h-touch w-full sm:w-auto')}
          >
            {OPEN_CALL_LABEL}
          </Link>
        ) : (
          <Link
            to="/activity"
            className={cn(buttonVariants(), 'min-h-touch w-full sm:w-auto')}
          >
            {OPEN_CALLS_LABEL}
          </Link>
        )}
        <Link to="/owner/operations" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch w-full sm:w-auto')}>Continue Provider setup</Link>
        <Link to="/owner/credit" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch w-full sm:w-auto')}>Review account credit</Link>
      </div>
    </AeCollectionRail>
  )
}
