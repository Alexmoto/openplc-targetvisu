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

test('compiles per-binding publish policy and preserves legacy project defaults', () => {
  const { project, map } = fixture()
  const publisher = project.mqtt!.bindings[0]
  publisher.direction = 'publish'
  publisher.jsonPointer = ''
  publisher.publishMode = 'interval'
  publisher.publishIntervalMs = 2000
  let out = JSON.parse(generateMqttConfig(project, JSON.stringify(map), md5)!)
  expect(out.bindings[0]).toMatchObject({ publishMode: 'interval', publishIntervalMs: 2000 })
  publisher.publishMode = 'on-change'
  delete publisher.publishIntervalMs
  out = JSON.parse(generateMqttConfig(project, JSON.stringify(map), md5)!)
  expect(out.bindings[0].publishMode).toBe('on-change')
  delete publisher.publishMode
  out = JSON.parse(generateMqttConfig(project, JSON.stringify(map), md5)!)
  expect(out.bindings[0].publishMode).toBeUndefined()
  expect(out.intervalMs).toBe(500)
})

test('rejects publish policies on subscriptions and invalid publish intervals', () => {
  const { project } = fixture()
  const base = project.mqtt!
  expect(MqttSchema.safeParse({ ...base, bindings: [{ ...binding, publishMode: 'on-change' }] }).success).toBe(false)
  expect(MqttSchema.safeParse({
    ...base, bindings: [{ ...binding, direction: 'publish', jsonPointer: '',
      publishMode: 'interval', publishIntervalMs: 50 }],
  }).success).toBe(false)
})

test('compiles separate MQTT remote devices into independent v2 broker connections', () => {
  const { project, map } = fixture()
  project.mqtt = undefined
  project.remoteDevices = [
    {
      name: 'Boiler',
      protocol: 'mqtt',
      mqttConfig: { ...emptyMqtt(), enabled: true, host: '192.168.1.35', bindings: [
        { ...binding, id: 't1', topic: 'tele/boiler/SENSOR' },
      ] },
    },
    {
      name: 'Workshop',
      protocol: 'mqtt',
      mqttConfig: { ...emptyMqtt(), enabled: true, host: 'broker-workshop', clientId: 'workshop-plc', bindings: [
        { ...binding, id: 'set', direction: 'publish', topic: 'cmnd/workshop/set',
          jsonPointer: '', publishMode: 'on-change' },
      ] },
    },
  ]
  const out = JSON.parse(generateMqttConfig(project, JSON.stringify(map), md5)!)
  expect(out.version).toBe(2)
  expect(out.connections).toHaveLength(2)
  expect(out.connections.map((c: { name: string }) => c.name)).toEqual(['Boiler', 'Workshop'])
  expect(out.connections[0].host).toBe('192.168.1.35')
  expect(out.connections[1].clientId).toBe('workshop-plc')
  expect(out.connections[1].bindings[0]).toMatchObject({
    type: 'REAL', arr: 3, elem: 8, direction: 'publish', publishMode: 'on-change',
  })
  expect(out.programMd5).toBe(md5)
})

test('rejects multiple brokers writing the same PLC variable', () => {
  const { project, map } = fixture()
  project.mqtt = undefined
  project.remoteDevices = ['A', 'B'].map((name) => ({
    name, protocol: 'mqtt',
    mqttConfig: { ...emptyMqtt(), enabled: true, bindings: [
      { ...binding, id: name, topic: `sensor/${name}` },
    ] },
  }))
  expect(() => generateMqttConfig(project, JSON.stringify(map), md5)).toThrow('multiple broker subscriptions')
})

test('keeps v1 legacy config and supports legacy alongside a named broker', () => {
  const { project, map } = fixture()
  let cfg = JSON.parse(generateMqttConfig(project, JSON.stringify(map), md5)!)
  expect(cfg.version).toBe(1)
  expect(cfg.bindings).toHaveLength(1)
  project.remoteDevices = [{
    name: 'Second',
    protocol: 'mqtt',
    mqttConfig: { ...emptyMqtt(), enabled: true, host: 'other', bindings: [
      { ...binding, id: 'p', direction: 'publish', topic: 'plc/out', jsonPointer: '' },
    ] },
  }]
  cfg = JSON.parse(generateMqttConfig(project, JSON.stringify(map), md5)!)
  expect(cfg.version).toBe(2)
  expect(cfg.connections.map((c: { name: string }) => c.name)).toEqual(['Legacy MQTT', 'Second'])
})

test('ignores disabled MQTT remote devices', () => {
  const { project, map } = fixture()
  project.mqtt = undefined
  project.remoteDevices = [{ name: 'Unused', protocol: 'mqtt', mqttConfig: emptyMqtt() }]
  expect(generateMqttConfig(project, JSON.stringify(map), md5)).toBeUndefined()
})
