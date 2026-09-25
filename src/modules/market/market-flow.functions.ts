import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'

import { readMarketFlowCachedVolumes, readMarketFlowRank, readMarketFlowVolumes } from '@/modules/market/market-flow.server'

const payTos = z.strictObject({ payTos: z.array(z.string().max(128)).max(48) })

export const readMarketFlowRankServer = createServerFn({ method: 'GET' })
  .validator(data => payTos.parse(data))
  .handler(async ({ data }) => await readMarketFlowRank(data.payTos))

export const readMarketFlowCachedVolumesServer = createServerFn({ method: 'GET' })
  .validator(data => payTos.parse(data))
  .handler(async ({ data }) => await readMarketFlowCachedVolumes(data.payTos))

export const readMarketFlowVolumesServer = createServerFn({ method: 'GET' })
  .validator(data => payTos.parse(data))
  .handler(async ({ data }) => await readMarketFlowVolumes(data.payTos))
