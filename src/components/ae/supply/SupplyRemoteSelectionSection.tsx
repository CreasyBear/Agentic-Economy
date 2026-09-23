import type { Ref } from 'react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { SupplyMcpRemote } from '@/modules/capability-supply/source-preview'

const REMOTE_CARD_CLASS =
  'grid min-h-touch cursor-pointer grid-cols-[auto_1fr] items-start gap-3 rounded-md border border-border p-3 has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function SupplyRemoteSelectionSection({ remotes, value, disabled, headingRef, onChange, onContinue }: Readonly<{
  remotes: readonly SupplyMcpRemote[]
  value: string
  disabled: boolean
  headingRef?: Ref<HTMLHeadingElement>
  onChange: (value: string) => void
  onContinue: () => void
}>) {
  return (
    <AeSection title="Select MCP server" description="Choose the exact remote server Agentic Economy should inspect. Agentic Economy will not contact another server or fail over silently." {...(headingRef === undefined ? {} : { headingRef })}>
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
  return (
    <Field>
      <FieldLabel id="supply-native-remote-label">Remote MCP server</FieldLabel>
      <RadioGroup aria-labelledby="supply-native-remote-label" value={value} onValueChange={(val) => onChange(String(val))}>
        {remotes.map((remote) => {
          const inputId = `supply-remote-${remote.remoteRef}`
          return (
            <Label key={remote.remoteRef} htmlFor={inputId} className={REMOTE_CARD_CLASS}>
              <RadioGroupItem
                id={inputId}
                value={remote.remoteRef}
                className="mt-0.5"
                aria-label={`Select ${remote.name}`}
              />
              <span className="grid min-w-0">
                <span className="font-medium">{remote.name}</span>
                <span className="break-all text-sm text-muted-foreground">{remote.serverUrl}</span>
              </span>
            </Label>
          )
        })}
      </RadioGroup>
      <FieldDescription>Only this exact endpoint will be contacted.</FieldDescription>
    </Field>
  )
}
