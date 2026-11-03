import { graphicDimensions, PNG_PREFIX, selectGraphicData } from '../graphics'
import { emptyVisualization, exportVisualization, newElement, newScreen, TargetVisuSchema, validateBindings } from '../model'

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return PNG_PREFIX + btoa(String.fromCharCode(...bytes))
}
it('accepts bounded embedded PNG headers and rejects paths, SVG, invalid base64 and oversized dimensions', () => {
  expect(graphicDimensions(pngHeader(10, 20))).toEqual({ width: 10, height: 20 })
  for (const data of [
    'file:///etc/passwd',
    'https://example.com/image.png',
    'data:image/svg+xml,<svg/>',
    PNG_PREFIX + '!!!!',
    pngHeader(1025, 1),
    pngHeader(1, 0),
  ])
    expect(graphicDimensions(data)).toBeUndefined()
})
it('round-trips graphic properties without requiring PLC write permissions', () => {
  const screen = newScreen('s', 'Main'),
    element = newElement('graphic', 'g')
  screen.elements = [element]
  const doc = { ...emptyVisualization(), startScreen: 's', screens: [screen] }
  expect(() => exportVisualization(doc, [])).toThrow('image is missing')
  element.graphic = { data: pngHeader(10, 20), fit: 'cover' }
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, [])))).toEqual(doc)
})

it('selects Graphic View images by exact BOOL or integer PLC values with a safe fallback', () => {
  const defaultImage = pngHeader(10, 10)
  const runImage = pngHeader(20, 20)
  const graphic = { data: defaultImage, fit: 'contain' as const,
    variants: [{ value: 0, data: defaultImage }, { value: 1, data: runImage }] }
  expect(selectGraphicData(graphic, true, true)).toBe(runImage)
  expect(selectGraphicData(graphic, false, true)).toBe(defaultImage)
  expect(selectGraphicData(graphic, 1, true)).toBe(runImage)
  expect(selectGraphicData(graphic, 42, true)).toBe(defaultImage)
  expect(selectGraphicData(graphic, undefined, true)).toBe(defaultImage)
  expect(selectGraphicData({ ...graphic, data: '' }, 42, true)).toBe('')
  expect(selectGraphicData({ ...graphic, data: '' }, undefined, false)).toBe(defaultImage)
})

it('requires distinct Graphic View image states and a compatible PLC selector variable', () => {
  const screen = newScreen('s', 'Main')
  const graphic = newElement('graphic', 'g')
  graphic.graphic = { data: '', fit: 'contain', variants: [
    { value: 0, data: pngHeader(2, 2) }, { value: 1, data: pngHeader(3, 3) },
  ] }
  graphic.bindings.value = 'Pump.State'
  screen.elements = [graphic]
  const doc = { ...emptyVisualization(), startScreen: screen.id, screens: [screen] }
  const symbols = [{ path: 'Pump.State', type: 'BOOL', writable: false }]
  expect(validateBindings(doc, symbols)).toEqual([])
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, symbols)))).toEqual(doc)
  expect(validateBindings(doc, [{ ...symbols[0], type: 'REAL' }]).join()).toContain('image selector')
  graphic.graphic!.variants![1].value = 0
  expect(TargetVisuSchema.safeParse(doc).success).toBe(false)
  graphic.graphic!.variants![1].value = 1
  graphic.graphic!.variants![1].data = 'https://example.com/a.png'
  expect(TargetVisuSchema.safeParse(doc).success).toBe(false)
})
