import { useId, useMemo, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'

import { Popover } from '@astryxdesign/core/Popover'

import { useAnswerModel } from './AeAnswerModelContext'

export function AeModelSelector() {
  const listboxId = useId()
  const { enabled, loading, modelsByProvider, selectedModel, selectedModelId, setSelectedModelId } =
    useAnswerModel()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const providerEntries = useMemo(
    () =>
      Object.entries(modelsByProvider).sort(([providerA], [providerB]) => providerA.localeCompare(providerB)),
    [modelsByProvider],
  )
  const filteredProviderEntries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) {
      return providerEntries
    }

    return providerEntries.flatMap(([provider, models]) => {
      const filteredModels = models.filter((model) =>
        `${provider} ${model.name} ${model.id}`.toLowerCase().includes(needle),
      )
      return filteredModels.length === 0 ? [] : [[provider, filteredModels] as const]
    })
  }, [providerEntries, query])

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2" aria-hidden="true">
        <span className="font-mono text-xs uppercase tracking-wider text-secondary">Model</span>
        <span className="inline-flex min-h-9 items-center rounded-md border border-border bg-surface px-3 text-xs text-secondary opacity-70">
          Loading…
        </span>
      </div>
    )
  }

  if (!enabled) {
    return null
  }

  if (selectedModel === null) {
    return null
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <span className="font-mono text-xs uppercase tracking-wider text-secondary" id={`${listboxId}-label`}>
        Model
      </span>
      <Popover
        isOpen={open}
        onOpenChange={setOpen}
        placement="above"
        alignment="end"
        label="Choose answer model"
        className="w-[18.75rem] max-w-[calc(100vw-2rem)] p-2"
        content={
          <div id={listboxId} className="grid gap-2 bg-transparent">
            <label className="flex min-h-10 items-center rounded-md border border-border bg-card px-3">
              <span className="sr-only">Search models</span>
              <input
                aria-controls={`${listboxId}-options`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search models…"
                type="search"
                value={query}
              />
            </label>
            <div id={`${listboxId}-options`} role="listbox" className="grid max-h-56 gap-1 overflow-auto">
              {filteredProviderEntries.length === 0 ? (
                <div className="px-3 py-2 text-sm text-secondary">No model found.</div>
              ) : (
                filteredProviderEntries.map(([provider, models]) => (
                  <div key={provider} role="group" aria-label={provider} className="grid gap-1">
                    <div className="px-2 py-1 text-xs font-medium text-secondary">{provider}</div>
                    {models.map((model) => {
                      const isSelected = model.id === selectedModelId
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-selected={isSelected ? 'true' : undefined}
                          className="flex min-h-9 items-center rounded-md px-2 text-left text-sm text-primary hover:bg-muted data-[selected=true]:bg-muted data-[selected=true]:font-medium"
                          onClick={() => {
                            setSelectedModelId(model.id)
                            setOpen(false)
                            setQuery('')
                          }}
                        >
                          <span className="truncate">{model.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        }
      >
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-primary transition-colors hover:bg-muted"
          aria-labelledby={`${listboxId}-label`}
        >
          <span className="inline-flex size-5 items-center justify-center rounded-md bg-muted font-mono text-2xs font-semibold uppercase text-secondary" aria-hidden="true">
            {selectedModel.provider.slice(0, 1)}
          </span>
          <span className="max-w-44 truncate">{selectedModel.name}</span>
          <ChevronDownIcon aria-hidden="true" className={`size-3.5 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </Popover>
    </div>
  )
}
