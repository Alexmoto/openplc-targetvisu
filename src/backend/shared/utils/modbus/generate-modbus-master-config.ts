import type { ModbusIOGroup, PLCRemoteDevice } from '../../../../middleware/shared/ports/types'
import { validateDiagnostics } from '../../../../middleware/shared/utils/modbus-diagnostics'

interface ModbusMasterIOPoint {
  fc: number
  offset: string
  iec_location: string
  len: number
  cycle_time_ms: number
  /** What the runtime does with this point's IEC buffer while the device is
   *  unreachable. The UI has offered the choice per I/O group for a while, but
   *  it never reached the config — so the runtime always kept the last value
   *  (openplc-editor#691). Emitted for every point so a config never leaves
   *  the behaviour implicit. */
  diagnostics?: { stale_ms: number; locations: Record<string, string> }
  error_handling: ModbusIOGroup['errorHandling']
}

// Base device config with common fields
interface ModbusMasterDeviceConfigBase {
  diagnostics_version: 1
  type: 'SLAVE'
  transport: 'tcp' | 'rtu'
  timeout_ms: number
  slave_id: number
  io_points: ModbusMasterIOPoint[]
}

// TCP-specific config
interface ModbusMasterTcpDeviceConfig extends ModbusMasterDeviceConfigBase {
  transport: 'tcp'
  host: string
  port: number
}

// RTU-specific config
interface ModbusMasterRtuDeviceConfig extends ModbusMasterDeviceConfigBase {
  transport: 'rtu'
  serial_port: string
  baud_rate: number
  parity: string
  stop_bits: number
  data_bits: number
}

type ModbusMasterDeviceConfig = ModbusMasterTcpDeviceConfig | ModbusMasterRtuDeviceConfig

interface ModbusMasterDevice {
  name: string
  protocol: 'MODBUS'
  config: ModbusMasterDeviceConfig
}

type ModbusMasterConfig = ModbusMasterDevice[]

/**
 * Sink for non-fatal diagnostics emitted while building the config
 * (e.g. an RTU device dropped for a missing serial port).  The compile
 * pipeline wires this to the build console so the skip is visible to
 * the user instead of vanishing into `console.warn`.
 */
type ModbusMasterConfigLog = (message: string) => void

/**
 * Formats an offset value as a hexadecimal string.
 * If the offset is already in hex format (starts with 0x), returns it as-is.
 * Otherwise, converts the decimal number to hex format.
 */
const formatOffsetAsHex = (offset: string): string => {
  const trimmedOffset = offset.trim()
  if (trimmedOffset.toLowerCase().startsWith('0x')) {
    return trimmedOffset
  }
  const numericOffset = parseInt(trimmedOffset, 10)
  if (isNaN(numericOffset)) {
    return '0x0000'
  }
  return `0x${numericOffset.toString(16).padStart(4, '0').toUpperCase()}`
}

/**
 * Converts a ModbusIOGroup to a ModbusMasterIOPoint for the runtime configuration.
 * Uses the first IO point's IEC location as the starting address for the group.
 */
const convertIOGroupToIOPoint = (ioGroup: ModbusIOGroup): ModbusMasterIOPoint => {
  if (ioGroup.diagnostics?.enabled) {
    const errors = validateDiagnostics(ioGroup.diagnostics, ioGroup.cycleTime)
    if (errors.length) throw new Error(`${ioGroup.name}: ${errors.join(' ')}`)
  }
  const firstIOPoint = ioGroup.ioPoints?.[0]
  const iecLocation = firstIOPoint?.iecLocation || '%MW0'

  return {
    ...(ioGroup.diagnostics?.enabled
      ? {
          diagnostics: {
            stale_ms: ioGroup.diagnostics.staleMs,
            locations: Object.fromEntries(
              Object.entries(ioGroup.diagnostics.locations).filter(([, v]) => !!v),
            ) as Record<string, string>,
          },
        }
      : {}),
    fc: parseInt(ioGroup.functionCode, 10),
    offset: formatOffsetAsHex(ioGroup.offset),
    iec_location: iecLocation,
    len: ioGroup.length,
    cycle_time_ms: ioGroup.cycleTime,
    // Groups saved before the field existed have no value; the runtime's
    // historical behaviour is to keep the last value, so default to it.
    error_handling: ioGroup.errorHandling ?? 'keep-last-value',
  }
}

/**
 * Converts a PLCRemoteDevice with Modbus configuration to a ModbusMasterDevice
 * for the runtime configuration. Supports both TCP and RTU transports.
 */
const convertRemoteDeviceToModbusMaster = (
  device: PLCRemoteDevice,
  log?: ModbusMasterConfigLog,
): ModbusMasterDevice | null => {
  /* istanbul ignore next -- defensive: callers pre-filter to modbus-tcp with config */
  if (device.protocol !== 'modbus-tcp' || !device.modbusTcpConfig) {
    return null
  }

  const { modbusTcpConfig } = device
  const ioGroups = modbusTcpConfig.ioGroups || []

  if (ioGroups.length === 0) {
    return null
  }

  const ioPoints: ModbusMasterIOPoint[] = ioGroups.map(convertIOGroupToIOPoint)

  // Determine transport type (defaults to 'tcp' for backward compatibility)
  const transport = modbusTcpConfig.transport || 'tcp'

  if (transport === 'rtu') {
    // RTU configuration
    if (!modbusTcpConfig.serialPort) {
      // RTU requires a serial port.  Route the skip through the caller's
      // log so it lands in the build console — otherwise the device is
      // dropped silently and the runtime just reports "no config found".
      log?.(`Modbus RTU device "${device.name}" is missing a serial port configuration and will be skipped.`)
      return null
    }

    return {
      name: device.name,
      protocol: 'MODBUS',
      config: {
        diagnostics_version: 1,
        type: 'SLAVE',
        transport: 'rtu',
        serial_port: modbusTcpConfig.serialPort,
        baud_rate: modbusTcpConfig.baudRate ?? 9600,
        parity: modbusTcpConfig.parity ?? 'N',
        stop_bits: modbusTcpConfig.stopBits ?? 1,
        data_bits: modbusTcpConfig.dataBits ?? 8,
        timeout_ms: modbusTcpConfig.timeout,
        slave_id: modbusTcpConfig.slaveId ?? 1,
        io_points: ioPoints,
      },
    }
  } else {
    // TCP configuration (default)
    return {
      name: device.name,
      protocol: 'MODBUS',
      config: {
        diagnostics_version: 1,
        type: 'SLAVE',
        transport: 'tcp',
        host: modbusTcpConfig.host ?? '127.0.0.1',
        port: modbusTcpConfig.port ?? 502,
        timeout_ms: modbusTcpConfig.timeout,
        slave_id: modbusTcpConfig.slaveId ?? 1,
        io_points: ioPoints,
      },
    }
  }
}

/**
 * Generates the Modbus Master plugin configuration JSON from the project's remote devices.
 * Returns null if there are no Modbus TCP devices configured.
 *
 * @param remoteDevices - Array of PLCRemoteDevice from the project data
 * @param log - Optional sink for non-fatal skip diagnostics (e.g. an RTU
 *   device dropped for a missing serial port). Wired to the build console.
 * @returns The Modbus Master configuration as a JSON string, or null if no devices are configured
 */
export const generateModbusMasterConfig = (
  remoteDevices: PLCRemoteDevice[] | undefined,
  log?: ModbusMasterConfigLog,
): string | null => {
  if (!remoteDevices || remoteDevices.length === 0) {
    return null
  }

  const modbusTcpDevices = remoteDevices.filter((device) => device.protocol === 'modbus-tcp' && device.modbusTcpConfig)

  if (modbusTcpDevices.length === 0) {
    return null
  }

  const config: ModbusMasterConfig = modbusTcpDevices
    .map((device) => convertRemoteDeviceToModbusMaster(device, log))
    .filter((device): device is ModbusMasterDevice => device !== null)

  if (config.length === 0) {
    return null
  }

  const serialized = JSON.stringify(config, null, 2)
  generateModbusDiagnosticsConfig(remoteDevices, serialized)
  return serialized
}

export type { ModbusMasterConfig, ModbusMasterDevice, ModbusMasterDeviceConfig, ModbusMasterIOPoint }

/** Derive the diagnostic sidecar from the exact master config shipped to Runtime. */
export function generateModbusDiagnosticsConfig(
  devices: PLCRemoteDevice[] | undefined,
  master: string | null,
): string | null {
  if (!master) return null
  const used = new Set<string>()
  const masterConfig = JSON.parse(master) as ModbusMasterConfig
  for (const device of masterConfig) {
    for (const point of device.config.io_points) {
      const match = /^%([IQM])([XBWDL])(\d+)(?:\.([0-7]))?$/.exec(point.iec_location)
      if (!match) continue
      for (let i = 0; i < point.len; i++) {
        if (match[2] === 'X') {
          const bit = Number(match[3]) * 8 + Number(match[4]) + i
          used.add(`%${match[1]}X${Math.floor(bit / 8)}.${bit % 8}`)
        } else used.add(`%${match[1]}${match[2]}${Number(match[3]) + i}`)
      }
    }
  }
  const groups: object[] = []
  const emitted = JSON.parse(master) as ModbusMasterConfig
  for (const device of emitted) {
    const source = devices?.find((entry) => entry.name === device.name)
    for (const [index, group] of (source?.modbusTcpConfig?.ioGroups ?? []).entries()) {
      const diagnostics = group.diagnostics
      if (!diagnostics?.enabled) continue
      const errors = validateDiagnostics(diagnostics, group.cycleTime)
      if (errors.length) throw new Error(`${device.name}/${group.name}: ${errors.join(' ')}`)
      const point = device.config.io_points[index]
      const locations = Object.fromEntries(Object.entries(diagnostics.locations).filter(([, value]) => !!value))
      for (const address of Object.values(locations)) {
        if (used.has(address)) throw new Error(`Modbus diagnostics address collision: ${address}`)
        used.add(address)
      }
      groups.push({
        device: device.name,
        group: index,
        expected: { fc: point.fc, offset: parseInt(point.offset, 16), location: point.iec_location, length: point.len },
        stale_ms: diagnostics.staleMs,
        locations,
      })
    }
  }
  return groups.length ? JSON.stringify({ version: 1, publish_ms: 100, groups }, null, 2) : null
}
