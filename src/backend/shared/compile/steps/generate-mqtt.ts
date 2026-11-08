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

/** Resolve against this build's canonical map, never a cached debugger address. */
export function generateMqttConfig(project: PLCProjectData, debugMap: string, md5: string): string | undefined {
  const legacy = project.mqtt?.enabled
    ? [{ name: 'Legacy MQTT', config: MqttSchema.parse(project.mqtt), legacy: true }]
    : []
  const remote = (project.remoteDevices ?? [])
    .filter((device) => device.protocol === 'mqtt' && device.mqttConfig?.enabled)
    .map((device) => ({
      name: device.name,
      config: MqttSchema.parse(device.mqttConfig),
      legacy: false,
    }))
  const sources = [...legacy, ...remote]
  if (!sources.length) return undefined
  if (sources.length > 8) throw new Error('MQTT: maximum 8 enabled broker connections')
  const names = new Set<string>()
  const clientIds = new Set<string>()
  let bindingCount = 0
  for (const source of sources) {
    if (names.has(source.name.toLowerCase())) throw new Error(`MQTT: duplicate device name ${source.name}`)
    names.add(source.name.toLowerCase())
    if (!source.config.bindings.length) throw new Error(`MQTT: add at least one binding for ${source.name}`)
    bindingCount += source.config.bindings.length
    if (bindingCount > 256) throw new Error('MQTT: maximum 256 bindings across devices')
    const { host, port, clientId } = source.config
    if (clientId) {
      const key = JSON.stringify([host.toLowerCase(), port, clientId])
      if (clientIds.has(key)) throw new Error(`MQTT: duplicate client ID on broker ${host}:${port}`)
      clientIds.add(key)
    }
  }

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
  if (!/^[a-f0-9]{32}$/i.test(md5) || map.md5.toLowerCase() !== md5.toLowerCase())
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
    add(`${gvl.name}.`, gvl.variables, /\\bCONSTANT\\b/i.test(gvl.qualifier ?? ''))
  for (const instance of project.configuration.resource.instances) {
    const pou = project.pous.find(
      (p) => p.type === 'program' && p.data.name.toLowerCase() === instance.program.toLowerCase(),
    )
    if (pou) add(`${instance.name}.`, pou.data.variables)
  }

  // One PLC variable must not have two remote publishers writing into it.
  const claimedInputs = new Set<string>()
  const connections = sources.map(({ name, config }) => {
    const bindings = config.bindings.map((binding) => {
      const matches = map.leaves.filter((leaf) => leaf.path.toLowerCase() === binding.variable.toLowerCase())
      if (matches.length !== 1)
        throw new Error(`MQTT [${name}]: unresolved or ambiguous variable ${binding.variable}`)
      const leaf = matches[0]
      const type = String(leaf.type).toUpperCase()
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
        throw new Error(`MQTT [${name}]: unsupported variable ${binding.variable}`)
      if (binding.direction === 'subscribe') {
        if (writable.get(binding.variable.toLowerCase()) !== true)
          throw new Error(
            `MQTT: subscription requires a non-constant scalar variable without an I/O address: ${binding.variable}`,
          )
        const key = `${leaf.arrayIdx}:${leaf.elemIdx}`
        if (claimedInputs.has(key))
          throw new Error(`MQTT: multiple broker subscriptions target variable ${leaf.path}`)
        claimedInputs.add(key)
      }
      return { ...binding, variable: leaf.path, type, size: leaf.size, arr: leaf.arrayIdx, elem: leaf.elemIdx }
    })
    return { ...config, name, bindings }
  })

  if (sources.length === 1 && sources[0].legacy)
    return JSON.stringify({ ...connections[0], version: 1, programMd5: md5.toLowerCase() }, null, 2)

  return JSON.stringify({
    version: 2,
    enabled: true,
    programMd5: md5.toLowerCase(),
    connections,
  }, null, 2)
}
