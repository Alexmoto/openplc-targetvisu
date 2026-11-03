import { CreateEditorObjectFromTab } from '../../store/slices/tabs/utils'
import { createTestStore } from '../../store/testing'
import { buildAllProjectFileContentsPure, reloadFileFromDisk } from '../save-actions'
import { parseProjectFiles } from '../../../backend/shared/utils/parse-project-files'
import { emptyVisualization, newScreen } from '../../../middleware/shared/targetvisu/model'
import type { ProjectPort } from '../../../middleware/shared/ports/project-port'

it('saves TargetVisu in project.json and reopens it without losing program configuration', () => {
  const store = createTestStore(),
    state = store.getState(),
    s = newScreen('s', 'Main'),
    document = { ...emptyVisualization(), screens: [s], startScreen: s.id }
  state.projectActions.updateMetaName('VisuTest')
  state.projectActions.updateTargetVisu(document)
  const files = buildAllProjectFileContentsPure(store),
    parsed = parseProjectFiles(
      '/test',
      files['project.json'],
      files['devices/configuration.json'],
      files['devices/pin-mapping.json'],
      [],
      [],
      [],
    )
  expect(parsed.fatalErrors).toBeUndefined()
  expect(parsed.projectData.targetVisu).toEqual(document)
  expect(parsed.projectData.configurations).toEqual(store.getState().project.data.configurations)
})
it('refuses to open unknown visualization versions instead of dropping screens', () => {
  const store = createTestStore(),
    files = buildAllProjectFileContentsPure(store),
    raw = JSON.parse(files['project.json'])
  raw.data.targetVisu = { version: 99, screens: [] }
  const parsed = parseProjectFiles('/test', JSON.stringify(raw), '', '', [], [], [])
  expect(parsed.fatalErrors?.join()).toContain('TargetVisu')
})
it('discarding the visualization restores only its snapshot, keeping other project edits', async () => {
  const store = createTestStore(),
    state = store.getState(),
    initial = emptyVisualization()
  state.fileActions.addFile({
    name: 'TargetVisu (X11)',
    type: 'targetvisu',
    filePath: 'project.json',
    cleanState: JSON.stringify(initial),
  })
  state.projectActions.updateTargetVisu({ ...initial, screens: [newScreen('s', 'Main')], startScreen: 's' })
  state.projectActions.updateMetaName('OtherEdit')
  await reloadFileFromDisk(store, 'TargetVisu (X11)', {} as ProjectPort)
  expect(store.getState().project.data.targetVisu).toEqual(initial)
  expect(store.getState().project.meta.name).toBe('OtherEdit')
})

it('creates the TargetVisu editor model through the regular tab factory', () => {
  expect(CreateEditorObjectFromTab({ name: 'TargetVisu (X11)', elementType: { type: 'targetvisu' } })).toEqual({
    type: 'plc-targetvisu',
    meta: { name: 'TargetVisu (X11)' },
  })
})
