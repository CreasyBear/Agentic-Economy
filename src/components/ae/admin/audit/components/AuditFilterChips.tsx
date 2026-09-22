import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AUDIT_COPY,
  AUDIT_EVENT_TYPES,
  type AuditFilterChipsProps,
} from '../audit.contracts'

export function AuditFilterChips({
  chips,
  draft,
  onDraftChange,
  onApply,
  onRemove,
  onClear,
}: AuditFilterChipsProps) {
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
              <span className="max-w-64 truncate text-muted-foreground">{chip.value}</span>
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          ))}
          <Button type="button" variant="ghost" onClick={onClear}>{AUDIT_COPY.clearAll}</Button>
        </div>
      )}

      <form
        className="grid gap-related rounded-lg border border-border p-gutter md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
          onApply()
        }}
      >
        <div className="grid gap-intra">
          <Label htmlFor="audit-event-type">{AUDIT_COPY.fieldLabels.eventType}</Label>
          <select
            id="audit-event-type"
            name="eventType"
            value={draft.eventType}
            onChange={(event) => onDraftChange('eventType', event.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
          >
            <option value="">{AUDIT_COPY.anyEventType}</option>
            {AUDIT_EVENT_TYPES.map((eventType) => (
              <option key={eventType} value={eventType}>{eventType}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-intra">
          <Label htmlFor="audit-actor-ref">{AUDIT_COPY.fieldLabels.actorRef}</Label>
          <Input id="audit-actor-ref" name="actorRef" value={draft.actorRef} onChange={(event) => onDraftChange('actorRef', event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="grid gap-intra">
          <Label htmlFor="audit-target-type">{AUDIT_COPY.fieldLabels.targetType}</Label>
          <Input id="audit-target-type" name="targetType" value={draft.targetType} onChange={(event) => onDraftChange('targetType', event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="grid gap-intra">
          <Label htmlFor="audit-target-ref">{AUDIT_COPY.fieldLabels.targetRef}</Label>
          <Input id="audit-target-ref" name="targetRef" value={draft.targetRef} onChange={(event) => onDraftChange('targetRef', event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="grid gap-intra">
          <Label htmlFor="audit-correlation-id">{AUDIT_COPY.fieldLabels.correlationId}</Label>
          <Input id="audit-correlation-id" name="correlationId" value={draft.correlationId} onChange={(event) => onDraftChange('correlationId', event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="grid gap-intra">
          <Label htmlFor="audit-from">{AUDIT_COPY.fieldLabels.from}</Label>
          <Input id="audit-from" name="from" type="date" value={draft.from} onChange={(event) => onDraftChange('from', event.target.value)} autoComplete="off" />
        </div>
        <div className="grid gap-intra">
          <Label htmlFor="audit-to">{AUDIT_COPY.fieldLabels.to}</Label>
          <Input id="audit-to" name="to" type="date" value={draft.to} onChange={(event) => onDraftChange('to', event.target.value)} autoComplete="off" />
        </div>
        <Button type="submit" className="self-end">{AUDIT_COPY.applyFilters}</Button>
      </form>
    </div>
  )
}
