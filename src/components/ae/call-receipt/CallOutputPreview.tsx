import type { JsonValue } from '@/modules/capability-contract/public'
import './ReceiptComposition.css'

const previewItems = 8
const previewTextLength = 1_000

/** Literal recorded values only. Bounded previews never replace the full output. */
export function CallOutputPreview({ value, depth = 0 }: Readonly<{ value: JsonValue; depth?: number }>) {
  if (value === null || typeof value !== 'object') {
    return <CallOutputScalar value={value} />
  }

  const count = Array.isArray(value) ? value.length : Object.keys(value).length
  if (count === 0) return <code className="arc-market arc-call-json-empty">{Array.isArray(value) ? '[]' : '{}'}</code>
  if (depth >= 2) {
    const noun = Array.isArray(value) ? 'item' : 'field'
    return <p className="arc-market arc-call-context">{count} {noun}{count === 1 ? '' : 's'} — view full JSON below.</p>
  }
  if (Array.isArray(value)) {
    return (
      <div className="arc-market arc-call-json-preview">
        <ol className="arc-call-json-array">
          {value.slice(0, previewItems).map((item, index) => (
            // Immutable recorded output has no child state or reordering; duplicate values remain separate entries.
            // eslint-disable-next-line react-doctor/no-array-index-as-key
            <li key={index}><CallOutputPreview value={item} depth={depth + 1} /></li>
          ))}
        </ol>
        {count > previewItems ? <p className="arc-call-context">{count - previewItems} more items. View full JSON below.</p> : null}
      </div>
    )
  }
  return (
    <div className="arc-market arc-call-json-preview">
      <dl className="arc-call-json-object">
        {Object.entries(value).slice(0, previewItems).map(([label, item]) => (
          <div key={label} className="arc-call-json-field" data-complex={item !== null && typeof item === 'object' ? '' : undefined}>
            <dt title={label.slice(0, previewTextLength)}>{fieldLabel(label.slice(0, previewTextLength))}{label.length > previewTextLength ? '…' : ''}</dt>
            <dd><CallOutputPreview value={item} depth={depth + 1} /></dd>
          </div>
        ))}
      </dl>
      {count > previewItems ? <p className="arc-call-context">{count - previewItems} more fields. View full JSON below.</p> : null}
    </div>
  )
}

function fieldLabel(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function CallOutputScalar({ value }: Readonly<{ value: string | number | boolean | null }>) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return (
    <div className="arc-market arc-call-json-scalar">
      {text === '' ? <span className="arc-call-context">Empty text</span> : text.slice(0, previewTextLength)}
      {text.length > previewTextLength ? <p className="arc-call-context">Text shortened. View full JSON below.</p> : null}
    </div>
  )
}
