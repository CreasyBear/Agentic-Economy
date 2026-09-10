import { DirectAggregate } from '@convex-dev/aggregate'
import { components } from '../../_generated/api'

export const directoryFacets = new DirectAggregate<{
  Namespace: string
  Key: [string, string | number]
  Id: string
}>(components.marketDirectoryFacets)
