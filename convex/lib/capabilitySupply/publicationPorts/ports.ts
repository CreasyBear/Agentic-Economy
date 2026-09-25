import type { PublicationCommandPorts, OperationLedgerPorts } from '@/modules/capability-supply/public'
import type { MutationCtx } from '../../../_generated/server'
import { capabilitySupplyToolPorts } from '../../../capabilitySupplyToolPorts'
import { publicationReadPorts } from './reads'
import { publicationWritePorts } from './writes'

export function capabilitySupplyPublicationPorts(
  ctx: MutationCtx,
  writers: Pick<OperationLedgerPorts, 'registerOffering' | 'registerBinding' | 'setEligibility'>,
): PublicationCommandPorts {
  return {
    ...capabilitySupplyToolPorts(ctx.db, writers),
    ...publicationReadPorts(ctx),
    ...publicationWritePorts(ctx),
  }
}
