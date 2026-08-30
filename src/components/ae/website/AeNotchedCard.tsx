const CAP_HEIGHT_PX = 20
const LEFT_SLOPE_WIDTH_PX = 74
const RIGHT_SLOPE_WIDTH_PX = 73
const LEFT_FLAT_GROW = 344
const NOTCH_GROW = 518
const RIGHT_FLAT_GROW = 343

const LEFT_SLOPE_PATH =
  'M0 0 C4.197 0 8.369 0.66 12.361 1.958 L61.861 18.042 A40 40 0 0 0 74.222 20 L0 20 Z'
const RIGHT_SLOPE_PATH =
  'M0 20 A40 40 0 0 1 12.63 17.953 L60.418 2.047 A40 40 0 0 1 73.048 0 L73.048 20 Z'

/** Light card with a dipped cap — Twenty NotchedCardShape, AE surface tokens. */
export function AeNotchedCardShape() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 text-container">
      <div className="absolute inset-x-0 top-0 flex h-5">
        <div className="min-w-0 bg-container" style={{ flexGrow: LEFT_FLAT_GROW, flexBasis: 0 }} />
        <svg
          fill="none"
          height={CAP_HEIGHT_PX}
          preserveAspectRatio="none"
          viewBox={`0 0 74.222 ${CAP_HEIGHT_PX}`}
          width={LEFT_SLOPE_WIDTH_PX}
          xmlns="http://www.w3.org/2000/svg"
          className="-mx-px shrink-0"
        >
          <path d={LEFT_SLOPE_PATH} fill="currentColor" />
        </svg>
        <div className="min-w-0" style={{ flexGrow: NOTCH_GROW, flexBasis: 0 }} />
        <svg
          fill="none"
          height={CAP_HEIGHT_PX}
          preserveAspectRatio="none"
          viewBox={`0 0 73.048 ${CAP_HEIGHT_PX}`}
          width={RIGHT_SLOPE_WIDTH_PX}
          xmlns="http://www.w3.org/2000/svg"
          className="-mx-px shrink-0"
        >
          <path d={RIGHT_SLOPE_PATH} fill="currentColor" />
        </svg>
        <div className="min-w-0 bg-container" style={{ flexGrow: RIGHT_FLAT_GROW, flexBasis: 0 }} />
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[19px] bg-container" />
    </div>
  )
}
