import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { ConsentConnectionFieldsetProps } from '../authorize-form.contracts'
import '../ConsentComposition.css'

export function ConsentConnectionFieldset({
  pending,
  connectionTarget,
  replacementMode,
  replacementPrincipalRef,
  agentTargets,
  agentTargetsError,
  agentTargetsNextCursor,
  agentTargetsLoading,
  showConnectionFieldset,
  onSelectConnection,
  onSelectReplacement,
  onSelectReplacementMode,
  onLoadAgentTargets,
}: ConsentConnectionFieldsetProps) {
  if (!showConnectionFieldset) return null

  return (
    <fieldset className="arc-market arc-consent-fieldset" disabled={pending}>
      <legend className="arc-consent-fieldset-title">Connection</legend>
      <RadioGroup
        value={connectionTarget}
        onValueChange={(value) => onSelectConnection(value as 'new_agent' | 'replace_credential')}
        className="arc-consent-choice-grid"
      >
        <Label htmlFor="connection-new" className="arc-consent-choice">
          <RadioGroupItem id="connection-new" value="new_agent" className="mt-1" />
          <span className="arc-consent-choice-copy"><span className="arc-consent-choice-title">New agent</span><span className="arc-consent-choice-description">Create an independent agent identity.</span></span>
        </Label>
        <Label htmlFor="connection-replace" className="arc-consent-choice">
          <RadioGroupItem id="connection-replace" value="replace_credential" disabled={agentTargets.length === 0} className="mt-1" />
          <span className="arc-consent-choice-copy"><span className="arc-consent-choice-title">Replace credential</span><span className="arc-consent-choice-description">Keep one agent and rotate only its secret.</span></span>
        </Label>
      </RadioGroup>
      {connectionTarget === 'replace_credential' ? (
        <div className="arc-consent-field-group">
          <Label htmlFor="replacement-agent">Agent</Label>
          <Select
            value={replacementPrincipalRef ?? ''}
            onValueChange={(value) => { if (value != null) onSelectReplacement(value) }}
            items={agentTargets.map((agent) => ({ value: agent.principalRef, label: `${agent.displayName} · ${agent.principalRef}` }))}
          >
            <SelectTrigger id="replacement-agent" className="arc-consent-input"><SelectValue placeholder="Choose an agent" /></SelectTrigger>
            <SelectContent className="arc-market arc-consent-popup">
              {agentTargets.map((agent) => <SelectItem key={agent.principalRef} value={agent.principalRef}>{agent.displayName} · {agent.principalRef}</SelectItem>)}
            </SelectContent>
          </Select>
          {replacementPrincipalRef === undefined ? null : (
            <p className="arc-consent-reference">Selected Agent: {replacementPrincipalRef}</p>
          )}
          <fieldset className="arc-consent-field-group">
            <legend className="arc-consent-fieldset-title">Replacement reason</legend>
            <RadioGroup
              value={replacementMode}
              onValueChange={(value) => onSelectReplacementMode(value as 'planned' | 'compromise')}
              className="arc-consent-choice-grid"
            >
              <Label htmlFor="replacement-planned" className="arc-consent-choice">
                <RadioGroupItem id="replacement-planned" value="planned" className="mt-1" />
                <span className="arc-consent-choice-copy"><span className="arc-consent-choice-title">Planned rotation</span><span className="arc-consent-choice-description">Keep the current credential usable until the successor is delivered.</span></span>
              </Label>
              <Label htmlFor="replacement-compromise" className="arc-consent-choice">
                <RadioGroupItem id="replacement-compromise" value="compromise" className="mt-1" />
                <span className="arc-consent-choice-copy"><span className="arc-consent-choice-title">Suspected compromise</span><span className="arc-consent-choice-description">Revoke the current credential before issuing its successor.</span></span>
              </Label>
            </RadioGroup>
          </fieldset>
          <p className="arc-consent-description">The agent identity, activity, and credit history stay attached. {replacementMode === 'planned' ? 'Its current credential remains usable until the new one is delivered.' : 'Its current authority is revoked first and is never reactivated.'}</p>
        </div>
      ) : null}
      {agentTargetsError !== undefined || agentTargetsNextCursor !== undefined ? (
        <AeAlert role="alert" tone="info" title={agentTargetsError === undefined ? 'More agents are available' : 'Agent list needs refreshing'}><div className="arc-consent-field-group">
            {agentTargetsError === undefined ? 'Load the next page if the agent you want is not shown.' : agentTargetsError}
            <Button type="button" variant="secondary" className="arc-consent-inline-action" disabled={agentTargetsLoading} onClick={() => void onLoadAgentTargets()}>
              {agentTargetsLoading ? 'Loading agents…' : agentTargetsError === undefined ? 'Load more agents' : 'Retry agent list'}
            </Button>
          </div></AeAlert>
      ) : null}
    </fieldset>
  )
}
