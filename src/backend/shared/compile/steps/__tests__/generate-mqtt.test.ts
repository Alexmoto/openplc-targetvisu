import { generateMqttConfig } from '../generate-mqtt'
import { emptyMqtt, MqttSchema } from '@root/middleware/shared/mqtt/model'
import type { PLCProjectData } from '../../../types/PLC/open-plc'

const md5 = 'a'.repeat(32)
const binding = {
  id: 'one',
  variable: 'Temperature',
  direction: 'subscribe' as const,
  topic: 'sensor/temp',
  qos: 1 as const,
  retain: false,
  jsonPointer: '/value',
}
function fixture() {
  const project = {
    mqtt: { ...emptyMqtt(), enabled: true, bindings: [{ ...binding }] },
    pous: [],
    configuration: {
      resource: {
        globalVariables: [{ name: 'Temperature', type: { definition: 'base-type', value: 'REAL' } }],
        instances: [],
      },
    },
  } as unknown as PLCProjectData
  const map = { version: 2, md5, leaves: [{ path: 'TEMPERATURE', type: 'REAL', size: 4, arrayIdx: 3, elemIdx: 8 }] }
  return { project, map }
}
test('resolves canonical addresses and preserves exact topic and JSON pointer', () => {
  const { project, map } = fixture()
  const result = JSON.parse(generateMqttConfig(project, JSON.stringify(map), md5)!)
  expect(result.bindings[0]).toEqual({ ...binding, variable: 'TEMPERATURE', arr: 3, elem: 8, type: 'REAL', size: 4 })
  expect(result.programMd5).toBe(md5)
})
test('disabled/legacy projects emit no configuration', () => {
  expect(generateMqttConfig({} as PLCProjectData, '', '')).toBeUndefined()
})
test.each([{ flag: 'constant' }, { location: '%IX0.0' }, { location: '%MW0' }])(
  'rejects external writes to restricted variable %p',
  (restriction) => {
    const { project, map } = fixture()
    Object.assign(project.configuration.resource.globalVariables[0], restriction)
    expect(() => generateMqttConfig(project, JSON.stringify(map), md5)).toThrow('subscription requires')
  },
)
test.each([{ size: 8 }, { elemIdx: -1 }, { arrayIdx: 256 }, { type: 'STRING' }])(
  'rejects invalid compiled leaves %p',
  (restriction) => {
    const { project, map } = fixture()
    Object.assign(map.leaves[0], restriction)
    expect(() => generateMqttConfig(project, JSON.stringify(map), md5)).toThrow('unsupported')
  },
)
test('fails on stale map and missing symbols', () => {
  const { project, map } = fixture()
  expect(() => generateMqttConfig(project, JSON.stringify(map), 'b'.repeat(32))).toThrow('mismatch')
  map.leaves = []
  expect(() => generateMqttConfig(project, JSON.stringify(map), md5)).toThrow('unresolved')
})
test('rejects wildcards, feedback and duplicate input bindings', () => {
  const base = { ...emptyMqtt(), bindings: [binding] }
  expect(MqttSchema.safeParse({ ...base, bindings: [{ ...binding, topic: 'a/+' }] }).success).toBe(false)
  expect(MqttSchema.safeParse({ ...base, bindings: [binding, { ...binding, id: 'two' }] }).success).toBe(false)
  expect(
    MqttSchema.safeParse({
      ...base,
      bindings: [binding, { ...binding, id: 'two', direction: 'publish', jsonPointer: '' }],
    }).success,
  ).toBe(false)
})
