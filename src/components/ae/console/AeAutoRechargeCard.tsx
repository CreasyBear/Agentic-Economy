'use client'

import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { canonicalAudUnits } from '@/modules/money/public'
import { audInputTextFromUnits } from './credit-top-up-format'

export type AeAutoRechargeCardProps = Readonly<{
  settings: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    revision: number
  }>
  mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
  pendingTopup?: Readonly<{ commandRef: string }> | null
  onSave: (payload: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    expectedRevision: number
  }>) => void | Promise<void>
}>

export function AeAutoRechargeCard({
  settings,
  mandateState,
  pendingTopup,
  onSave,
}: AeAutoRechargeCardProps) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [thresholdText, setThresholdText] = useState(
    () => audInputTextFromUnits(BigInt(settings.thresholdUnits)),
  )
  const [rechargeText, setRechargeText] = useState(
    () => audInputTextFromUnits(BigInt(settings.rechargeAmountUnits)),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(settings.enabled)
    setThresholdText(audInputTextFromUnits(BigInt(settings.thresholdUnits)))
    setRechargeText(audInputTextFromUnits(BigInt(settings.rechargeAmountUnits)))
  }, [settings.enabled, settings.thresholdUnits, settings.rechargeAmountUnits])

  const mandateBlocksEnable = mandateState === 'missing' || mandateState === 'failed'

  async function handleSave() {
    const thresholdUnits = canonicalAudUnits(thresholdText)
    const rechargeAmountUnits = canonicalAudUnits(rechargeText)
    if (thresholdUnits === undefined || rechargeAmountUnits === undefined) return
    setSaving(true)
    try {
      await onSave({
        enabled,
        thresholdUnits: thresholdUnits.toString(),
        rechargeAmountUnits: rechargeAmountUnits.toString(),
        expectedRevision: settings.revision,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 p-4">
      <div>
        <h3 className="font-medium">Auto-recharge</h3>
        <p className="text-sm text-muted-foreground">
          When balance falls below the threshold, automatically add credit using the default payment method.
        </p>
      </div>

      {mandateBlocksEnable ? (
        <Alert>
          <AlertDescription>
            <a href="/owner/credit" className="font-medium underline">
              Add payment method
            </a>
            {' '}before enabling auto-recharge.
          </AlertDescription>
        </Alert>
      ) : null}

      {pendingTopup ? (
        <Alert>
          <AlertDescription>Top-up in progress. Auto-recharge waits until it completes.</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">Auto-recharge</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Auto-recharge"
          disabled={mandateBlocksEnable}
          className="relative inline-flex h-6 w-11 shrink-0 rounded-full border border-input bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-primary"
          data-state={enabled ? 'on' : 'off'}
          onClick={() => {
            if (mandateBlocksEnable) return
            setEnabled((current) => !current)
          }}
        >
          <span
            className="pointer-events-none block size-5 translate-x-0.5 rounded-full border border-border bg-background shadow-none transition-transform data-[state=on]:translate-x-[1.375rem]"
            data-state={enabled ? 'on' : 'off'}
          />
        </button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="auto-recharge-threshold">Low balance threshold (AUD)</Label>
        <Input
          id="auto-recharge-threshold"
          inputMode="decimal"
          value={thresholdText}
          onChange={(event) => setThresholdText(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="auto-recharge-amount">Recharge amount (AUD)</Label>
        <Input
          id="auto-recharge-amount"
          inputMode="decimal"
          value={rechargeText}
          onChange={(event) => setRechargeText(event.target.value)}
        />
      </div>

      <Button type="button" disabled={saving} onClick={() => { void handleSave() }}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
