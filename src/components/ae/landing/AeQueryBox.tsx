import { useId, useState } from 'react'
import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type AeQueryBoxProps = {
  onSubmit: (query: string) => void
  defaultValue?: string
  examples?: readonly string[]
  busy?: boolean
}

export function AeQueryBox({
  onSubmit,
  defaultValue = '',
  examples = DEFAULT_EXAMPLES,
  busy = false,
}: AeQueryBoxProps) {
  const inputId = useId()
  const [value, setValue] = useState(defaultValue)

  function submit(q: string) {
    const trimmed = q.trim()
    if (trimmed.length === 0) return
    onSubmit(trimmed)
  }

  return (
    <form
      className="ae-query-box"
      action="/ask"
      method="get"
      role="search"
      aria-label="Find local service providers"
      onSubmit={(event) => {
        event.preventDefault()
        submit(value)
      }}
    >
      <label htmlFor={inputId} className="ae-query-box__label">
        What do you need done?
      </label>

      <div className="ae-query-box__row">
        <SearchIcon aria-hidden="true" className="ae-query-box__icon size-5" />
        <input
          id={inputId}
          name="q"
          type="search"
          className="ae-query-box__input"
          placeholder="No hot water in Preston 3072"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby={`${inputId}-hint`}
        />
        <Button
          type="submit"
          variant="landingPrimary"
          className="ae-query-box__submit"
          disabled={busy}
        >
          Ask
        </Button>
      </div>

      <p id={`${inputId}-hint`} className="ae-query-box__hint">
        Type a real need and a place. The answer cites listed local businesses.
      </p>

      {examples.length > 0 ? (
        <ul className="ae-query-box__examples" aria-label="Example queries">
          {examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="ae-query-box__example"
                onClick={() => {
                  setValue(example)
                  submit(example)
                }}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  )
}

const DEFAULT_EXAMPLES: readonly string[] = [
  'Emergency plumber Brunswick',
  'Locksmith open now Footscray',
  'Electrician same day Geelong',
]
