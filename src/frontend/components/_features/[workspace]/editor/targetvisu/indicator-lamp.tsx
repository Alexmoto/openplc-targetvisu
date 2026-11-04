// SPDX-License-Identifier: GPL-3.0-only
import { LAMP_CELL_SIZE, LAMP_SPRITE_URL, lampState } from '@root/middleware/shared/targetvisu/lamp-palette'

/** A cell of the original 33x33 glossy lamp atlas.
 * 0/undefined/outside 1..12: no image and no pointer events.
 */
export function IndicatorLamp({
  state, x = 0, y = 0, width = 33, height = 33,
}: {
  state: unknown
  x?: number
  y?: number
  width?: number
  height?: number
}) {
  const selected = lampState(state)
  if (!selected) return null
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`${(selected - 1) * LAMP_CELL_SIZE} 0 ${LAMP_CELL_SIZE} ${LAMP_CELL_SIZE}`}
      preserveAspectRatio='xMidYMid meet'
      overflow='hidden'
      pointerEvents='none'
      data-testid='indicator-lamp'
      data-state={selected}
    >
      <image
        x={0}
        y={0}
        width={LAMP_CELL_SIZE * 12}
        height={LAMP_CELL_SIZE}
        href={LAMP_SPRITE_URL}
        pointerEvents='none'
      />
    </svg>
  )
}
