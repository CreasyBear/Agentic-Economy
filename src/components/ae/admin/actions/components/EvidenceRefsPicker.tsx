import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ADMIN_ACTION_SHEET_COPY, type EvidenceRefsPickerProps } from '../actions.contracts'

export function EvidenceRefsPicker({ targetRefs, selected, typedEvidence, onToggle, onType, readOnly = false }: EvidenceRefsPickerProps) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="font-medium">{ADMIN_ACTION_SHEET_COPY.evidence}</legend>
      {targetRefs.map(({ label, value }) => (
        <div key={`${label}:${value}`} className="flex items-center gap-2">
          <label className="flex min-h-touch items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              checked={selected.includes(value)}
              disabled={readOnly}
              onChange={(event) => onToggle(value, event.currentTarget.checked)}
            />
            <span>{label}</span>
          </label>
          <AeCopyReference label={label} value={value} />
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-action-evidence">{ADMIN_ACTION_SHEET_COPY.otherEvidence}</Label>
        <Input
          id="admin-action-evidence"
          value={typedEvidence}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          readOnly={readOnly}
          onChange={(event) => onType(event.currentTarget.value)}
        />
      </div>
      <p className="text-sm text-muted-foreground">{ADMIN_ACTION_SHEET_COPY.selectEvidence}</p>
    </fieldset>
  )
}
