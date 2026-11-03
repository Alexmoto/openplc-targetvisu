import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { TargetVisuDesigner } from '../designer'
import {
  emptyVisualization,
  newElement,
  newScreen,
  type TargetVisuDocument,
} from '@root/middleware/shared/targetvisu/model'
const symbols = [
  { path: 'Pump.Run', type: 'BOOL', writable: true },
  { path: 'Pump.Pressure', type: 'REAL', writable: false },
]
function Harness({
  initial = emptyVisualization(),
  readOnly = false,
}: {
  initial?: TargetVisuDocument
  readOnly?: boolean
}) {
  const [doc, setDoc] = useState(initial)
  return (
    <>
      <TargetVisuDesigner document={doc} symbols={symbols} onChange={setDoc} readOnly={readOnly} />
      <output data-testid='document'>{JSON.stringify(doc)}</output>
    </>
  )
}
const doc = () => JSON.parse(screen.getByTestId('document').textContent!) as TargetVisuDocument
it('creates screens and all primitives and retains model edits through Undo/Redo', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Create screen' }))
  for (const name of ['rectangle', 'ellipse', 'line', 'text', 'indicator', 'button', 'number'])
    fireEvent.click(screen.getByRole('button', { name: `+ ${name}` }))
  expect(doc().screens[0].elements).toHaveLength(7)
  fireEvent.change(screen.getByLabelText('Element name'), { target: { value: 'Setpoint' } })
  expect(doc().screens[0].elements[6].name).toBe('Setpoint')
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(doc().screens[0].elements[6].name).not.toBe('Setpoint')
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
  expect(doc().screens[0].elements[6].name).toBe('Setpoint')
})
it('duplicates a selected element with a new identity and deletes without losing other elements', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Create screen' }))
  fireEvent.click(screen.getByRole('button', { name: '+ rectangle' }))
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
  const elements = doc().screens[0].elements
  expect(elements).toHaveLength(2)
  expect(elements[0].id).not.toBe(elements[1].id)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(doc().screens[0].elements).toHaveLength(1)
})
it('checks missing variables and prevents exporting an unresolved screen', () => {
  const s = newScreen('s', 'Main'),
    e = newElement('text', 'e')
  e.bindings.value = 'Deleted.Value'
  s.elements = [e]
  render(<Harness initial={{ ...emptyVisualization(), screens: [s], startScreen: 's' }} />)
  expect(screen.getByRole('alert').textContent).toContain('unknown variable')
  fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }))
  expect(screen.getByRole('alert').textContent).toContain('Deleted.Value')
})
it('preview changes local values without altering the project JSON', () => {
  const s = newScreen('s', 'Main'),
    e = newElement('button', 'e')
  e.action = { kind: 'toggle', target: 'Pump.Run', value: true }
  s.elements = [e]
  render(<Harness initial={{ ...emptyVisualization(), screens: [s], startScreen: 's' }} />)
  const initial = JSON.stringify(doc())
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByText('No values are sent to the PLC.')).toBeTruthy()
  fireEvent.pointerDown(screen.getByTestId('element-e'))
  expect((screen.getByLabelText('Preview Pump.Run') as HTMLInputElement).checked).toBe(true)
  expect(JSON.stringify(doc())).toBe(initial)
})
it('prevents model edits in read-only projects', () => {
  render(<Harness readOnly />)
  expect((screen.getByRole('button', { name: 'Create screen' }) as HTMLButtonElement).disabled).toBe(true)
})

it('commits numeric dimensions on blur so typing does not clamp intermediate digits', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Create screen' }))
  const width = screen.getByLabelText('Screen width')
  fireEvent.change(width, { target: { value: '320' } })
  expect(doc().screens[0].width).toBe(800)
  fireEvent.blur(width)
  expect(doc().screens[0].width).toBe(320)
})
it('releases a simulated momentary button on pointer cancel', () => {
  const s = newScreen('s', 'Main'),
    e = newElement('button', 'momentary')
  e.action = { kind: 'momentary', target: 'Pump.Run', value: true }
  s.elements = [e]
  render(<Harness initial={{ ...emptyVisualization(), screens: [s], startScreen: 's' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  fireEvent.pointerDown(screen.getByTestId('element-momentary'))
  expect((screen.getByLabelText('Preview Pump.Run') as HTMLInputElement).checked).toBe(true)
  fireEvent.pointerCancel(screen.getByTestId('element-momentary'))
  expect((screen.getByLabelText('Preview Pump.Run') as HTMLInputElement).checked).toBe(false)
})

it('resets a momentary preview with a case-insensitive variable path when leaving preview', () => {
  const s = newScreen('s', 'Main'),
    e = newElement('button', 'm')
  e.action = { kind: 'momentary', target: 'PUMP.RUN', value: true }
  s.elements = [e]
  render(<Harness initial={{ ...emptyVisualization(), screens: [s], startScreen: 's' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  fireEvent.pointerDown(screen.getByTestId('element-m'))
  expect((screen.getByLabelText('Preview Pump.Run') as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Design' }))
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect((screen.getByLabelText('Preview Pump.Run') as HTMLInputElement).checked).toBe(false)
})

it('configures navigation by screen id and previews a button transition without modifying the document', () => {
  const main = newScreen('main', 'Main'),
    details = newScreen('details', 'Details')
  render(<Harness initial={{ ...emptyVisualization(), screens: [main, details], startScreen: main.id }} />)
  fireEvent.click(screen.getByRole('button', { name: '+ button' }))
  fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'navigate' } })
  expect((screen.getByLabelText('Target screen') as HTMLSelectElement).value).toBe('details')
  expect(screen.queryByLabelText('Action target')).toBeNull()
  const button = doc().screens[0].elements[0]
  expect(button.action).toMatchObject({ kind: 'navigate', target: 'details' })
  const original = JSON.stringify(doc())
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  fireEvent.pointerDown(screen.getByTestId(`element-${button.id}`))
  expect(screen.queryByTestId(`element-${button.id}`)).toBeNull()
  expect(JSON.stringify(doc())).toBe(original)
})

it('creates a graphic view with image import and scaling controls', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Create screen' }))
  fireEvent.click(screen.getByRole('button', { name: '+ Graphic View' }))
  expect(screen.getByLabelText('Graphic file')).toBeTruthy()
  expect(doc().screens[0].elements[0].kind).toBe('graphic')
  fireEvent.change(screen.getByLabelText('Graphic fit'), { target: { value: 'cover' } })
  expect(doc().screens[0].elements[0].graphic?.fit).toBe('cover')
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(doc().screens[0].elements[0].graphic?.fit).toBe('contain')
})

it('edits Number border radius and binds three PLC colors', () => {
  const s = newScreen('screen', 'Main')
  const element = newElement('number', 'display')
  s.elements = [element]
  render(<Harness initial={{ ...emptyVisualization(), screens: [s], startScreen: s.id }} />)
  fireEvent.pointerDown(screen.getByTestId('element-display'))
  fireEvent.change(screen.getByLabelText('Border radius'), { target: { value: '14' } })
  fireEvent.blur(screen.getByLabelText('Border radius'))
  expect(doc().screens[0].elements[0].borderRadius).toBe(14)
  expect(screen.getByLabelText('Background color variable')).toBeTruthy()
  expect(screen.getByLabelText('Border color variable')).toBeTruthy()
  expect(screen.getByLabelText('Text color variable')).toBeTruthy()
})

it('previews different Graphic View images when the BOOL selector changes', () => {
  const main = newScreen('main', 'Main')
  const graphic = newElement('graphic', 'g')
  const idle = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgZAA/5Av4tR4H0AAAAAElFTkSuQmCC'
  const active = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='
  graphic.graphic = { data: idle, fit: 'contain', variants: [{ value: 0, data: idle }, { value: 1, data: active }] }
  graphic.bindings.value = 'Pump.Run'
  main.elements = [graphic]
  render(<Harness initial={{ ...emptyVisualization(), screens: [main], startScreen: main.id }} />)
  fireEvent.pointerDown(screen.getByTestId('element-g'))
  expect(screen.getByLabelText('Image selector variable')).toBeTruthy()
  expect(screen.getByLabelText('Image state value 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  const image = () => screen.getByTestId('element-g').querySelector('image')?.getAttribute('href')
  expect(image()).toBe(idle)
  fireEvent.click(screen.getByLabelText('Preview Pump.Run'))
  expect(image()).toBe(active)
  fireEvent.click(screen.getByLabelText('Preview Pump.Run'))
  expect(image()).toBe(idle)
  expect(doc().screens[0].elements[0].graphic?.variants).toHaveLength(2)
})

it('renders an embedded screen background below primitives and edits its scaling without a PLC connection', () => {
  const s = newScreen('screen', 'Main')
  s.backgroundGraphic = {
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgZAA/5Av4tR4H0AAAAAElFTkSuQmCC',
    fit: 'cover',
  }
  s.elements = [newElement('button', 'b')]
  render(<Harness initial={{ ...emptyVisualization(), screens: [s], startScreen: s.id }} />)
  const canvas = screen.getByLabelText('Visualization canvas')
  const background = screen.getByTestId('screen-background-image')
  expect(background.getAttribute('pointer-events')).toBe('none')
  expect(background.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice')
  const imageOrder = Array.from(canvas.querySelectorAll('image, g[data-testid^="element-"]'))
  expect(imageOrder[0]).toBe(background)
  expect(imageOrder[1].getAttribute('data-testid')).toBe('element-b')
  fireEvent.change(screen.getByLabelText('Background image fit'), { target: { value: 'stretch' } })
  expect(doc().screens[0].backgroundGraphic?.fit).toBe('stretch')
  expect(screen.getByTestId('screen-background-image').getAttribute('preserveAspectRatio')).toBe('none')
  fireEvent.click(screen.getByLabelText('Remove screen background image'))
  expect(doc().screens[0].backgroundGraphic).toBeUndefined()
  expect(screen.queryByTestId('screen-background-image')).toBeNull()
  expect(doc().screens[0].background).toBe('#f3f5f7')
})

it('makes Button transparent without losing full-area pointer events', () => {
  const main = newScreen('main', 'Main')
  const e = newElement('button', 'transparent-button')
  e.action = { kind: 'toggle', target: 'Pump.Run', value: true }
  main.elements = [e]
  render(<Harness initial={{ ...emptyVisualization(), screens: [main], startScreen: main.id }} />)
  fireEvent.pointerDown(screen.getByTestId('hit-area-transparent-button'))
  fireEvent.click(screen.getByLabelText('Transparent background'))
  fireEvent.click(screen.getByLabelText('Transparent border'))
  expect(doc().screens[0].elements[0]).toMatchObject({ fillTransparent: true, strokeTransparent: true })
  expect(screen.getByTestId('element-transparent-button').querySelector('rect:not([data-testid])')?.getAttribute('fill')).toBe('none')
  const hitArea = screen.getByTestId('hit-area-transparent-button')
  expect(hitArea.getAttribute('pointer-events')).toBe('all')
  expect(hitArea.getAttribute('width')).toBe(String(e.width))
  expect(hitArea.getAttribute('height')).toBe(String(e.height))
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  fireEvent.pointerDown(screen.getByTestId('hit-area-transparent-button'))
  expect((screen.getByLabelText('Preview Pump.Run') as HTMLInputElement).checked).toBe(true)
  fireEvent.pointerDown(screen.getByTestId('hit-area-transparent-button'))
  expect((screen.getByLabelText('Preview Pump.Run') as HTMLInputElement).checked).toBe(false)
})

it('toggles transparent background and border independently for Number', () => {
  const main = newScreen('main', 'Main')
  main.elements = [newElement('number', 'numeric')]
  render(<Harness initial={{ ...emptyVisualization(), screens: [main], startScreen: main.id }} />)
  fireEvent.pointerDown(screen.getByTestId('hit-area-numeric'))
  fireEvent.click(screen.getByLabelText('Transparent background'))
  expect(doc().screens[0].elements[0].fillTransparent).toBe(true)
  expect(doc().screens[0].elements[0].strokeTransparent).toBe(false)
  const visibleRect = screen.getByTestId('element-numeric').querySelector('rect:not([data-testid])')
  expect(visibleRect?.getAttribute('fill')).toBe('none')
  expect(visibleRect?.getAttribute('stroke')).not.toBe('none')
  fireEvent.click(screen.getByLabelText('Transparent border'))
  expect(visibleRect?.getAttribute('stroke')).toBe('none')
})
