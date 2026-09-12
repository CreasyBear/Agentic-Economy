import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { SupplyMcpRemote } from '@/modules/capability-supply/source-preview'

export function SupplyRemoteSelectionSection({ remotes, value, disabled, onChange, onContinue }: Readonly<{
  remotes: readonly SupplyMcpRemote[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onContinue: () => void
}>) {
  return (
    <AeSection title="Select MCP server" description="Choose the exact remote server AE should inspect. AE will not contact another server or fail over silently.">
      <FieldGroup className="gap-4">
        <RemoteSelectionField remotes={remotes} value={value} onChange={onChange} />
        <Button type="button" className="min-h-touch justify-self-start" disabled={disabled || value === ''} onClick={onContinue}>
          Continue with selected server
        </Button>
      </FieldGroup>
    </AeSection>
  )
}

function RemoteSelectionField({ remotes, value, onChange }: Readonly<{ remotes: readonly SupplyMcpRemote[]; value: string; onChange: (value: string) => void }>) {
  return <Field><FieldLabel>Remote MCP server</FieldLabel><RadioGroup value={value} onValueChange={onChange}>{remotes.map((remote) => <Label key={remote.remoteRef} className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value={remote.remoteRef} aria-label={`Select ${remote.name}`} /><span className="grid min-w-0"><span className="font-medium">{remote.name}</span><span className="break-all text-sm text-muted-foreground">{remote.serverUrl}</span></span></Label>)}</RadioGroup><FieldDescription>Only this exact endpoint will be contacted.</FieldDescription></Field>
}
