import { cn } from '@/lib/utils'

const TAPER_HEIGHT = 15.477
const TAPER_TOP_OFFSET = 4
const RIGHT_CAP_WIDTH = 15

function leftFillPath(height: number): string {
  return `M4 0 A4 4 0 0 0 0 4 V${height - 4} A4 4 0 0 0 4 ${height} Z`
}

function leftStrokePath(height: number): string {
  return `M4 0.5 A3.5 3.5 0 0 0 0.5 4 V${height - 4} A3.5 3.5 0 0 0 4 ${height - 0.5}`
}

function rightFillPath(height: number): string {
  const straight = Math.max(height - TAPER_TOP_OFFSET - TAPER_HEIGHT, 0)
  return `M0 0 h11 a4 4 0 0 1 4 4 v${straight} a6 6 0 0 1 -1.544 4.019 l-8.548 9.477 A6 6 0 0 1 0.453 ${height} H0 Z`
}

function rightStrokePath(height: number): string {
  const straight = Math.max(height - TAPER_TOP_OFFSET - TAPER_HEIGHT, 0)
  return `M0 0.5 h11 a3.5 3.5 0 0 1 3.5 3.5 v${straight} a5.5 5.5 0 0 1 -1.416 3.684 l-8.547 9.477 a5.5 5.5 0 0 1 -4.084 1.816 H0`
}

/** Nine-slice bevel — Twenty ButtonShape, AE fill/stroke variables. */
export function AeSiteButtonShape({
  heightPx,
  outlined = false,
}: {
  heightPx: number
  outlined?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 flex', outlined && 'z-1')}
    >
      <svg
        height={heightPx}
        viewBox={`0 0 4 ${heightPx}`}
        width="4"
        xmlns="http://www.w3.org/2000/svg"
        className="block shrink-0"
      >
        {outlined ? (
          <path d={leftStrokePath(heightPx)} data-stroke="" />
        ) : (
          <path d={leftFillPath(heightPx)} data-fill="" />
        )}
      </svg>
      <span className="ae-site-button-middle min-w-0 flex-1" />
      <svg
        height={heightPx}
        viewBox={`0 0 ${RIGHT_CAP_WIDTH} ${heightPx}`}
        width={RIGHT_CAP_WIDTH}
        xmlns="http://www.w3.org/2000/svg"
        className="block shrink-0"
      >
        {outlined ? (
          <path d={rightStrokePath(heightPx)} data-stroke="" />
        ) : (
          <path d={rightFillPath(heightPx)} data-fill="" />
        )}
      </svg>
    </span>
  )
}
