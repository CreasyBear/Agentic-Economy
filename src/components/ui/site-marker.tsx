import { cn } from '@/lib/utils'

type SiteMarkerProps = {
  tone?: 'fg' | 'info'
  visible?: boolean
  grow?: boolean
  dataMarker?: boolean
}

/**
 * Small site dash: hover grow-in on links (`grow`) or always-on eyebrow accent.
 * Arbitrary rounded/h classes live here because ui primitives are exempt from
 * the product-surface visual-token scan.
 */
export function SiteMarker({ tone = 'fg', visible = false, grow = false, dataMarker = false }: SiteMarkerProps) {
  return (
    <span
      aria-hidden="true"
      {...(dataMarker ? { 'data-ae-marker': '' } : {})}
      className={cn(
        'shrink-0 rounded-[1px] h-[7px]',
        grow
          ? cn(
              'w-0 transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none md:inline-flex group-hover:w-3.5',
              visible ? '' : 'opacity-0 group-hover:opacity-100',
            )
          : 'w-3.5',
        tone === 'info' ? 'bg-info' : 'bg-foreground',
      )}
    />
  )
}
