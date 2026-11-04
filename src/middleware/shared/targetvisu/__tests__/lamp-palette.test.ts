import { graphicDimensions } from '../graphics'
import { LAMP_CELL_SIZE, LAMP_LABELS, LAMP_SPRITE_URL, lampState } from '../lamp-palette'

it('ships all twelve glossy lamps in a bounded 396×33 transparent PNG atlas', () => {
  expect(LAMP_LABELS).toHaveLength(12)
  expect(LAMP_CELL_SIZE).toBe(33)
  expect(graphicDimensions(LAMP_SPRITE_URL)).toEqual({ width: 396, height: 33 })
})

it('hides lamp on 0, absent data, and out-of-range or non-integer values', () => {
  expect([0, null, undefined, -1, 13, 2.5, true, false, '3'].map(lampState)).toEqual(
    Array(9).fill(0),
  )
  for (let value = 1; value <= 12; value++) expect(lampState(value)).toBe(value)
})
