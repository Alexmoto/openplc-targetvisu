import { generateModbusMasterConfig, generateModbusDiagnosticsConfig } from '../generate-modbus-master-config'
import { diagnosticDefaults, validateDiagnostics } from '../../../../../middleware/shared/utils/modbus-diagnostics'
import { ModbusIOGroupSchema } from '../../../types/PLC/open-plc'
import {
  migrateToRegistry,
  unpinAllocatableChannels,
  allocateAddresses,
} from '../../../../../middleware/shared/utils/iec-address/registry'
import type { PLCRemoteDevice } from '../../../../../middleware/shared/ports/types'

const makeDevice = (): PLCRemoteDevice => ({
  name: 'Meter',
  protocol: 'modbus-tcp',
  modbusTcpConfig: {
    transport: 'rtu',
    serialPort: '/dev/ttyUSB0',
    timeout: 1000,
    slaveId: 1,
    ioGroups: [
      {
        id: 'g1',
        name: 'Temperature',
        functionCode: '3',
        cycleTime: 500,
        offset: '16',
        length: 1,
        errorHandling: 'keep-last-value',
        diagnostics: diagnosticDefaults(),
        ioPoints: [{ id: 'p1', name: 'Raw', type: 'WORD', iecLocation: '%IW0' }],
      },
    ],
  },
})

it('preserves diagnostics through schema and emits RTU config plus exact sidecar signature', () => {
  const device = makeDevice()
  const group = device.modbusTcpConfig!.ioGroups[0]
  expect(ModbusIOGroupSchema.parse(group).diagnostics).toEqual(group.diagnostics)
  const master = generateModbusMasterConfig([device])!
  const parsed = JSON.parse(master)[0]
  expect(parsed.config.diagnostics_version).toBe(1)
  expect(parsed.config.io_points[0].diagnostics.locations.ok).toBe('%MX100.0')
  const sidecar = JSON.parse(generateModbusDiagnosticsConfig([device], master)!)
  expect(sidecar.groups[0].expected).toEqual({ fc: 3, offset: 16, location: '%IW0', length: 1 })
  expect(sidecar.groups[0].locations.publish_counter).toBe('%MD104')
})

it('reserves actual diagnostic addresses through recalculation without creating a server', () => {
  const registry = unpinAllocatableChannels(migrateToRegistry({ remoteDevices: [makeDevice()] }))
  const result = allocateAddresses(registry.consumers)
  expect(result.slotCounts['%MX']).toBe(802)
  expect(result.slotCounts['%MW']).toBe(102)
  expect(result.slotCounts['%MD']).toBe(105)
  const consumer = registry.consumers.find((c) => c.id.startsWith('diagnostics:'))!
  expect(consumer.channels.find((c) => c.channelId === 'ok')!.pinned).toBe('%MX100.0')
})

it('disabled diagnostics sizes no memory and explicitly supersedes legacy config', () => {
  const device = makeDevice()
  device.modbusTcpConfig!.ioGroups[0].diagnostics!.enabled = false
  const master = generateModbusMasterConfig([device])!
  expect(JSON.parse(master)[0].config.diagnostics_version).toBe(1)
  expect(generateModbusDiagnosticsConfig([device], master)).toBeNull()
  const result = allocateAddresses(migrateToRegistry({ remoteDevices: [device] }).consumers)
  expect(result.slotCounts['%MX']).toBeUndefined()
})

it('refuses wrong bank, invalid bit, duplicate location and impossible stale time', () => {
  const d = diagnosticDefaults()
  d.locations.ok = '%MW0'
  expect(validateDiagnostics(d, 500).length).toBeGreaterThan(0)
  d.locations.ok = '%MX0.8'
  expect(validateDiagnostics(d, 500).length).toBeGreaterThan(0)
  d.locations.ok = '%MX100.0'
  d.locations.response_ok = d.locations.ok
  expect(validateDiagnostics(d, 500).join()).toContain('Duplicate')
  d.staleMs = 100
  expect(validateDiagnostics(d, 500).join()).toContain('Stale')
})

it('rejects collisions between groups and with the complete data range', () => {
  const device = makeDevice()
  const group = device.modbusTcpConfig!.ioGroups[0]
  device.modbusTcpConfig!.ioGroups.push({ ...group, id: 'g2', name: 'Second' })
  expect(() => generateModbusMasterConfig([device])).toThrow('collision')
  device.modbusTcpConfig!.ioGroups.pop()
  group.ioPoints![0].iecLocation = '%MW99'
  group.length = 2
  expect(() => generateModbusMasterConfig([device])).toThrow('collision')
})
