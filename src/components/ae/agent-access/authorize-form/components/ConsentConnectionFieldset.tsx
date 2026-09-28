import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { AUTHORIZE_RADIO_CARD_CLASS, type ConsentConnectionFieldsetProps } from '../authorize-form.contracts'

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
    <fieldset className="grid gap-3" disabled={pending}>
      <legend className="text-sm font-medium text-foreground">Connection</legend>
      <RadioGroup
        value={connectionTarget}
        onValueChange={(value) => onSelectConnection(value as 'new_agent' | 'replace_credential')}
        className="grid gap-2 sm:grid-cols-2"
      >
        <Label htmlFor="connection-new" className={AUTHORIZE_RADIO_CARD_CLASS}>
          <RadioGroupItem id="connection-new" value="new_agent" className="mt-1" />
          <span><span className="block font-medium">New agent</span><span className="text-sm font-normal text-muted-foreground">Create an independent agent identity.</span></span>
        </Label>
        <Label htmlFor="connection-replace" className={AUTHORIZE_RADIO_CARD_CLASS}>
          <RadioGroupItem id="connection-replace" value="replace_credential" disabled={agentTargets.length === 0} className="mt-1" />
          <span><span className="block font-medium">Replace credential</span><span className="text-sm font-normal text-muted-foreground">Keep one agent and rotate only its secret.</span></span>
        </Label>
      </RadioGroup>
      {connectionTarget === 'replace_credential' ? (
        <div className="grid gap-2">
          <Label htmlFor="replacement-agent">Agent</Label>
          <Select
            value={replacementPrincipalRef ?? ''}
            onValueChange={(value) => { if (value != null) onSelectReplacement(value) }}
            items={agentTargets.map((agent) => ({ value: agent.principalRef, label: `${agent.displayName} · ${agent.principalRef}` }))}
          >
            <SelectTrigger id="replacement-agent"><SelectValue placeholder="Choose an agent" /></SelectTrigger>
            <SelectContent>
              {agentTargets.map((agent) => <SelectItem key={agent.principalRef} value={agent.principalRef}>{agent.displayName} · {agent.principalRef}</SelectItem>)}
            </SelectContent>
          </Select>
          {replacementPrincipalRef === undefined ? null : (
            <p className="break-all font-mono text-xs text-muted-foreground">Selected Agent: {replacementPrincipalRef}</p>
          )}
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-foreground">Replacement reason</legend>
            <RadioGroup
              value={replacementMode}
              onValueChange={(value) => onSelectReplacementMode(value as 'planned' | 'compromise')}
              className="grid gap-2 sm:grid-cols-2"
            >
              <Label htmlFor="replacement-planned" className={AUTHORIZE_RADIO_CARD_CLASS}>
                <RadioGroupItem id="replacement-planned" value="planned" className="mt-1" />
                <span><span className="block font-medium">Planned rotation</span><span className="text-sm font-normal text-muted-foreground">Keep the current credential usable until the successor is delivered.</span></span>
              </Label>
              <Label htmlFor="replacement-compromise" className={AUTHORIZE_RADIO_CARD_CLASS}>
                <RadioGroupItem id="replacement-compromise" value="compromise" className="mt-1" />
                <span><span className="block font-medium">Suspected compromise</span><span className="text-sm font-normal text-muted-foreground">Revoke the current credential before issuing its successor.</span></span>
              </Label>
            </RadioGroup>
          </fieldset>
          <p className="text-sm text-muted-foreground">The agent identity, activity, and credit history stay attached. {replacementMode === 'planned' ? 'Its current credential remains usable until the new one is delivered.' : 'Its current authority is revoked first and is never reactivated.'}</p>
        </div>
      ) : null}
      {agentTargetsError !== undefined || agentTargetsNextCursor !== undefined ? (
        <Alert>
          <AlertTitle>{agentTargetsError === undefined ? 'More agents are available' : 'Agent list needs refreshing'}</AlertTitle>
          <AlertDescription className="grid gap-2">
            {agentTargetsError === undefined ? 'Load the next page if the agent you want is not shown.' : agentTargetsError}
            <Button type="button" variant="secondary" className="w-fit" disabled={agentTargetsLoading} onClick={() => void onLoadAgentTargets()}>
              {agentTargetsLoading ? 'Loading agents…' : agentTargetsError === undefined ? 'Load more agents' : 'Retry agent list'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </fieldset>
  )
}
