import { Link } from '@tanstack/react-router'
import type { FormEvent, RefObject } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ProviderConnectionInspection = Readonly<{
  digest: string
  payTo: string
  amount: string
  network: string
  asset: string
  claimMessage: string
  claimExpiresAt: number
}>

export function AeProviderConnectionForm({
  canConnect,
  readOnly,
  resourceUrl,
  method,
  environment,
  inspection,
  claimSignature,
  busy,
  refreshRequired,
  reauthorizing,
  fieldsLocked,
  resourceUrlInputRef,
  onResourceUrlChange,
  onMethodChange,
  onSubmit,
  onInspect,
  onProvePayeeControl,
  onCancelReauthorization,
  notice,
  onRefresh,
}: Readonly<{
  canConnect: boolean
  readOnly: boolean
  resourceUrl: string
  method: 'GET' | 'POST'
  environment: string
  inspection?: ProviderConnectionInspection
  claimSignature?: string
  busy?: string
  refreshRequired: boolean
  reauthorizing: boolean
  fieldsLocked: boolean
  resourceUrlInputRef: RefObject<HTMLInputElement | null>
  onResourceUrlChange: (value: string) => void
  onMethodChange: (value: 'GET' | 'POST') => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onInspect: () => void
  onProvePayeeControl: () => void
  onCancelReauthorization: () => void
  notice?: Readonly<{ kind: 'error' | 'status'; text: string }>
  onRefresh: () => void
}>) {
  return (
    <>
      {canConnect ? (
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <label htmlFor="provider-x402-resource-url" className="text-sm font-medium text-foreground">x402 resource URL</label>
            <Input
              ref={resourceUrlInputRef}
              id="provider-x402-resource-url"
              name="resourceUrl"
              type="url"
              inputMode="url"
              autoComplete="url"
              maxLength={2_048}
              placeholder="https://api.example.com/paid-operation"
              value={resourceUrl}
              readOnly={fieldsLocked}
              onChange={(event) => onResourceUrlChange(event.target.value)}
              aria-describedby="provider-x402-resource-url-hint"
              required
            />
            <p id="provider-x402-resource-url-hint" className="text-sm text-muted-foreground">Use the exact public route that returns HTTP 402 when called without payment.</p>
          </div>
          <div className="grid max-w-40 gap-1.5">
            <label htmlFor="provider-x402-method" className="text-sm font-medium text-foreground">Request method</label>
            <select
              id="provider-x402-method"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={method}
              disabled={busy !== undefined || fieldsLocked}
              onChange={(event) => onMethodChange(event.currentTarget.value === 'GET' ? 'GET' : 'POST')}
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
          <p className="text-sm text-muted-foreground">Environment: {environment}</p>
          {inspection === undefined ? null : (
            <Alert>
              <AlertTitle>Exact payment lane observed</AlertTitle>
              <AlertDescription className="grid gap-1">
                <span>Amount: {inspection.amount}</span>
                <span>Network: {inspection.network}</span>
                <span className="break-all">Asset: {inspection.asset}</span>
                <span className="break-all">Payee: {inspection.payTo}</span>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch"
              disabled={busy !== undefined || resourceUrl.trim().length === 0}
              onClick={onInspect}
            >
              {busy === 'inspect' ? 'Inspecting…' : 'Inspect endpoint'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch"
              disabled={busy !== undefined || inspection === undefined || claimSignature !== undefined}
              onClick={onProvePayeeControl}
            >
              {claimSignature !== undefined ? 'Payee control proved' : busy === 'claim' ? 'Waiting for wallet…' : 'Prove payee control'}
            </Button>
            <Button type="submit" className="min-h-touch" disabled={busy !== undefined || refreshRequired || inspection === undefined || claimSignature === undefined}>
              {busy === 'new'
                ? reauthorizing ? 'Reauthorizing…' : 'Connecting…'
                : reauthorizing ? 'Reauthorize verified endpoint' : 'Connect verified endpoint'}
            </Button>
            {reauthorizing ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-touch"
                disabled={busy !== undefined}
                onClick={onCancelReauthorization}
              >
                Cancel reauthorization
              </Button>
            ) : null}
          </div>
        </form>
      ) : readOnly ? null : (
        <AeEmptyState
          title="Provider identity is required to connect"
          description="Create an unpublished provider workspace, then return here to inspect and claim the x402 endpoint."
          action={
            <Button asChild className="min-h-touch">
              <Link to="/owner/offerings">Create provider workspace</Link>
            </Button>
          }
        />
      )}
      <p
        role={notice?.kind === 'error' ? 'alert' : 'status'}
        className={notice?.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
      >
        {notice?.text ?? ''}
      </p>
      {refreshRequired ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-touch justify-self-start"
          disabled={busy !== undefined}
          onClick={onRefresh}
        >
          Reload current connections
        </Button>
      ) : null}
    </>
  )
}
