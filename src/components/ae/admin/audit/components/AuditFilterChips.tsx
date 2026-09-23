import { useState } from 'react'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AUDIT_COPY, AUDIT_EVENT_TYPES, type AuditFilterChipsProps, type AdminAuditFilterDraft } from '../audit.contracts'
import { auditEventLabel } from './audit-labels'

const filterFields = [
  'eventType', 'actorRef', 'targetType', 'targetRef', 'correlationId', 'from', 'to',
] as const satisfies readonly (keyof AdminAuditFilterDraft)[]

export function AuditFilterChips({
  chips, draft, onDraftChange, onApply, onRemove, onClear,
}: AuditFilterChipsProps) {
  const [activeField, setActiveField] = useState<keyof AdminAuditFilterDraft | null>(null)
  const [eventPickerOpen, setEventPickerOpen] = useState(false)

  return (
    <div className="grid gap-related">
      {chips.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-intra" aria-label={AUDIT_COPY.filtersTitle}>
          {chips.map((chip) => (
            <button
              key={`${chip.key}:${chip.value}`}
              type="button"
              onClick={() => onRemove(chip.key)}
              aria-label={`${AUDIT_COPY.removeFilter}: ${chip.label}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-medium">{chip.label}</span>
              <span className="max-w-64 truncate text-muted-foreground">{chip.key === 'eventType' ? auditEventLabel(chip.value) : chip.value}</span>
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          ))}
          <Button type="button" variant="ghost" onClick={onClear}>{AUDIT_COPY.clearAll}</Button>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" className="w-fit min-h-touch" />}>
          {AUDIT_COPY.addFilter}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {filterFields.map((field) => (
              <DropdownMenuItem
                key={field}
                onClick={() => {
                  setActiveField(field)
                  if (field === 'eventType') setEventPickerOpen(true)
                }}
              >
                {AUDIT_COPY.fieldLabels[field]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeField === null ? null : (
        <form
          className="flex flex-wrap items-end gap-related rounded-lg border border-border p-gutter"
          onSubmit={(event) => {
            event.preventDefault()
            onApply()
            setActiveField(null)
          }}
        >
          <div className="grid min-w-48 flex-1 gap-intra">
            <Label htmlFor={`audit-${activeField}`}>{AUDIT_COPY.fieldLabels[activeField]}</Label>
            {activeField === 'eventType' ? (
              <Button id="audit-eventType" type="button" variant="outline" className="w-full justify-start" onClick={() => setEventPickerOpen(true)}>
                {draft.eventType === '' ? AUDIT_COPY.anyEventType : auditEventLabel(draft.eventType)}
              </Button>
            ) : (
              <Input
                id={`audit-${activeField}`}
                name={activeField}
                type={activeField === 'from' || activeField === 'to' ? 'date' : 'text'}
                value={draft[activeField]}
                onChange={(event) => onDraftChange(activeField, event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </div>
          <Button type="submit">{AUDIT_COPY.applyFilters}</Button>
        </form>
      )}

      <CommandDialog
        open={eventPickerOpen}
        onOpenChange={setEventPickerOpen}
        title={AUDIT_COPY.fieldLabels.eventType}
        description={AUDIT_COPY.filtersDescription}
      >
        <CommandInput aria-label={AUDIT_COPY.fieldLabels.eventType} placeholder={AUDIT_COPY.fieldLabels.eventType} />
        <CommandList>
          <CommandEmpty>{AUDIT_COPY.noEventTypes}</CommandEmpty>
          <CommandGroup>
            <CommandItem value={AUDIT_COPY.anyEventType} onSelect={() => {
              onDraftChange('eventType', '')
              setEventPickerOpen(false)
            }}>{AUDIT_COPY.anyEventType}</CommandItem>
            {AUDIT_EVENT_TYPES.map((eventType) => (
              <CommandItem key={eventType} value={`${auditEventLabel(eventType)} ${eventType}`} onSelect={() => {
                onDraftChange('eventType', eventType)
                setEventPickerOpen(false)
              }}>
                <span>{auditEventLabel(eventType)}</span>
                <code className="ml-auto font-mono text-xs text-muted-foreground">{eventType}</code>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
