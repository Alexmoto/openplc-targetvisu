// SPDX-License-Identifier: GPL-3.0-only
import * as Dialog from '@radix-ui/react-dialog'
import { useOpenPLCStore } from '@root/frontend/store'
import { newUuid } from '@root/frontend/utils/new-uuid'
import { emptyMqtt, MQTT_TYPES, type MqttConfig, MqttSchema } from '@root/middleware/shared/mqtt/model'
import { collectVisuSymbols } from '@root/middleware/shared/targetvisu/symbols'
import { useMemo, useState } from 'react'

export function MqttEditor({ onClose }: { onClose: () => void }) {
  const project = useOpenPLCStore((s) => s.project)
  const compileReady = useOpenPLCStore((s) => s.projectActions.getCompileReadyProjectData)
  const update = useOpenPLCStore((s) => s.projectActions.updateMqtt)
  const markDirty = useOpenPLCStore((s) => s.workspaceActions.setEditingState)
  const canEdit = useOpenPLCStore((s) => s.workspace.canEdit)
  const [draft, setDraft] = useState<MqttConfig>(() => structuredClone(project.data.mqtt ?? emptyMqtt()))
  const [error, setError] = useState('')
  const symbols = useMemo(
    () =>
      collectVisuSymbols({ ...project.data, ...compileReady() }).filter((s) =>
        (MQTT_TYPES as readonly string[]).includes(s.type),
      ),
    [project.data, compileReady],
  )
  const field = (key: keyof MqttConfig, value: unknown) => setDraft((old) => ({ ...old, [key]: value }))
  const binding = (index: number, patch: Partial<MqttConfig['bindings'][number]>) =>
    setDraft((old) => ({ ...old, bindings: old.bindings.map((b, i) => (i === index ? { ...b, ...patch } : b)) }))
  const inputClass =
    'rounded border border-neutral-400 bg-white p-1 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-50 bg-black/50' />
        <Dialog.Content
          aria-label='MQTT data source'
          className='fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[95vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded bg-white p-6 text-sm text-neutral-900 shadow-xl dark:bg-neutral-950 dark:text-neutral-100'
        >
          <Dialog.Title className='mb-3 text-lg font-semibold'>MQTT — PLC variables</Dialog.Title>
          <Dialog.Description className='mb-3'>
            Runtime v4 · MQTT 3.1.1 · exact topics · scalar values or JSON fields. Subscriptions keep the last value on
            disconnect; the PLC program can overwrite it.
          </Dialog.Description>
          <fieldset disabled={!canEdit}>
            <label>
              <input type='checkbox' checked={draft.enabled} onChange={(e) => field('enabled', e.target.checked)} />{' '}
              Enable MQTT
            </label>
            <div className='my-4 grid grid-cols-3 gap-3'>
              {(['host', 'port', 'clientId', 'username', 'password', 'caFile', 'keepalive', 'intervalMs'] as const).map(
                (key) => (
                  <label key={key} className='flex flex-col gap-1'>
                    {
                      {
                        host: 'Broker host',
                        port: 'Port',
                        clientId: 'Client ID (empty = automatic)',
                        username: 'Username',
                        password: 'Password',
                        caFile: 'CA file on Runtime (optional)',
                        keepalive: 'Keepalive (seconds)',
                        intervalMs: 'Publish interval (ms)',
                      }[key]
                    }
                    <input
                      className={inputClass}
                      type={key === 'password' ? 'password' : typeof draft[key] === 'number' ? 'number' : 'text'}
                      value={draft[key]}
                      onChange={(e) =>
                        field(key, typeof draft[key] === 'number' ? Number(e.target.value) : e.target.value)
                      }
                    />
                  </label>
                ),
              )}
              <label>
                <input type='checkbox' checked={draft.tls} onChange={(e) => field('tls', e.target.checked)} /> TLS
                (verify certificate and hostname)
              </label>
            </div>
            <p className='mb-3'>
              Credentials are saved in the project and uploaded to Runtime. Default TLS port is 8883. Leave CA file
              empty to use system trust.
            </p>
            <table className='w-full text-left'>
              <thead>
                <tr>
                  {['Direction', 'PLC variable', 'Topic', 'JSON pointer', 'QoS', 'Retain', ''].map((v, i) => (
                    <th key={i} className='p-1'>
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.bindings.map((b, i) => (
                  <tr key={b.id}>
                    <td>
                      <select
                        aria-label={`Direction ${i + 1}`}
                        className={inputClass}
                        value={b.direction}
                        onChange={(e) =>
                          binding(i, { direction: e.target.value as typeof b.direction, jsonPointer: '' })
                        }
                      >
                        <option value='subscribe'>Subscribe</option>
                        <option value='publish'>Publish</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Variable ${i + 1}`}
                        className={inputClass}
                        list='mqtt-variables'
                        value={b.variable}
                        onChange={(e) => binding(i, { variable: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Topic ${i + 1}`}
                        className={inputClass}
                        value={b.topic}
                        onChange={(e) => binding(i, { topic: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`JSON pointer ${i + 1}`}
                        className={inputClass}
                        disabled={b.direction === 'publish'}
                        placeholder='/temperature'
                        value={b.jsonPointer}
                        onChange={(e) => binding(i, { jsonPointer: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`QoS ${i + 1}`}
                        className={inputClass}
                        value={b.qos}
                        onChange={(e) => binding(i, { qos: Number(e.target.value) as 0 | 1 | 2 })}
                      >
                        {[0, 1, 2].map((q) => (
                          <option key={q}>{q}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Retain ${i + 1}`}
                        type='checkbox'
                        disabled={b.direction === 'subscribe'}
                        checked={b.retain}
                        onChange={(e) => binding(i, { retain: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        aria-label={`Remove binding ${i + 1}`}
                        type='button'
                        onClick={() =>
                          field(
                            'bindings',
                            draft.bindings.filter((_, j) => j !== i),
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id='mqtt-variables'>
              {symbols.map((s) => (
                <option key={s.path} value={s.path}>
                  {s.type}
                </option>
              ))}
            </datalist>
            <button
              type='button'
              className='my-3 rounded border px-3 py-1'
              onClick={() =>
                field('bindings', [
                  ...draft.bindings,
                  {
                    id: newUuid(),
                    direction: 'subscribe',
                    variable: '',
                    topic: '',
                    qos: 0,
                    retain: false,
                    jsonPointer: '',
                  },
                ])
              }
            >
              Add binding
            </button>
          </fieldset>
          {error && (
            <p role='alert' className='my-2 text-red-600'>
              {error}
            </p>
          )}
          <div className='mt-3 flex justify-end gap-3'>
            <button type='button' onClick={onClose}>
              Cancel
            </button>
            <button
              type='button'
              disabled={!canEdit}
              className='rounded bg-blue-600 px-4 py-2 text-white'
              onClick={() => {
                const parsed = MqttSchema.safeParse(draft)
                if (!parsed.success) {
                  setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
                  return
                }
                if (draft.enabled && !draft.bindings.length) {
                  setError('Add at least one binding')
                  return
                }
                update(parsed.data)
                markDirty('unsaved')
                onClose()
              }}
            >
              Apply
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
