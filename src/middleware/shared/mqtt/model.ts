// SPDX-License-Identifier: GPL-3.0-only
import { z } from 'zod'

export const MQTT_TYPES = [
  'BOOL',
  'SINT',
  'USINT',
  'BYTE',
  'INT',
  'UINT',
  'WORD',
  'DINT',
  'UDINT',
  'DWORD',
  'LINT',
  'ULINT',
  'LWORD',
  'REAL',
  'LREAL',
] as const
const topic = z
  .string()
  .min(1)
  .max(1024)
  .refine((v) => !v.includes('\0') && !/[+#]/.test(v), 'Use an exact topic without +, # or NUL')
export const MqttSchema = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65535),
    clientId: z.string().max(128),
    username: z.string().max(256),
    password: z.string().max(1024),
    tls: z.boolean(),
    caFile: z.string().max(1024),
    keepalive: z.number().int().min(5).max(3600),
    intervalMs: z.number().int().min(100).max(60000),
    bindings: z
      .array(
        z.object({
          id: z.string().min(1),
          direction: z.enum(['subscribe', 'publish']),
          variable: z.string().min(1),
          topic,
          qos: z.union([z.literal(0), z.literal(1), z.literal(2)]),
          retain: z.boolean(),
          jsonPointer: z
            .string()
            .max(512)
            .refine(
              (v) => v === '' || (v.startsWith('/') && !/~(?![01])/.test(v)),
              'Use a JSON pointer such as /temperature',
            ),
        }),
      )
      .max(256),
  })
  .superRefine((config, ctx) => {
    const inputs = new Set<string>(),
      outputs = new Set<string>(),
      ids = new Set<string>()
    config.bindings.forEach((b, index) => {
      const error = (message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index], message })
      if (ids.has(b.id)) error('Duplicate binding id')
      ids.add(b.id)
      if (b.direction === 'subscribe') {
        const key = b.variable.toLowerCase()
        if (inputs.has(key)) error('Only one subscription may write a variable')
        inputs.add(key)
      } else {
        if (outputs.has(b.topic)) error('Only one publisher per topic')
        outputs.add(b.topic)
        if (b.jsonPointer) error('JSON pointer is only supported for subscriptions')
      }
    })
    if (config.bindings.some((b) => b.direction === 'subscribe' && outputs.has(b.topic)))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bindings'],
        message: 'Use separate publish and subscribe topics to avoid feedback',
      })
  })
export type MqttConfig = z.infer<typeof MqttSchema>
export const emptyMqtt = (): MqttConfig => ({
  enabled: false,
  host: 'localhost',
  port: 1883,
  clientId: '',
  username: '',
  password: '',
  tls: false,
  caFile: '',
  keepalive: 30,
  intervalMs: 500,
  bindings: [],
})
