import {
  emptyVisualization,
  exportVisualization,
  fitElement,
  newElement,
  newScreen,
  TargetVisuSchema,
  validateBindings,
} from '../model'
import { collectVisuSymbols } from '../symbols'
import type { PLCProjectData, PLCVariable } from '../../ports/types'
const document = () => {
  const screen = newScreen('screen', 'Main')
  screen.elements.push(newElement('indicator', 'lamp'))
  return { ...emptyVisualization(), startScreen: screen.id, screens: [screen] }
}
const symbols = [
  { path: 'main.Run', type: 'BOOL', writable: true },
  { path: 'main.Temp', type: 'REAL', writable: false },
]

it('round-trips the native X11 format including all seven primitive kinds', () => {
  const doc = document()
  doc.screens[0].elements = ['rectangle', 'ellipse', 'line', 'text', 'indicator', 'button', 'number'].map(
    (kind, index) => newElement(kind as 'text', String(index)),
  )
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, symbols)))).toEqual(doc)
})
it('rejects future versions, duplicate identities and out-of-screen elements', () => {
  const doc = document()
  expect(TargetVisuSchema.safeParse({ ...doc, version: 2 }).success).toBe(false)
  expect(TargetVisuSchema.safeParse({ ...doc, screens: [doc.screens[0], doc.screens[0]] }).success).toBe(false)
  doc.screens[0].elements[0].x = 799
  expect(TargetVisuSchema.safeParse(doc).success).toBe(false)
})
it('retains one valid start screen and validates numeric limits', () => {
  const doc = document()
  expect(TargetVisuSchema.safeParse({ ...doc, startScreen: 'missing' }).success).toBe(false)
  doc.screens[0].elements[0].minimum = 101
  expect(TargetVisuSchema.safeParse(doc).success).toBe(false)
})
it('reports deleted variables and incompatible BOOL or numeric bindings', () => {
  const doc = document(),
    element = doc.screens[0].elements[0]
  element.bindings.value = 'main.Temp'
  expect(validateBindings(doc, symbols).join()).toContain('requires BOOL')
  element.bindings.value = 'deleted.Tag'
  expect(() => exportVisualization(doc, symbols)).toThrow('unknown variable')
  element.kind = 'number'
  element.bindings.value = 'main.Run'
  expect(validateBindings(doc, symbols).join()).toContain('numeric')
})
it('rejects writes to inputs and wrong toggle/set types', () => {
  const doc = document(),
    element = doc.screens[0].elements[0]
  element.kind = 'button'
  element.action = { kind: 'toggle', target: 'main.Temp', value: true }
  expect(validateBindings(doc, symbols).join()).toContain('read-only')
  expect(validateBindings(doc, symbols).join()).toContain('requires BOOL')
  element.action = { kind: 'set', target: 'main.Run', value: 123 }
  expect(validateBindings(doc, symbols).join()).toContain('boolean')
  element.action = { kind: 'set', target: 'MAIN.RUN', value: true }
  expect(validateBindings(doc, symbols)).toEqual([])
})
it('clamps movement and resizing to the screen', () => {
  const screen = newScreen('s', 'Main'),
    e = newElement('rectangle', 'r')
  expect(fitElement({ ...e, x: -1, y: 999, width: 999 }, screen)).toMatchObject({ x: 0, width: 800, y: 432 })
})
it('uses configured instance names, constant list permissions and stable scalar types', () => {
  const variable = (name: string, type: string, extra: Partial<PLCVariable> = {}): PLCVariable => ({
    name,
    type: { definition: 'base-type', value: type },
    location: '',
    documentation: '',
    ...extra,
  })
  const project: PLCProjectData = {
    dataTypes: [],
    pous: [
      {
        name: 'MotorProgram',
        pouType: 'program',
        interface: {
          variables: [
            variable('Run', 'BOOL'),
            variable('Temp', 'REAL', { class: 'temp' }),
            variable('Input', 'UINT', { location: '%IW0' }),
          ],
        },
        body: { language: 'st', value: '' },
      },
    ],
    configurations: {
      resource: {
        tasks: [],
        instances: [{ name: 'Pump1', program: 'MotorProgram', task: 'task0' }],
        globalVariables: [variable('Setpoint', 'REAL')],
      },
    },
    globalVariableLists: [{ name: 'Constants', qualifier: 'CONSTANT', variables: [variable('Limit', 'INT')] }],
  }
  expect(collectVisuSymbols(project)).toEqual([
    { path: 'Constants.Limit', type: 'INT', writable: false },
    { path: 'Pump1.Input', type: 'UINT', writable: false },
    { path: 'Pump1.Run', type: 'BOOL', writable: true },
    { path: 'Setpoint', type: 'REAL', writable: true },
  ])
})

it('supports legacy Number documents and validates optional PLC color bindings', () => {
  const doc = document()
  const element = newElement('number', 'n')
  doc.screens[0].elements = [element]
  const legacy = JSON.parse(JSON.stringify(doc))
  delete legacy.screens[0].elements[0].borderRadius
  delete legacy.screens[0].elements[0].bindings.fill
  delete legacy.screens[0].elements[0].bindings.stroke
  delete legacy.screens[0].elements[0].bindings.textColor
  expect(TargetVisuSchema.parse(legacy).screens[0].elements[0]).toMatchObject({
    borderRadius: 0,
    bindings: { fill: '', stroke: '', textColor: '' },
  })
  element.borderRadius = 12
  element.bindings.fill = 'main.Color'
  const withColors = [...symbols, { path: 'main.Color', type: 'DWORD', writable: false }]
  expect(validateBindings(doc, withColors)).toEqual([])
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, withColors)))).toEqual(doc)
  expect(validateBindings(doc, symbols).join()).toContain('unknown variable')
  expect(validateBindings(doc, [...symbols, { path: 'main.Color', type: 'REAL', writable: false }]).join()).toContain('integer PLC variable')
  element.kind = 'button'
  expect(validateBindings(doc, withColors).join()).toContain('requires number')
  element.kind = 'number'
  element.borderRadius = 101
  expect(TargetVisuSchema.safeParse(doc).success).toBe(false)
})

it('supports optional PNG screen backgrounds while retaining color-only screens', () => {
  const doc = document()
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, symbols)))).toEqual(doc)
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgZAA/5Av4tR4H0AAAAAElFTkSuQmCC'
  doc.screens[0].backgroundGraphic = { data: png, fit: 'cover' }
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, symbols)))).toEqual(doc)
  expect(TargetVisuSchema.safeParse({
    ...doc, screens: [{ ...doc.screens[0], backgroundGraphic: { data: 'file:///tmp/p.png', fit: 'cover' } }],
  }).success).toBe(false)
  expect(TargetVisuSchema.safeParse({
    ...doc, screens: [{ ...doc.screens[0], backgroundGraphic: { data: png, fit: 'unknown' } }],
  }).success).toBe(false)
  expect(TargetVisuSchema.safeParse({
    ...doc, screens: [{ ...doc.screens[0], backgroundGraphic: { data: png, fit: 'cover', variants: [] } }],
  }).success).toBe(false)
})

it('preserves transparent Button/Number settings and defaults for old projects', () => {
  const doc = document()
  const button = newElement('button', 'transparent-btn')
  const number = newElement('number', 'transparent-num')
  button.fillTransparent = true
  button.strokeTransparent = true
  number.fillTransparent = true
  number.strokeTransparent = false
  doc.screens[0].elements = [button, number]
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, symbols)))).toEqual(doc)
  const legacy = JSON.parse(JSON.stringify(doc))
  for (const e of legacy.screens[0].elements) {
    delete e.fillTransparent
    delete e.strokeTransparent
  }
  const parsed = TargetVisuSchema.parse(legacy)
  expect(parsed.screens[0].elements.every((e) => e.fillTransparent === false && e.strokeTransparent === false)).toBe(true)
  const invalid = newElement('rectangle', 'wrong')
  invalid.fillTransparent = true
  doc.screens[0].elements = [invalid]
  expect(validateBindings(doc, symbols).join()).toContain('only for Button and Number')
})

it('allows Number Input + Output only for its displayed, writable numeric PLC variable', () => {
  const doc = document()
  const number = newElement('number', 'n')
  number.bindings.value = 'Setpoint'
  number.numberMode = 'input-output'
  number.action = { kind: 'write', target: 'Setpoint', value: 0 }
  doc.screens[0].elements = [number]
  const allowed = [...symbols, { path: 'Setpoint', type: 'REAL', writable: true }]
  expect(validateBindings(doc, allowed)).toEqual([])
  expect(TargetVisuSchema.parse(JSON.parse(exportVisualization(doc, allowed)))).toEqual(doc)
  number.action.target = 'main.Run'
  expect(validateBindings(doc, allowed).join()).toContain('displayed value variable')
  number.action.target = 'Setpoint'
  expect(validateBindings(doc, [...symbols, { path: 'Setpoint', type: 'REAL', writable: false }]).join())
    .toContain('read-only')
  number.numberMode = 'output'
  expect(validateBindings(doc, allowed).join()).toContain('Output mode')
  number.numberMode = 'input-output'
  number.bindings.value = ''
  expect(validateBindings(doc, allowed).join()).toContain('requires a value variable')
  number.bindings.value = 'Setpoint'
  delete number.numberMode
  expect(validateBindings(doc, allowed)).toEqual([]) // legacy Number action: write
  number.numberMode = 'input-output'
  number.action.kind = 'none'
  expect(validateBindings(doc, allowed).join()).toContain('must write')
})
