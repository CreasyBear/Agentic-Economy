'use client'

import { useEffect, useMemo, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { AUD_EXPONENT, canonicalAudUnits, formatDisplayAmount } from '@/modules/money/public'
import { audInputTextFromUnits } from './credit-top-up-format'

export interface AeMonthlySpendCeilingCardProps {
  settings?: {
    enabled: boolean
    ceilingUnits: string
    revision: number
  }
  monthSpend?: {
    kind: 'available' | 'empty' | 'unavailable'
    spendUnits?: string
  }
  onSave: (data: {
    enabled: boolean
    ceilingUnits: string
    expectedRevision: number
  }) => Promise<void> | void
}

function utilizationPercent(spendUnits: bigint, ceilingUnits: bigint): number {
  if (ceilingUnits <= 0n) return spendUnits > 0n ? 100 : 0
  const basisPoints = (spendUnits * 10_000n) / ceilingUnits
  const wholePercent = Number(basisPoints / 100n)
  const fraction = Number(basisPoints % 100n)
  return fraction >= 50 ? Math.min(100, wholePercent + 1) : Math.min(100, wholePercent)
}

export function AeMonthlySpendCeilingCard({
  settings,
  monthSpend,
  onSave,
}: AeMonthlySpendCeilingCardProps) {
  const resolvedSettings = settings ?? { enabled: false, ceilingUnits: '0', revision: 0 }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [enabled, setEnabled] = useState(resolvedSettings.enabled)
  const [ceilingText, setCeilingText] = useState(
    () => audInputTextFromUnits(BigInt(resolvedSettings.ceilingUnits)),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(resolvedSettings.enabled)
    setCeilingText(audInputTextFromUnits(BigInt(resolvedSettings.ceilingUnits)))
  }, [resolvedSettings.enabled, resolvedSettings.ceilingUnits])

  const spendUnits = useMemo(() => {
    if (monthSpend?.kind !== 'available' || monthSpend.spendUnits === undefined) return 0n
    return BigInt(monthSpend.spendUnits)
  }, [monthSpend])

  const ceilingUnits = BigInt(resolvedSettings.ceilingUnits)
  const percent = utilizationPercent(spendUnits, ceilingUnits)

  const spendFormatted = formatDisplayAmount({
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    units: spendUnits.toString(),
  })
  const ceilingFormatted = formatDisplayAmount({
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    units: resolvedSettings.ceilingUnits,
  })

  async function handleSave() {
    const nextCeilingUnits = canonicalAudUnits(ceilingText)
    if (nextCeilingUnits === undefined) return
    setSaving(true)
    try {
      await onSave({
        enabled,
        ceilingUnits: nextCeilingUnits.toString(),
        expectedRevision: resolvedSettings.revision,
      })
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 p-4">
      <div>
        <h3 className="font-medium">Organization monthly spending cap</h3>
        {!resolvedSettings.enabled ? (
          <p className="text-sm text-muted-foreground">
            No monthly spending limit is set for this workspace. Calls are bounded only by available prepaid balance and individual agent policies.
          </p>
        ) : null}
      </div>

      {resolvedSettings.enabled ? (
        <div className="grid gap-3">
          <p className="text-sm">
            {spendFormatted} spent of {ceilingFormatted} ({percent}%)
          </p>
          <Progress value={percent} />
          {percent >= 80 && percent < 100 ? (
            <Alert>
              <AlertTitle>Approaching monthly limit ({percent}%)</AlertTitle>
            </Alert>
          ) : null}
          {percent >= 100 ? (
            <Alert variant="destructive">
              <AlertTitle>Monthly spending limit reached</AlertTitle>
              <AlertDescription>
                Paid Calls are paused until next month or the cap is raised.
              </AlertDescription>
            </Alert>
          ) : null}
          {monthSpend?.kind === 'unavailable' ? (
            <Alert>
              <AlertDescription>Monthly spend data is unavailable.</AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDialogOpen(true)}
        >
          {resolvedSettings.enabled ? 'Edit Limit' : 'Set Limit'}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organization monthly spending cap</DialogTitle>
            <DialogDescription>
              Set a workspace-wide monthly limit for paid Calls. Agent spending policies still apply.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Monthly spending cap</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Monthly spending cap"
              className="relative inline-flex h-6 w-11 shrink-0 rounded-full border border-input bg-muted transition-colors data-[state=on]:bg-primary"
              data-state={enabled ? 'on' : 'off'}
              onClick={() => setEnabled((current) => !current)}
            >
              <span
                className="pointer-events-none block size-5 translate-x-0.5 rounded-full border border-border bg-background shadow-none transition-transform data-[state=on]:translate-x-[1.375rem]"
                data-state={enabled ? 'on' : 'off'}
              />
            </button>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="monthly-spend-ceiling-cap">Monthly cap (AUD)</Label>
            <Input
              id="monthly-spend-ceiling-cap"
              inputMode="decimal"
              value={ceilingText}
              onChange={(event) => setCeilingText(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" disabled={saving} onClick={() => { void handleSave() }}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
