import type { ModbusIOGroup, PLCPou } from '@root/middleware/shared/ports/types'
import type { DiagnosticField, ModbusDiagnostics } from '@root/middleware/shared/utils/modbus-diagnostics'
import {
  DIAGNOSTIC_FIELDS,
  diagnosticDefaults,
  validateDiagnostics,
} from '@root/middleware/shared/utils/modbus-diagnostics'
import { useEffect, useState } from 'react'

import { Modal, ModalContent, ModalFooter,ModalHeader, ModalTitle } from '../../../../../_molecules/modal'

export function DiagnosticsModal({
  group,
  suggestedBase,
  pous,
  onClose,
  onSave,
}: {
  group: ModbusIOGroup | null
  suggestedBase: number
  pous: PLCPou[]
  onClose: () => void
  onSave: (diagnostics: ModbusDiagnostics, pou: string, prefix: string) => string | undefined
}) {
  const [draft, setDraft] = useState<ModbusDiagnostics>(diagnosticDefaults())
  const [prefix, setPrefix] = useState('MB0')
  const [pou, setPou] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!group) return
    setDraft(
      group.diagnostics
        ? { ...group.diagnostics, locations: { ...group.diagnostics.locations } }
        : diagnosticDefaults(suggestedBase),
    )
    setPrefix(group.diagnostics?.variables?.prefix ?? `MB_${group.name.replace(/[^A-Za-z0-9_]/g, '_')}`)
    setPou(group.diagnostics?.variables?.pou ?? '')
    setError('')
  }, [group, suggestedBase])
  if (!group) return null
  const errors = validateDiagnostics(draft, group.cycleTime)
  const input = 'rounded border border-neutral-400 bg-transparent px-2 py-1 text-sm'
  return (
    <Modal open={!!group} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className='max-h-[85vh] w-[680px] overflow-y-auto' onClose={onClose}>
        <ModalHeader>
          <ModalTitle>Modbus Diagnostics — {group.name}</ModalTitle>
        </ModalHeader>
        <div className='flex flex-col gap-3 py-3 text-neutral-950 dark:text-white'>
          <label className='flex gap-2'>
            <input
              type='checkbox'
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            Enable group diagnostics
          </label>
          <label className='flex items-center gap-2'>
            Stale time (ms)
            <input
              aria-label='Stale time (ms)'
              type='number'
              className={input}
              value={draft.staleMs}
              onChange={(e) => setDraft({ ...draft, staleMs: Number(e.target.value) })}
            />
          </label>
          <p className='text-xs'>
            Memory is reserved automatically. Leave an optional address empty to omit that field. CommOK is required.
          </p>
          <table className='text-left text-sm'>
            <thead>
              <tr>
                <th>Variable suffix</th>
                <th>IEC type</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(DIAGNOSTIC_FIELDS).map(([field, spec]) => (
                <tr key={field}>
                  <td>{spec.label}</td>
                  <td>{spec.type}</td>
                  <td>
                    <input
                      className={input}
                      aria-label={spec.label}
                      value={draft.locations[field as DiagnosticField] ?? ''}
                      placeholder={`%M${spec.bank}…`}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          locations: { ...draft.locations, [field]: e.target.value.trim().toUpperCase() },
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className='flex items-center gap-2'>
            Create variables in
            <select
              aria-label='Create variables in'
              disabled={!!group.diagnostics?.variables}
              className={input}
              value={pou}
              onChange={(e) => setPou(e.target.value)}
            >
              <option value=''>Keep existing variables / configure addresses only</option>
              {pous
                .filter((p) => p.interface && p.pouType !== 'function')
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          {pou && (
            <label className='flex items-center gap-2'>
              Variable prefix
              <input
                aria-label='Variable prefix'
                readOnly={!!group.diagnostics?.variables}
                className={input}
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
              />
            </label>
          )}
          <p className='text-xs'>
            CommOK: successful and fresh data. ResponseOK: device responded, including Modbus exceptions. UpdateCounter:
            publication watchdog.
          </p>
          {(error || errors.length > 0) && (
            <p role='alert' className='text-sm text-red-600'>
              {error || errors.join(' ')}
            </p>
          )}
        </div>
        <ModalFooter>
          <button type='button' className={input} onClick={onClose}>
            Cancel
          </button>
          <button
            type='button'
            className={input}
            disabled={errors.length > 0}
            onClick={() => {
              const problem = onSave({ ...draft, variables: pou ? { pou, prefix } : undefined }, pou, prefix)
              if (problem) setError(problem)
              else onClose()
            }}
          >
            Save
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
