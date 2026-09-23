import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonVariants } from '@/components/ui/button-variants'
import { aeStatusToneVariants } from '@/lib/ui/status-presentation'
import { appDestination } from '@/lib/navigation/app-navigation'
import { cn } from '@/lib/utils'
import { UnavailableSummary } from './ProviderWorkspaceSharedUi'
import {
  PROVIDER_WORKSPACE_EARNINGS_COPY,
  type ProviderWorkspaceEarningsSectionProps,
} from './provider-workspace/provider-workspace.contracts'

export function ProviderWorkspaceEarningsSection({
  payoutConnection,
  earningsOpen,
  earningsPending,
  earningsDetailAvailable,
  onOpenEarnings,
  onCloseEarnings,
  onRetryEarnings,
}: ProviderWorkspaceEarningsSectionProps) {
  return (
    <AeSection id="earnings" title="Earnings" description={PROVIDER_WORKSPACE_EARNINGS_COPY.connectionTitle}>
      <div className="grid gap-related rounded-card border border-border p-related">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{PROVIDER_WORKSPACE_EARNINGS_COPY.connectionTitle}</h3>
            <Badge variant={aeStatusToneVariants[payoutConnection.tone]}>{payoutConnection.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{payoutConnection.sentence}</p>
        </div>
        {payoutConnection.action === undefined ? null : (
          <Button type="button" variant="secondary" className="justify-self-start min-h-touch" onClick={onOpenEarnings}>
            {payoutConnection.action}
          </Button>
        )}
      </div>
      <Sheet open={earningsOpen} onOpenChange={(open) => { if (!open) onCloseEarnings() }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Earnings</SheetTitle>
            <SheetDescription>{PROVIDER_WORKSPACE_EARNINGS_COPY.connectionTitle}</SheetDescription>
          </SheetHeader>
          <div className="px-gutter pb-gutter">
            {earningsOpen ? (
              earningsPending
                ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div>
                : !earningsDetailAvailable
                  ? <UnavailableSummary title={PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable} retryLabel={PROVIDER_WORKSPACE_EARNINGS_COPY.retryAction} onRetry={onRetryEarnings} />
                  : (
                      <Alert>
                        <AlertTitle>{payoutConnection.label}</AlertTitle>
                        <AlertDescription>{payoutConnection.sentence}</AlertDescription>
                      </Alert>
                    )
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <a
        href={appDestination('settings').to}
        className={cn(buttonVariants({ variant: 'secondary' }), 'w-fit min-h-touch')}
      >
        Open Settings
      </a>
    </AeSection>
  )
}
