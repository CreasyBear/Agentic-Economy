import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsEmptyState, SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { paymentCardBrandLabel, type ExpiryBadgeKind, type SavedPaymentMethodsSummary } from '@/modules/money/saved-payment-methods.view-model'

export type AeSavedPaymentMethodsCardProps = Readonly<{
  summary?: SavedPaymentMethodsSummary
  isLoading?: boolean
  expiryKind?: ExpiryBadgeKind | null
}>

export function AeSavedPaymentMethodsCard({ summary, isLoading = false, expiryKind }: AeSavedPaymentMethodsCardProps) {
  return <SettingsGroup title="Saved cards" description="Stripe stores card details securely; they never touch our servers.">
    {isLoading ? <SettingsRow label="Default card" description="Loading your saved payment method">
      <Skeleton role="status" aria-label="Loading payment methods" className="h-10 w-40" />
    </SettingsRow> : summary?.kind === 'ready' && summary.hasPaymentMethod ? <SettingsRow
      label="Default card"
      description="Used for automatic credit recharge when enabled. Add, remove or change the default in Stripe."
    >
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Badge variant="secondary">{paymentCardBrandLabel(summary.card.brand)}</Badge>
        <span className="font-mono tabular-nums">•••• {summary.card.last4}</span>
        <span className="font-mono tabular-nums text-muted-foreground">Expires {String(summary.card.expMonth).padStart(2, '0')}/{String(summary.card.expYear).slice(-2)}</span>
        {summary.card.isDefault && <Badge variant="outline">Default</Badge>}
        {expiryKind === 'expired' && <Badge variant="destructive">Expired</Badge>}
        {expiryKind === 'expires_soon' && <Badge variant="outline">Expires soon</Badge>}
      </div>
    </SettingsRow> : <SettingsEmptyState title="No saved card" description="Add a card in Stripe to enable automatic credit recharge." />}
  </SettingsGroup>
}
