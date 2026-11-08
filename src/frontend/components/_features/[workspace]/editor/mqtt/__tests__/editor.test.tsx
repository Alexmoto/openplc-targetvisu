import { parseProjectFiles } from '@root/backend/shared/utils/parse-project-files'
import { fireEvent, render, screen } from '@testing-library/react'
import { MqttEditor } from '../index'
import { createStoreWrapper, createTestStore } from '@root/frontend/store/testing'
import { buildAllProjectFileContentsPure } from '@root/frontend/services/save-actions'

// jsdom does not provide structuredClone in all supported Jest versions.
global.structuredClone = (value) => JSON.parse(JSON.stringify(value))
test('applies settings to project.json and marks workspace dirty', () => {
  const store = createTestStore(),
    close = jest.fn()
  store.setState((s) => ({ ...s, workspace: { ...s.workspace, canEdit: true } }))
  render(<MqttEditor onClose={close} />, { wrapper: createStoreWrapper(store) })
  fireEvent.change(screen.getByLabelText('Broker host'), { target: { value: 'mqtt.example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(close).toHaveBeenCalled()
  expect(store.getState().workspace.editingState).toBe('unsaved')
  const saved = JSON.parse(buildAllProjectFileContentsPure(store)['project.json'])
  expect(saved.data.mqtt.host).toBe('mqtt.example.test')
  const files = buildAllProjectFileContentsPure(store)
  const loaded = parseProjectFiles(
    '/demo',
    files['project.json'],
    files['devices/configuration.json'],
    files['devices/pin-mapping.json'],
    [],
    [],
    [],
  )
  expect(loaded.projectData.mqtt).toEqual(saved.data.mqtt)
})
test('cancel leaves original project unchanged', () => {
  const store = createTestStore(),
    close = jest.fn()
  render(<MqttEditor onClose={close} />, { wrapper: createStoreWrapper(store) })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(store.getState().project.data.mqtt).toBeUndefined()
})
test('enabled empty configuration cannot be applied', () => {
  const store = createTestStore(),
    close = jest.fn()
  store.setState((s) => ({ ...s, workspace: { ...s.workspace, canEdit: true } }))
  render(<MqttEditor onClose={close} />, { wrapper: createStoreWrapper(store) })
  fireEvent.click(screen.getByLabelText('Enable MQTT'))
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.getByRole('alert').textContent).toContain('Add at least one binding')
  expect(close).not.toHaveBeenCalled()
})

test('configures on-change Publish and round-trips through project.json', () => {
  const store = createTestStore(),
    close = jest.fn()
  store.setState((s) => ({ ...s, workspace: { ...s.workspace, canEdit: true } }))
  render(<MqttEditor onClose={close} />, { wrapper: createStoreWrapper(store) })
  fireEvent.click(screen.getByRole('button', { name: 'Add binding' }))
  fireEvent.change(screen.getByLabelText('Direction 1'), { target: { value: 'publish' } })
  fireEvent.change(screen.getByLabelText('Variable 1'), { target: { value: 'INSTANCE0.SETTEMP' } })
  fireEvent.change(screen.getByLabelText('Topic 1'), { target: { value: 'cmnd/tasmota222/ot_twater' } })
  fireEvent.change(screen.getByLabelText('Publish mode 1'), { target: { value: 'on-change' } })
  expect(screen.getByLabelText('Publish interval 1')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(close).toHaveBeenCalled()
  const files = buildAllProjectFileContentsPure(store)
  const saved = JSON.parse(files['project.json'])
  expect(saved.data.mqtt.bindings[0]).toMatchObject({
    direction: 'publish',
    publishMode: 'on-change',
    variable: 'INSTANCE0.SETTEMP',
    topic: 'cmnd/tasmota222/ot_twater',
  })
  const loaded = parseProjectFiles('/demo', files['project.json'],
    files['devices/configuration.json'], files['devices/pin-mapping.json'], [], [], [])
  expect(loaded.projectData.mqtt?.bindings[0].publishMode).toBe('on-change')
})

test('supports per-binding interval and refuses an invalid interval', () => {
  const store = createTestStore(),
    close = jest.fn()
  store.setState((s) => ({ ...s, workspace: { ...s.workspace, canEdit: true } }))
  render(<MqttEditor onClose={close} />, { wrapper: createStoreWrapper(store) })
  fireEvent.click(screen.getByRole('button', { name: 'Add binding' }))
  fireEvent.change(screen.getByLabelText('Direction 1'), { target: { value: 'publish' } })
  fireEvent.change(screen.getByLabelText('Variable 1'), { target: { value: 'INSTANCE0.SETTEMP' } })
  fireEvent.change(screen.getByLabelText('Topic 1'), { target: { value: 'cmnd/tasmota222/ot_twater' } })
  fireEvent.change(screen.getByLabelText('Publish interval 1'), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.getByRole('alert').textContent).toContain('publishIntervalMs')
  expect(close).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Publish interval 1'), { target: { value: '2000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(close).toHaveBeenCalled()
  const saved = JSON.parse(buildAllProjectFileContentsPure(store)['project.json'])
  expect(saved.data.mqtt.bindings[0].publishIntervalMs).toBe(2000)
})
