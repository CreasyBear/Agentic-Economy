import type { JsonValue } from '@/modules/capability-contract/public'

const previewItems = 8
const previewTextLength = 1_000

/** Literal recorded values only. Bounded previews never replace the full output. */
export function CallOutputPreview({ value, depth = 0 }: Readonly<{ value: JsonValue; depth?: number }>) {
  if (value === null || typeof value !== 'object') {
    return <CallOutputScalar value={value} />
  }

  const count = Array.isArray(value) ? value.length : Object.keys(value).length
  if (count === 0) return <code className="text-sm">{Array.isArray(value) ? '[]' : '{}'}</code>
  if (depth >= 2) {
    const noun = Array.isArray(value) ? 'item' : 'field'
    return <p className="text-sm text-muted-foreground">{count} {noun}{count === 1 ? '' : 's'} — view full JSON below.</p>
  }
  if (Array.isArray(value)) {
    return (
      <div className="grid min-w-0 gap-related">
        <ol className="grid list-decimal gap-related pl-gutter text-sm marker:text-muted-foreground">
          {value.slice(0, previewItems).map((item, index) => (
            // Immutable recorded output has no child state or reordering; duplicate values remain separate entries.
            // eslint-disable-next-line react-doctor/no-array-index-as-key
            <li key={index} className="min-w-0 pl-intra"><CallOutputPreview value={item} depth={depth + 1} /></li>
          ))}
        </ol>
        {count > previewItems ? <p className="text-xs text-muted-foreground">{count - previewItems} more items. View full JSON below.</p> : null}
      </div>
    )
  }
  return (
    <div className="grid min-w-0 gap-related">
      <dl className="grid gap-related">
        {Object.entries(value).slice(0, previewItems).map(([label, item]) => (
          <div key={label} className={item !== null && typeof item === 'object'
            ? 'grid min-w-0 gap-related border-b border-border pb-related last:border-0'
            : 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-related'}>
            <dt title={label.slice(0, previewTextLength)} className="break-words text-sm font-medium text-muted-foreground">{fieldLabel(label.slice(0, previewTextLength))}{label.length > previewTextLength ? '…' : ''}</dt>
            <dd className="min-w-0"><CallOutputPreview value={item} depth={depth + 1} /></dd>
          </div>
        ))}
      </dl>
      {count > previewItems ? <p className="text-xs text-muted-foreground">{count - previewItems} more fields. View full JSON below.</p> : null}
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
    <div className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground">
      {text === '' ? <span className="text-muted-foreground">Empty text</span> : text.slice(0, previewTextLength)}
      {text.length > previewTextLength ? <p className="mt-intra text-xs text-muted-foreground">Text shortened. View full JSON below.</p> : null}
    </div>
  )
}
