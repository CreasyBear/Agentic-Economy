import { useId, useMemo, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { useAnswerModel } from './AeAnswerModelContext'

export function AeModelSelector() {
  const listboxId = useId()
  const { enabled, loading, modelsByProvider, selectedModel, selectedModelId, setSelectedModelId } =
    useAnswerModel()
  const [open, setOpen] = useState(false)

  const providerEntries = useMemo(
    () =>
      Object.entries(modelsByProvider).sort(([providerA], [providerB]) => providerA.localeCompare(providerB)),
    [modelsByProvider],
  )

  if (loading) {
    return (
      <div className="ae-model-selector ae-model-selector--loading" aria-hidden="true">
        <span className="ae-model-selector__label">Model</span>
        <span className="ae-model-selector__trigger ae-model-selector__trigger--disabled">Loading…</span>
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
    <div className="ae-model-selector">
      <span className="ae-model-selector__label" id={`${listboxId}-label`}>
        Model
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="ae-model-selector__trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby={`${listboxId}-label`}
          >
            <span className="ae-model-selector__provider" aria-hidden="true">
              {selectedModel.provider.slice(0, 1)}
            </span>
            <span className="ae-model-selector__name">{selectedModel.name}</span>
            <ChevronDownIcon aria-hidden="true" className="ae-model-selector__chevron size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="ae-model-selector__panel w-[min(18.75rem,calc(100vw-2*var(--ae-public-gutter)))] p-0"
          side="top"
          align="end"
          sideOffset={8}
        >
          <Command id={listboxId} className="ae-model-selector-command bg-transparent">
            <CommandInput placeholder="Search models…" aria-controls={listboxId} />
            <CommandList className="max-h-56">
              <CommandEmpty className="ae-model-selector__empty">No model found.</CommandEmpty>
              {providerEntries.map(([provider, models]) => (
                <CommandGroup key={provider} heading={provider} className="ae-model-selector__group">
                  {models.map((model) => {
                    const isSelected = model.id === selectedModelId
                    return (
                      <CommandItem
                        key={model.id}
                        value={`${provider} ${model.name} ${model.id}`}
                        data-checked={isSelected ? true : undefined}
                        className="ae-model-selector__option"
                        onSelect={() => {
                          setSelectedModelId(model.id)
                          setOpen(false)
                        }}
                      >
                        <span className="ae-model-selector__option-name">{model.name}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
