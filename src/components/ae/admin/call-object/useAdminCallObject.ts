import { useMemo } from 'react'

import type {
  AdminCallObjectView,
  AdminCallObjectViewModel,
} from './call-object.contracts'
import { buildAdminCallObjectViewModel } from './call-object.view-model'

export function useAdminCallObject(view: AdminCallObjectView): AdminCallObjectViewModel {
  return useMemo(() => buildAdminCallObjectViewModel(view), [view])
}
