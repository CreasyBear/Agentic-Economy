import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SUPPLY_SOURCE_TYPE_COPY } from '@/content/reason-copy'
import { cn } from '@/lib/utils'
import { TACTILE } from '../../supply-source-native-start-presentation'
import type { SourceTypeChooserProps } from '../supply-source-type.contracts'

export function SourceTypeChooser({ sourceKind, disabled, onSourceKindChange }: SourceTypeChooserProps) {
  return (
    <Field>
      <FieldLabel>Source type</FieldLabel>
      <Button
        type="button"
        variant={sourceKind === 'x402' ? 'secondary' : 'outline'}
        className={cn('h-auto w-full justify-start whitespace-normal p-4 text-left', TACTILE)}
        aria-pressed={sourceKind === 'x402'}
        disabled={disabled}
        onClick={() => onSourceKindChange('x402')}
      >
        <span className="grid gap-1">
          <span className="font-medium">x402 <span className="text-xs text-muted-foreground">Recommended for alpha</span></span>
          <span className="font-normal text-muted-foreground">Use an endpoint that already publishes its payment terms.</span>
        </span>
      </Button>
      <Collapsible defaultOpen={sourceKind !== 'x402'}>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className={cn('w-fit min-h-touch', TACTILE)}
              disabled={disabled}
            >
              Other source types
            </Button>
          }
        />
        <CollapsibleContent className="pt-2">
          <Tabs value={sourceKind} onValueChange={onSourceKindChange}>
            <TabsList className="max-w-full overflow-x-auto" aria-label="Other source types">
              <TabsTrigger value="openapi" disabled={disabled} className={TACTILE}>OpenAPI</TabsTrigger>
              <TabsTrigger value="mcp" disabled={disabled} className={TACTILE}>MCP</TabsTrigger>
              <TabsTrigger value="agent_plugin" disabled={disabled} className={TACTILE}>Agent Plugin</TabsTrigger>
            </TabsList>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
      <FieldDescription>{SUPPLY_SOURCE_TYPE_COPY[sourceKind]}</FieldDescription>
    </Field>
  )
}
