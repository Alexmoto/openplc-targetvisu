// SPDX-License-Identifier: GPL-3.0-only
import { z } from 'zod'

import { MqttSchema } from '../../../../middleware/shared/mqtt/model'
import type { PLCProjectData } from '../../types/PLC/open-plc'

const widths: Record<string, number> = {
  BOOL: 1,
  SINT: 1,
  USINT: 1,
  BYTE: 1,
  INT: 2,
  UINT: 2,
  WORD: 2,
  DINT: 4,
  UDINT: 4,
  DWORD: 4,
  LINT: 8,
  ULINT: 8,
  LWORD: 8,
  REAL: 4,
  LREAL: 8,
}

/** Resolve against this build's canonical map, never a cached editor/debugger address. */
export function generateMqttConfig(project: PLCProjectData, debugMap: string, md5: string): string | undefined {
  if (!project.mqtt?.enabled) return undefined
  const config = MqttSchema.parse(project.mqtt)
  if (!config.bindings.length) throw new Error('MQTT: add at least one binding')
  const mapResult = z
    .object({
      version: z.literal(2),
      md5: z.string(),
      leaves: z.array(
        z.object({ path: z.string(), type: z.string(), size: z.number(), arrayIdx: z.number(), elemIdx: z.number() }),
      ),
    })
    .safeParse(JSON.parse(debugMap) as unknown)
  if (!mapResult.success) throw new Error('MQTT: invalid compiled map')
  const map = mapResult.data
  if (
    map.version !== 2 ||
    !/^[a-f0-9]{32}$/i.test(md5) ||
    map.md5?.toLowerCase() !== md5.toLowerCase() ||
    !Array.isArray(map.leaves)
  )
    throw new Error('MQTT: compiled map / program mismatch')
  const writable = new Map<string, boolean>()
  const add = (prefix: string, variables: PLCProjectData['pous'][number]['data']['variables'], constant = false) => {
    for (const v of variables) {
      if (v.class === 'external' || v.class === 'temp') continue
      const key = (prefix + v.name).toLowerCase()
      writable.set(key, !writable.has(key) && !constant && v.flag !== 'constant' && !v.location)
    }
  }
  add('', project.configuration.resource.globalVariables as PLCProjectData['pous'][number]['data']['variables'])
  for (const gvl of project.globalVariableLists ?? [])
    add(`${gvl.name}.`, gvl.variables, /\bCONSTANT\b/i.test(gvl.qualifier ?? ''))
  for (const instance of project.configuration.resource.instances) {
    const pou = project.pous.find(
      (p) => p.type === 'program' && p.data.name.toLowerCase() === instance.program.toLowerCase(),
    )
    if (pou) add(`${instance.name}.`, pou.data.variables)
  }
  const bindings = config.bindings.map((binding) => {
    const matches = map.leaves.filter(
      (leaf: { path: string }) => leaf.path.toLowerCase() === binding.variable.toLowerCase(),
    )
    if (matches.length !== 1) throw new Error(`MQTT: unresolved or ambiguous variable ${binding.variable}`)
    const leaf = matches[0],
      type = String(leaf.type).toUpperCase()
    if (
      !widths[type] ||
      leaf.size !== widths[type] ||
      !Number.isInteger(leaf.arrayIdx) ||
      leaf.arrayIdx < 0 ||
      leaf.arrayIdx > 255 ||
      !Number.isInteger(leaf.elemIdx) ||
      leaf.elemIdx < 0 ||
      leaf.elemIdx > 65535
    )
      throw new Error(`MQTT: unsupported variable ${binding.variable}`)
    if (binding.direction === 'subscribe' && writable.get(binding.variable.toLowerCase()) !== true)
      throw new Error(
        `MQTT: subscription requires a non-constant scalar variable without an I/O address: ${binding.variable}`,
      )
    return { ...binding, variable: leaf.path, type, size: leaf.size, arr: leaf.arrayIdx, elem: leaf.elemIdx }
  })
  return JSON.stringify({ ...config, version: 1, programMd5: md5.toLowerCase(), bindings }, null, 2)
}
