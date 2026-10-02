import './CommandFieldsComposition.css'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ADMIN_ACTION_SHEET_COPY, ADMIN_REASON_LABELS, ADMIN_REASON_OPTIONS, type ReasonSelectProps } from '../actions.contracts'

export function ReasonSelect({ action, value, onChange }: ReasonSelectProps) {
  const selectedReason = ADMIN_REASON_OPTIONS[action].find((reason) => reason === value)
  return (
    <div className="arc-market arc-command-field">
      <Label className="arc-command-field-label" htmlFor="admin-action-reason">{ADMIN_ACTION_SHEET_COPY.reason}</Label>
      <Select value={value} onValueChange={(next) => { if (next !== null) onChange(next) }}>
        <SelectTrigger id="admin-action-reason" className="arc-command-field-select" aria-label={ADMIN_ACTION_SHEET_COPY.reason}>
          <SelectValue placeholder={ADMIN_ACTION_SHEET_COPY.selectReason}>{selectedReason === undefined ? undefined : ADMIN_REASON_LABELS[selectedReason]}</SelectValue>
        </SelectTrigger>
        <SelectContent className="arc-market arc-command-reason-menu">
          <SelectGroup>
            {ADMIN_REASON_OPTIONS[action].map((reason) => (
              <SelectItem className="arc-command-reason-option" key={reason} value={reason}>{ADMIN_REASON_LABELS[reason]}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
