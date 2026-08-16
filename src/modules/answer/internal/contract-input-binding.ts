import type { KeylessExecutableToolDescriptor } from '@/modules/capability-execution/operation-execute.actions'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

export function labelForContractInput(
  _descriptor: KeylessExecutableToolDescriptor,
  name: string,
  publicOperation?: PublicOperationDescriptor,
): string {
  const annotation = publicOperation?.contract.customerAnnotations.find(
    (candidate) => candidate.document === 'input' && candidate.pointer === `/${name}`,
  )
  return annotation?.label.trim() || name
}
