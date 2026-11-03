import { fireEvent, render, screen } from '@testing-library/react'
import { TargetVisuEditor } from '../index'
import { createStoreWrapper, createTestStore } from '@root/frontend/store/testing'
import { buildAllProjectFileContentsPure } from '@root/frontend/services/save-actions'

it('opens as a real project editor, marks edits unsaved and includes them in normal project saves', () => {
  const store = createTestStore()
  store.getState().projectActions.updateMetaPath('/demo')
  store.setState((s) => ({ ...s, workspace: { ...s.workspace, canEdit: true } }))
  render(<TargetVisuEditor />, { wrapper: createStoreWrapper(store) })
  fireEvent.click(screen.getByRole('button', { name: 'Create screen' }))
  expect(store.getState().files['TargetVisu (X11)'].saved).toBe(false)
  expect(store.getState().workspace.editingState).toBe('unsaved')
  const contents = buildAllProjectFileContentsPure(store)
  expect(JSON.parse(contents['project.json']).data.targetVisu.screens).toHaveLength(1)
})
