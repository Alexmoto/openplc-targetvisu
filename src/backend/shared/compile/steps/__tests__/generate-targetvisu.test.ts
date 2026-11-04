import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PLCProjectSchema, PLCRemoteDeviceSchema } from '../../../types/PLC/open-plc'
import { generateModbusMasterConfig } from '../../../utils/modbus/generate-modbus-master-config'
import { computeIoImage, IMAGE_AREAS_RUNTIME_V4 } from '../compute-io-image'
import { parseTextualPouFromString } from '../../../../../frontend/utils/PLC/pou-text-parser'
import { TextEncoder } from 'util'
import { emptyVisualization, newElement, newScreen } from '../../../../../middleware/shared/targetvisu/model'
import type { PLCProjectData } from '../../../types/PLC/open-plc'
import { generateTargetVisuBundle } from '../generate-targetvisu'

Object.assign(globalThis, { TextEncoder })
const md5 = 'a'.repeat(32)
const hash = async (s: string) => createHash('md5').update(s).digest('hex')
function fixture() {
  const screen = newScreen('screen', 'Main')
  const button = newElement('button', 'button')
  button.action = { kind: 'toggle', target: 'Run', value: true }
  screen.elements.push(button)
  const project = {
    targetVisu: { ...emptyVisualization(), startScreen: screen.id, screens: [screen] },
    configuration: {
      resource: { globalVariables: [{ name: 'Run', type: { definition: 'base-type', value: 'BOOL' } }], instances: [] },
    },
    pous: [],
  } as unknown as PLCProjectData
  const map = { version: 2, md5, leaves: [{ path: 'RUN', type: 'BOOL', size: 1, arrayIdx: 0, elemIdx: 0 }] }
  return { project, map }
}
test('bundle includes matching document hashes and canonical action permissions', async () => {
  const { project, map } = fixture()
  const result = (await generateTargetVisuBundle(project, JSON.stringify(map), md5, hash))!
  expect(JSON.parse(result.deployment)).toEqual({
    version: 1,
    target: 'native-x11',
    programMd5: md5,
    documentMd5: await hash(result.document),
    writableSymbols: ['RUN'],
  })
  expect(JSON.parse(result.document)).toEqual(project.targetVisu)
})
test('no visualization does not require a debug map', async () => {
  expect(await generateTargetVisuBundle({} as PLCProjectData, '', md5, hash)).toBeUndefined()
})
test('rejects mismatched compiled program', async () => {
  const { project, map } = fixture()
  await expect(
    generateTargetVisuBundle(project, JSON.stringify({ ...map, md5: 'b'.repeat(32) }), md5, hash),
  ).rejects.toThrow('mismatch')
})
test('rejects unknown bindings', async () => {
  const { project, map } = fixture()
  project.targetVisu!.screens[0].elements[0].bindings.value = 'Missing'
  await expect(generateTargetVisuBundle(project, JSON.stringify(map), md5, hash)).rejects.toThrow('unknown variable')
})
test('rejects writes to physical inputs and constants', async () => {
  for (const restriction of [{ location: '%IX0.0' }, { flag: 'constant' }]) {
    const { project, map } = fixture()
    Object.assign(project.configuration.resource.globalVariables[0], restriction)
    await expect(generateTargetVisuBundle(project, JSON.stringify(map), md5, hash)).rejects.toThrow('read-only')
  }
})
test('rejects invalid compiled widths and indexes', async () => {
  for (const invalid of [{ size: 2 }, { elemIdx: 65536 }, { arrayIdx: -1 }]) {
    const { project, map } = fixture()
    Object.assign(map.leaves[0], invalid)
    await expect(generateTargetVisuBundle(project, JSON.stringify(map), md5, hash)).rejects.toThrow('unsupported')
  }
})
test('rejects duplicate compiled paths', async () => {
  const { project, map } = fixture()
  map.leaves.push({ ...map.leaves[0], elemIdx: 1 })
  await expect(generateTargetVisuBundle(project, JSON.stringify(map), md5, hash)).rejects.toThrow('ambiguous')
})

test('navigation exports a screen id without granting PLC write permission', async () => {
  const { project, map } = fixture()
  project.targetVisu!.screens.push(newScreen('details', 'Details'))
  project.targetVisu!.screens[0].elements[0].action = { kind: 'navigate', target: 'details', value: true }
  const result = (await generateTargetVisuBundle(project, JSON.stringify(map), md5, hash))!
  expect(JSON.parse(result.deployment).writableSymbols).toEqual([])
  expect(JSON.parse(result.document).screens[0].elements[0].action.target).toBe('details')
  project.targetVisu!.screens.pop()
  await expect(generateTargetVisuBundle(project, JSON.stringify(map), md5, hash)).rejects.toThrow('screen is missing')
})

test('embedded graphic survives upload with a matching manifest and no PLC writes', async () => {
  const { project, map } = fixture()
  const image = newElement('graphic', 'image')
  image.graphic = {
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgZAA/5Av4tR4H0AAAAAElFTkSuQmCC',
    fit: 'contain',
  }
  project.targetVisu!.screens[0].elements = [image]
  const result = (await generateTargetVisuBundle(project, JSON.stringify(map), md5, hash))!
  expect(JSON.parse(result.document).screens[0].elements[0].graphic).toEqual(image.graphic)
  expect(JSON.parse(result.deployment).writableSymbols).toEqual([])
  expect(JSON.parse(result.deployment).documentMd5).toBe(await hash(result.document))
})

test('image selector and variants are included in the Runtime bundle as read-only references', async () => {
  const { project, map } = fixture()
  const image = newElement('graphic', 'state-image')
  const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgZAA/5Av4tR4H0AAAAAElFTkSuQmCC'
  image.graphic = { data, fit: 'contain', variants: [{ value: 0, data }, { value: 1, data }] }
  image.bindings.value = 'Run'
  project.targetVisu!.screens[0].elements = [image]
  const result = (await generateTargetVisuBundle(project, JSON.stringify(map), md5, hash))!
  expect(JSON.parse(result.document).screens[0].elements[0].graphic.variants).toHaveLength(2)
  expect(JSON.parse(result.deployment).writableSymbols).toEqual([])
  expect(JSON.parse(result.document).screens[0].elements[0].bindings.value).toBe('Run')
})

test('screen background image survives deployment without creating PLC write targets', async () => {
  const { project, map } = fixture()
  const background = {
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgZAA/5Av4tR4H0AAAAAElFTkSuQmCC',
    fit: 'cover' as const,
  }
  project.targetVisu!.screens[0].elements = []
  project.targetVisu!.screens[0].backgroundGraphic = background
  const result = (await generateTargetVisuBundle(project, JSON.stringify(map), md5, hash))!
  expect(JSON.parse(result.document).screens[0].backgroundGraphic).toEqual(background)
  expect(JSON.parse(result.deployment).documentMd5).toBe(await hash(result.document))
  expect(JSON.parse(result.deployment).writableSymbols).toEqual([])
})

test('Input + Output Number exports a write permission only to its displayed numeric PLC variable', async () => {
  const { project, map } = fixture()
  project.configuration.resource.globalVariables.push({
    name: 'Setpoint',
    type: { definition: 'base-type', value: 'REAL' },
    documentation: '',
    location: '',
  })
  map.leaves.push({ path: 'Setpoint', type: 'REAL', size: 4, arrayIdx: 0, elemIdx: 1 })
  const number = newElement('number', 'setpoint')
  number.bindings.value = 'Setpoint'
  number.numberMode = 'input-output'
  number.action = { kind: 'write', target: 'Setpoint', value: 0 }
  project.targetVisu!.screens[0].elements = [number]
  const result = (await generateTargetVisuBundle(project, JSON.stringify(map), md5, hash))!
  expect(JSON.parse(result.deployment).writableSymbols).toEqual(['Setpoint'])
  expect(JSON.parse(result.document).screens[0].elements[0]).toMatchObject({
    numberMode: 'input-output',
    bindings: { value: 'Setpoint' },
    action: { kind: 'write', target: 'Setpoint' },
  })
  number.action.target = 'Run'
  await expect(generateTargetVisuBundle(project, JSON.stringify(map), md5, hash)).rejects.toThrow(
    'displayed value variable',
  )
})

test('example Modbus100Lamps project contains exactly 100 bound indicators driven by one 25-register FC03 read', async () => {
  const root = join(process.cwd(), 'examples', 'Modbus100Lamps')
  const project = PLCProjectSchema.parse(JSON.parse(readFileSync(join(root, 'project.json'), 'utf8')))
  const remote = PLCRemoteDeviceSchema.parse(
    JSON.parse(readFileSync(join(root, 'devices', 'remote', 'LampSource.json'), 'utf8')),
  )
  const source = readFileSync(join(root, 'pous', 'programs', 'main.st'), 'utf8')

  // Regression: original main.st had two top-level documentation comments
  // and no VAR_EXTERNAL declarations, so Editor failed to parse the POU and
  // STruC++ rejected all 125 referenced names as undeclared.
  const parsedMain = parseTextualPouFromString(source, 'st', 'program')
  expect(parsedMain.name).toBe('main')
  const parsedVariables = parsedMain.interface?.variables ?? []
  expect(parsedVariables).toHaveLength(125)
  expect(parsedVariables.every((v) => v.class === 'external')).toBe(true)
  expect(parsedVariables.map((v) => v.name)).toEqual(
    project.data.configuration.resource.globalVariables.map((v) => v.name),
  )
  expect(String(parsedMain.body.value).trim().split('\n')).toHaveLength(100)
  expect(source).not.toMatch(/\bAT\s+%MW/)
  expect(project.data.configuration.resource.globalVariables.slice(0, 25).map((v) => v.location)).toEqual(
    Array.from({ length: 25 }, (_, i) => `%MW${i}`),
  )

  const screen = project.data.targetVisu!.screens[0]
  const lamps = screen.elements.filter((e) => e.kind === 'indicator')
  expect(project.meta.type).toBe('plc-project')
  expect(screen.name).toBe('Main')
  expect(screen.width).toBe(1024)
  expect(screen.height).toBe(600)
  expect(lamps).toHaveLength(100)
  expect(new Set(lamps.map((e) => e.id)).size).toBe(100)
  expect(new Set(lamps.map((e) => `${e.x}:${e.y}`)).size).toBe(100)
  for (let i = 1; i <= 100; i++) {
    const e = lamps[i - 1]
    const symbol = `Lamp${String(i).padStart(3, '0')}`
    const word = Math.floor((i - 1) / 4)
    const shift = ((i - 1) % 4) * 4
    const src = `MB_W${String(word).padStart(2, '0')}`
    const expr = shift ? `SHR(${src}, ${shift})` : src
    expect(e).toMatchObject({
      name: symbol, indicatorStyle: 'lamp12', bindings: { value: symbol },
    })
    expect(source).toContain(`${symbol} := ${expr} AND WORD#16#000F;`)
    expect(e.x + e.width).toBeLessThanOrEqual(screen.width)
    expect(e.y + e.height).toBeLessThanOrEqual(screen.height)
  }

  const variables = project.data.configuration.resource.globalVariables
  expect(variables).toHaveLength(125)
  for (let i = 0; i < 25; i++) {
    expect(variables[i]).toMatchObject({
      name: `MB_W${String(i).padStart(2, '0')}`,
      location: `%MW${i}`,
      type: { definition: 'base-type', value: 'WORD' },
    })
  }
  const [modbus] = JSON.parse(generateModbusMasterConfig([remote])!)
  expect(modbus.config).toMatchObject({
    transport: 'tcp', host: '192.168.1.138', port: 502,
    slave_id: 1, timeout_ms: 1000,
  })
  expect(modbus.config.io_points).toEqual([expect.objectContaining({
    fc: 3, offset: '0x0000', iec_location: '%MW0',
    len: 25, cycle_time_ms: 250, error_handling: 'set-to-zero',
  })])

  // A 25-register request alone is NOT enough for the IO-image compiler.
  // Each register must also have an explicit Modbus Master producer ioPoint.
  const points = remote.modbusTcpConfig!.ioGroups[0].ioPoints!
  expect(points).toHaveLength(25)
  expect(points.map((point) => point.iecLocation)).toEqual(
    Array.from({ length: 25 }, (_, i) => `%MW${i}`),
  )
  const computeImage = (ioPoints: typeof points) =>
    computeIoImage({
      projectData: {
        ...project.data,
        remoteDevices: [{
          ...remote,
          modbusTcpConfig: {
            ...remote.modbusTcpConfig!,
            ioGroups: [{ ...remote.modbusTcpConfig!.ioGroups[0], ioPoints }],
          },
        }],
      },
      capabilities: { pinMapping: false, vppIo: false, modbusTcpRemote: true, ethercat: false },
      serverCapabilities: { modbusTcpServer: false, opcuaServer: false, s7Server: false },
      areas: IMAGE_AREAS_RUNTIME_V4,
    })
  const image = computeImage(points)
  expect(image.sizes['%MW']).toBe(25)
  expect(image.unbacked).toEqual([])
  expect(image.unsupported).toEqual([])
  // Regression: the original fixture described only %MW0, although FC03
  // reads 25 values. It must be rejected with 24 unbacked locations.
  expect(computeImage(points.slice(0, 1)).unbacked).toHaveLength(24)

  // Smoke-check the TargetVisu deployment bundle with a synthetic compiled
  // debug map. The actual ST native compilation must be tested in Editor.
  const map = {
    version: 2,
    md5,
    leaves: variables.map((v, i) => ({
      path: v.name, type: 'WORD', size: 2, arrayIdx: 0, elemIdx: i,
    })),
  }
  const bundle = (await generateTargetVisuBundle(project.data, JSON.stringify(map), md5, hash))!
  expect(JSON.parse(bundle.document).screens[0].elements).toHaveLength(101)
  expect(JSON.parse(bundle.deployment).writableSymbols).toEqual([])
})
