import { AECON_DARK_MARK_SRC, AECON_MARK_SRC } from '@/content/brand-assets'

/** The aecon symbol for Arc brand slots: Forest on light, Chalk and gold on dark. */
export function AeBrandMark() {
  return (
    <span className="inline-flex size-5.5 flex-none" aria-hidden="true">
      <img src={AECON_MARK_SRC} alt="" width={22} height={22} className="size-full object-contain dark:hidden" />
      <img src={AECON_DARK_MARK_SRC} alt="" width={22} height={22} className="hidden size-full object-contain dark:block" />
    </span>
  )
}
