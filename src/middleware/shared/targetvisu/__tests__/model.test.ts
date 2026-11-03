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
