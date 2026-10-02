import './CommandFieldsComposition.css'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Label } from '@/components/ui/label'
import { ADMIN_ACTION_SHEET_COPY, type EvidenceRefsPickerProps } from '../actions.contracts'

export function EvidenceRefsPicker({ targetRefs, selected, typedEvidence, onToggle, onType, readOnly = false }: EvidenceRefsPickerProps) {
  return (
    <fieldset className="arc-market arc-command-evidence">
      <legend className="arc-command-field-label">{ADMIN_ACTION_SHEET_COPY.evidence}</legend>
      {targetRefs.map(({ label, value }) => (
        <div key={`${label}:${value}`} className="arc-command-evidence-row">
          <label className="arc-command-evidence-label">
            <input
              type="checkbox"
              className="arc-command-evidence-checkbox"
              checked={selected.includes(value)}
              disabled={readOnly}
              onChange={(event) => onToggle(value, event.currentTarget.checked)}
            />
            <span>{label}</span>
          </label>
          <AeCopyReference label={label} value={value} />
        </div>
      ))}
      <div className="arc-command-field">
        <Label className="arc-command-field-label" htmlFor="admin-action-evidence">{ADMIN_ACTION_SHEET_COPY.otherEvidence}</Label>
        <input
          id="admin-action-evidence"
          className="arc-command-field-input"
          value={typedEvidence}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          readOnly={readOnly}
          onChange={(event) => onType(event.currentTarget.value)}
        />
      </div>
      <p className="arc-command-field-description">{ADMIN_ACTION_SHEET_COPY.selectEvidence}</p>
    </fieldset>
  )
}
