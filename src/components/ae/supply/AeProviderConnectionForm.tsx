import { Link } from '@tanstack/react-router'
import type { FormEvent, RefObject } from 'react'

import { SettingsEmptyState, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Button } from '@/components/arc/button/button'
import { isAbsoluteHttpsResourceUrl } from '@/lib/operator/supply-compatibility'
import type { ProviderConnectionInspection } from '@/modules/capability-supply/provider-connection.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './ProviderConnectionFormComposition.css'

export type AeProviderConnectionFormProps = Readonly<{
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
}: AeProviderConnectionFormProps) {
  const urlInvalid = resourceUrl.trim().length > 0 && !isAbsoluteHttpsResourceUrl(resourceUrl)
  return (
    <div className="arc-market arc-provider-connection-form-region">
      {canConnect ? (
        <form className="arc-provider-connection-form" onSubmit={onSubmit}>
          <div className="arc-provider-connection-field">
            <label htmlFor="provider-x402-resource-url" className="text-sm font-medium text-foreground">x402 resource URL</label>
            <input
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
              aria-invalid={urlInvalid || undefined}
              aria-describedby={urlInvalid ? 'provider-x402-resource-url-error' : 'provider-x402-resource-url-hint'}
              required
              className="arc-provider-connection-input"
            />
            {urlInvalid ? <p id="provider-x402-resource-url-error" role="alert" className="text-sm text-destructive">Provide an absolute public HTTPS endpoint without credentials or a fragment.</p> : <p id="provider-x402-resource-url-hint" className="text-sm text-muted-foreground">Use the exact public route that returns HTTP 402 when called without payment.</p>}
          </div>
          <div className="arc-provider-connection-field arc-provider-connection-method">
            <label htmlFor="provider-x402-method" className="text-sm font-medium text-foreground">Request method</label>
            <select
              id="provider-x402-method"
              className="arc-provider-connection-input"
              value={method}
              disabled={busy !== undefined || fieldsLocked}
              onChange={(event) => onMethodChange(event.currentTarget.value === 'GET' ? 'GET' : 'POST')}
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
          <SettingsRow label="Environment" description="The environment used to inspect and verify this payment lane.">
            {environment}
          </SettingsRow>
          {inspection === undefined ? null : (
            <SettingsRow label="Observed payment lane" description="The exact challenge returned by this endpoint.">
              <div className="arc-provider-payment-lane">
                <span>Amount: {inspection.amount}</span>
                <span>Network: {inspection.network}</span>
                <span className="break-all">Asset: {inspection.asset}</span>
                <span className="break-all">Payee: {inspection.payTo}</span>
              </div>
            </SettingsRow>
          )}
          <div className="arc-provider-connection-form-actions">
            <Button
              type="button"
              variant="secondary"
              size="md"
              aria-busy={busy === 'inspect' || undefined}
              disabled={busy !== undefined || !isAbsoluteHttpsResourceUrl(resourceUrl)}
              onClick={onInspect}
            >
              {busy === 'inspect' ? 'Inspecting…' : 'Inspect endpoint'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              aria-busy={busy === 'claim' || undefined}
              disabled={busy !== undefined || inspection === undefined || claimSignature !== undefined}
              onClick={onProvePayeeControl}
            >
              {claimSignature !== undefined ? 'Payee control proved' : busy === 'claim' ? 'Waiting for wallet…' : 'Prove payee control'}
            </Button>
            <Button type="submit" variant="primary" size="md" aria-busy={busy === 'new' || undefined} disabled={busy !== undefined || refreshRequired || inspection === undefined || claimSignature === undefined}>
              {busy === 'new'
                ? reauthorizing ? 'Reauthorizing…' : 'Connecting…'
                : reauthorizing ? 'Reauthorize verified endpoint' : 'Connect verified endpoint'}
            </Button>
            {reauthorizing ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={busy !== undefined}
                onClick={onCancelReauthorization}
              >
                Cancel reauthorization
              </Button>
            ) : null}
          </div>
        </form>
      ) : readOnly ? null : (
        <SettingsEmptyState
          title="Provider identity is required to connect"
          description="Create an unpublished provider workspace, then return here to inspect and claim the x402 endpoint."
          action={
            <Link
              to="/owner/operations"
              className={actionLinkClassName('primary', 'md')}
            >
              Create provider workspace
            </Link>
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
          size="md"
          className="arc-provider-connection-refresh"
          disabled={busy !== undefined}
          onClick={onRefresh}
        >
          Reload current connections
        </Button>
      ) : null}
    </div>
  )
}
