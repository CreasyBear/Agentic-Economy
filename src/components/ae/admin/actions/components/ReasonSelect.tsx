import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ADMIN_ACTION_SHEET_COPY, ADMIN_REASON_LABELS, ADMIN_REASON_OPTIONS, type ReasonSelectProps } from '../actions.contracts'

export function ReasonSelect({ action, value, onChange }: ReasonSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="admin-action-reason">{ADMIN_ACTION_SHEET_COPY.reason}</Label>
      <Select value={value} onValueChange={(next) => { if (next !== null) onChange(next) }}>
        <SelectTrigger id="admin-action-reason" className="min-h-touch w-full" aria-label={ADMIN_ACTION_SHEET_COPY.reason}>
          <SelectValue placeholder={ADMIN_ACTION_SHEET_COPY.selectReason} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ADMIN_REASON_OPTIONS[action].map((reason) => (
              <SelectItem key={reason} value={reason}>{ADMIN_REASON_LABELS[reason]}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
