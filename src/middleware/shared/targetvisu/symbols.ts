// SPDX-License-Identifier: GPL-3.0-only
import type { PLCProjectData, PLCVariable } from '../ports/types'
import { isNumericType, type VisuSymbol } from './model'
/** Named scalar variables only. Program instances, not POU type names, identify running data. */
export function collectVisuSymbols(project: PLCProjectData): VisuSymbol[] {
  const result: VisuSymbol[] = []
  const append = (prefix: string, vars: PLCVariable[], constant = false) => {
    for (const variable of vars) {
      const type = variable.type.value.toUpperCase()
      if (
        variable.type.definition !== 'base-type' ||
        !(type === 'BOOL' || type === 'STRING' || type === 'WSTRING' || isNumericType(type))
      )
        continue
      if (variable.class === 'temp' || variable.class === 'external') continue
      result.push({
        path: prefix + variable.name,
        type,
        writable: !constant && variable.flag !== 'constant' && !/^%I/i.test(variable.location ?? ''),
      })
    }
  }
  append('', project.configurations.resource.globalVariables)
  for (const list of project.globalVariableLists ?? [])
    append(`${list.name}.`, list.variables, /\bCONSTANT\b/i.test(list.qualifier ?? ''))
  for (const instance of project.configurations.resource.instances) {
    const pou = project.pous.find(
      (p) => p.pouType === 'program' && p.name.toLowerCase() === instance.program.toLowerCase(),
    )
    if (pou) append(`${instance.name}.`, pou.interface?.variables ?? [])
  }
  const seen = new Set<string>()
  return result
    .filter((s) => {
      const path = s.path.toLowerCase()
      if (seen.has(path)) return false
      seen.add(path)
      return true
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}
