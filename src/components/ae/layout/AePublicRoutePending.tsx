import { AePageSkeleton } from '@/components/ae/layout/AePageState'

export function AePublicRoutePending({ label, shape = 'list' }: { label: string; shape?: 'list' | 'detail' | 'market' }) {
  return <AePageSkeleton title={label} description={label} shape={shape} />
}