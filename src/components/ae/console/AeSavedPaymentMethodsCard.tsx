'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export type SavedPaymentMethodsSummary =
  | Readonly<{ kind: 'missing'; hasPaymentMethod: false }>
  | Readonly<{
      kind: 'ready'
      hasPaymentMethod: true
      card: Readonly<{
        brand: string
        last4: string
        expMonth: number
        expYear: number
        isDefault?: boolean
      }>
    }>

export interface AeSavedPaymentMethodsCardProps {
  summary?: SavedPaymentMethodsSummary
  isLoading?: boolean
  onManage: () => Promise<{ portalUrl?: string } | void> | void
}

function formatCardBrand(brand: string): string {
  const normalized = brand.trim()
  if (normalized.length === 0) return 'Card'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
}

function formatExpiry(expMonth: number, expYear: number): string {
  const month = String(expMonth).padStart(2, '0')
  const year = String(expYear).slice(-2)
  return `${month}/${year}`
}

export function AeSavedPaymentMethodsCard({
  summary,
  isLoading = false,
  onManage,
}: AeSavedPaymentMethodsCardProps) {
  const [managing, setManaging] = useState(false)

  async function handleManage() {
    if (managing) return
    setManaging(true)
    try {
      const result = await onManage()
      if (result !== undefined && result !== null && typeof result.portalUrl === 'string') {
        window.location.assign(result.portalUrl)
      }
    } finally {
      setManaging(false)
    }
  }

  if (isLoading) {
    return (
      <div
        className="grid gap-3 rounded-xl border border-border/70 p-4"
        aria-busy="true"
        role="status"
        aria-label="Loading payment methods"
      >
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-9 w-28" />
      </div>
    )
  }

  const ready = summary?.kind === 'ready' && summary.hasPaymentMethod

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 p-4">
      <div>
        <h3 className="font-medium">Payment methods</h3>
        {ready ? null : (
          <p className="text-sm text-muted-foreground">No saved payment methods on file.</p>
        )}
      </div>

      {ready ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{formatCardBrand(summary.card.brand)}</p>
            <Badge variant="secondary">Default</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Ending in {summary.card.last4}</p>
          <p className="text-sm text-muted-foreground">
            Expires {formatExpiry(summary.card.expMonth, summary.card.expYear)}
          </p>
          <Button type="button" variant="secondary" disabled={managing} onClick={() => { void handleManage() }}>
            {managing ? 'Opening…' : 'Manage in Stripe'}
          </Button>
        </div>
      ) : (
        <Button type="button" disabled={managing} onClick={() => { void handleManage() }}>
          {managing ? 'Opening…' : 'Add card'}
        </Button>
      )}
    </div>
  )
}
