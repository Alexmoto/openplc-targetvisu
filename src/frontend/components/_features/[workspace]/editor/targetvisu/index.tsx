// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useMemo } from 'react'

import { useOpenPLCStore } from '../../../../../../frontend/store'
import { emptyVisualization } from '../../../../../../middleware/shared/targetvisu/model'
import { collectVisuSymbols } from '../../../../../../middleware/shared/targetvisu/symbols'
import { TargetVisuDesigner } from './designer'

export function TargetVisuEditor() {
  const project = useOpenPLCStore((s) => s.project)
  const update = useOpenPLCStore((s) => s.projectActions.updateTargetVisu)
  const addFile = useOpenPLCStore((s) => s.fileActions.addFile)
  const markDirty = useOpenPLCStore((s) => s.sharedWorkspaceActions.handleFileAndWorkspaceSavedState)
  const compileReady = useOpenPLCStore((s) => s.projectActions.getCompileReadyProjectData)
  const canEdit = useOpenPLCStore((s) => s.workspace.canEdit)
  const document = useMemo(() => project.data.targetVisu ?? emptyVisualization(), [project.data.targetVisu])
  const symbols = useMemo(
    () => collectVisuSymbols({ ...project.data, ...compileReady() }),
    [compileReady, project.data],
  )
  useEffect(() => {
    addFile({
      name: 'TargetVisu (X11)',
      type: 'targetvisu',
      filePath: 'project.json',
      cleanState: JSON.stringify(document),
    })
  }, [addFile, document])
  return (
    <TargetVisuDesigner
      key={project.meta.path}
      document={document}
      symbols={symbols}
      onChange={(next) => {
        update(next)
        markDirty('TargetVisu (X11)')
      }}
      readOnly={!canEdit}
    />
  )
}
