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
