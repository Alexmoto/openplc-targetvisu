import { fireEvent, render, screen } from '@testing-library/react'
import { DiagnosticsModal } from '../diagnostics-modal'
import type { ModbusIOGroup, PLCPou } from '@root/middleware/shared/ports/types'
const group: ModbusIOGroup = {
  id: 'g1',
  name: 'Temperature',
  functionCode: '3',
  cycleTime: 500,
  offset: '0',
  length: 1,
  errorHandling: 'keep-last-value',
  ioPoints: [],
}
const pous: PLCPou[] = [
  { name: 'main', pouType: 'program', interface: { variables: [] }, body: { language: 'st', value: '' } },
]

function setup() {
  const onSave = jest.fn()
  const onClose = jest.fn()
  render(<DiagnosticsModal group={group} suggestedBase={100} pous={pous} onSave={onSave} onClose={onClose} />)
  return { onSave, onClose }
}
it('opens a separate window with nine fields and submits variable creation choice', () => {
  const { onSave, onClose } = setup()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect((screen.getByLabelText('CommOK') as HTMLInputElement).value).toBe('%MX100.0')
  expect((screen.getByLabelText('UpdateCounter') as HTMLInputElement).value).toBe('%MD104')
  fireEvent.change(screen.getByLabelText('Create variables in'), { target: { value: 'main' } })
  fireEvent.change(screen.getByLabelText('Variable prefix'), { target: { value: 'MB1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, staleMs: 3000 }), 'main', 'MB1')
  expect(onClose).toHaveBeenCalled()
})
it('blocks save on wrong bank or invalid stale time and leaves cancel usable', () => {
  const { onSave, onClose } = setup()
  fireEvent.change(screen.getByLabelText('CommOK'), { target: { value: '%MW100' } })
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalled()
})
it('keeps the window open if project-wide validation rejects addresses', () => {
  const { onSave, onClose } = setup()
  onSave.mockReturnValue('Address already used')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert').textContent).toContain('Address already used')
  expect(onClose).not.toHaveBeenCalled()
})

it('restores the managed POU and prefix and saves edited locations with their binding', () => {
  const onSave = jest.fn()
  const diagnostics = {
    enabled: true,
    staleMs: 3000,
    locations: { ok: '%MX100.0' },
    variables: { pou: 'main', prefix: 'MB0' },
  }
  render(
    <DiagnosticsModal
      group={{ ...group, diagnostics }}
      suggestedBase={100}
      pous={pous}
      onSave={onSave}
      onClose={jest.fn()}
    />,
  )
  expect((screen.getByLabelText('Create variables in') as HTMLSelectElement).value).toBe('main')
  expect((screen.getByLabelText('Variable prefix') as HTMLInputElement).value).toBe('MB0')
  fireEvent.change(screen.getByLabelText('CommOK'), { target: { value: '%MX110.0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      locations: expect.objectContaining({ ok: '%MX110.0' }),
      variables: { pou: 'main', prefix: 'MB0' },
    }),
    'main',
    'MB0',
  )
})
