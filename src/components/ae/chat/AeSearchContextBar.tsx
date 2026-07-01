import { Globe2Icon, MapPinIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  aeSearchContextLocationLabel,
  aeSearchContextWithMode,
  buildAeSearchContextFromLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'

export type AeSearchContextBarProps = {
  context: AeSearchContext
  busy?: boolean
  onChange: (context: AeSearchContext) => void
}

export function AeSearchContextBar({
  context,
  busy = false,
  onChange,
}: AeSearchContextBarProps) {
  const locationLabel = aeSearchContextLocationLabel(context) ?? ''
  const nearMode = context.mode === 'near_me'

  return (
    <div className="ae-search-context-bar" aria-label="Search area">
      <div className="ae-search-context-bar__place">
        {nearMode ? (
          <MapPinIcon aria-hidden="true" className="ae-search-context-bar__icon" />
        ) : (
          <Globe2Icon aria-hidden="true" className="ae-search-context-bar__icon" />
        )}
        <label className="ae-search-context-bar__label">
          <span>{nearMode ? 'Searching around' : 'Searching'}</span>
          <input
            type="text"
            value={nearMode ? locationLabel : 'Whole catalogue'}
            placeholder="Suburb, state"
            maxLength={80}
            disabled={busy || !nearMode}
            onChange={(event) => onChange(buildAeSearchContextFromLabel(event.currentTarget.value))}
          />
        </label>
      </div>

      <div className="ae-search-context-bar__modes" role="group" aria-label="Search mode">
        <Button
          type="button"
          variant={nearMode ? 'landingPrimary' : 'publicSecondary'}
          size="sm"
          aria-pressed={nearMode}
          disabled={busy}
          onClick={() => onChange(aeSearchContextWithMode(context, 'near_me'))}
        >
          Near me
        </Button>
        <Button
          type="button"
          variant={!nearMode ? 'landingPrimary' : 'publicSecondary'}
          size="sm"
          aria-pressed={!nearMode}
          disabled={busy}
          onClick={() => onChange(aeSearchContextWithMode(context, 'whole_catalogue'))}
        >
          Whole catalogue
        </Button>
      </div>
    </div>
  )
}
