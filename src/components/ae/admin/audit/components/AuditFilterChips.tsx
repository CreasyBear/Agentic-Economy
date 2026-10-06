import { useState } from 'react'

import { Button } from '@/components/arc/button/button'
import { AeActionLink } from '@/components/ae/shared/action-link/AeActionLink'
import { FilterToolbar, type FilterChip } from '@/components/arc/filter-toolbar/filter-toolbar'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { AUDIT_COPY, AUDIT_EVENT_TYPES, type AuditFilterChipsProps, type AdminAuditFilterDraft } from '../audit.contracts'
import { auditEventLabel } from './audit-labels'
import './AuditScopesComposition.css'

const filterFields = [
  'eventType', 'actorRef', 'targetType', 'targetRef', 'correlationId', 'from', 'to',
] as const satisfies readonly (keyof AdminAuditFilterDraft)[]

export function AuditFilterChips({
  chips, draft, onDraftChange, onApply, onRemove, onClear,
}: AuditFilterChipsProps) {
  const [activeField, setActiveField] = useState<keyof AdminAuditFilterDraft | null>(null)
  const [eventPickerOpen, setEventPickerOpen] = useState(false)
  const appliedFilters: FilterChip[] = chips.map((chip) => ({
    id: chip.key,
    label: chip.label,
    value: chip.key === 'eventType' ? auditEventLabel(chip.value) : chip.value,
  }))

  return (
    <div className="arc-market arc-audit-scopes">
      <FilterToolbar
        filters={appliedFilters}
        label={AUDIT_COPY.filtersTitle}
        onRemove={(id) => {
          const chip = chips.find((candidate) => candidate.key === id)
          if (chip) onRemove(chip.key)
        }}
        onClearAll={onClear}
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="secondary" size="md" data-filter-trigger="" />}>
            {AUDIT_COPY.addFilter}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="arc-market arc-audit-filter-menu">
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
      </FilterToolbar>

      {activeField === null ? null : (
        <form
          className="arc-audit-scope-editor"
          onSubmit={(event) => {
            event.preventDefault()
            onApply()
            setActiveField(null)
          }}
        >
          <div className="arc-audit-scope-field">
            <Label htmlFor={`audit-${activeField}`}>{AUDIT_COPY.fieldLabels[activeField]}</Label>
            {activeField === 'eventType' ? (
              <AeActionLink id="audit-eventType" type="button" variant="secondary" size="md" labelLayout="start" className="arc-audit-scope-event" onAction={() => setEventPickerOpen(true)}>
                {draft.eventType === '' ? AUDIT_COPY.anyEventType : auditEventLabel(draft.eventType)}
              </AeActionLink>
            ) : (
              <input
                className="arc-audit-scope-input"
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
          <Button type="submit" size="md">{AUDIT_COPY.applyFilters}</Button>
        </form>
      )}

      <CommandDialog
        className="arc-market arc-audit-event-picker"
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
                <code className="arc-audit-event-code">{eventType}</code>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
