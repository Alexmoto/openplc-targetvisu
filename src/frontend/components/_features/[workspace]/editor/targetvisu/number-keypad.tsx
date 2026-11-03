// SPDX-License-Identifier: GPL-3.0-only
import { useState } from 'react'

export function keypadPress(text: string, key: string, floating: boolean): string {
  if (key === 'C') return '0'
  if (key === '⌫') return text.length <= 1 || (text.length === 2 && text.startsWith('-')) ? '0' : text.slice(0, -1)
  if (key === '±') return text.startsWith('-') ? text.slice(1) : '-' + text
  if (key === '.') return !floating || text.includes('.') ? text : text + '.'
  if (!/^[0-9]$/.test(key) || text.replace(/[-.]/g, '').length >= 24) return text
  if (text === '0') return key
  if (text === '-0') return '-' + key
  return text + key
}

/** Browser-safe preview validation; Runtime repeats the check with exact IEC ranges. */
export function parseKeypadValue(text: string, datatype: string, minimum: number, maximum: number): number {
  const floating = datatype.toUpperCase() === 'REAL' || datatype.toUpperCase() === 'LREAL'
  if (!(floating ? /^-?\d+(\.\d*)?$/.test(text) : /^-?\d+$/.test(text)))
    throw new Error(floating ? 'Введите число' : 'Введите целое число')
  const value = Number(text)
  if (!Number.isFinite(value) || (!floating && !Number.isSafeInteger(value)))
    throw new Error('Неверное или слишком большое число для Preview')
  if (value < minimum || value > maximum) throw new Error(`Диапазон: ${minimum} … ${maximum}`)
  const widths: Record<string, [number, number]> = {
    SINT: [-128, 127], USINT: [0, 255], BYTE: [0, 255],
    INT: [-32768, 32767], UINT: [0, 65535], WORD: [0, 65535],
    DINT: [-2147483648, 2147483647], UDINT: [0, 4294967295], DWORD: [0, 4294967295],
    LINT: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ULINT: [0, Number.MAX_SAFE_INTEGER], LWORD: [0, Number.MAX_SAFE_INTEGER],
  }
  const limit = widths[datatype.toUpperCase()]
  if (limit && (value < limit[0] || value > limit[1])) throw new Error(`Значение вне диапазона ${datatype}`)
  return value
}

export function NumberKeypad({
  name, target, datatype, initial, decimals, minimum, maximum, onCancel, onConfirm,
}: {
  name: string
  target: string
  datatype: string
  initial: number
  decimals: number
  minimum: number
  maximum: number
  onCancel: () => void
  onConfirm: (value: number) => void
}) {
  const floating = ['REAL', 'LREAL'].includes(datatype.toUpperCase())
  const [value, setValue] = useState(() =>
    floating ? initial.toFixed(decimals) : String(initial),
  )
  const [error, setError] = useState('')
  const keys = [
    ['7', '8', '9', '⌫'],
    ['4', '5', '6', 'C'],
    ['1', '2', '3', '±'],
    ['0', '.'],
  ]
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
      <div
        role='dialog'
        aria-modal='true'
        aria-label={`Numeric keypad: ${name}`}
        className='w-[430px] max-w-[95vw] rounded-lg bg-white p-4 text-slate-900 shadow-xl'
      >
        <h3 className='mb-2 font-semibold'>Ввод числа: {name}</h3>
        <p className='mb-2 text-sm'>{target} · {minimum} … {maximum}</p>
        <input aria-label='Keypad value' readOnly value={value} className='mb-2 w-full rounded border p-2 text-right text-2xl' />
        <p role={error ? 'alert' : undefined} className='min-h-5 text-sm text-red-600'>{error}</p>
        <div className='grid grid-cols-4 gap-2'>
          {keys.flat().map((key) => (
            <button
              key={key}
              type='button'
              aria-label={`Keypad ${key}`}
              disabled={key === '.' && !floating}
              className='min-h-14 rounded border border-slate-400 bg-slate-100 text-xl disabled:opacity-40'
              onClick={() => { setValue((v) => keypadPress(v, key, floating)); setError('') }}
            >{key}</button>
          ))}
        </div>
        <div className='mt-3 flex gap-3'>
          <button type='button' className='flex-1 rounded border p-3' onClick={onCancel}>Отмена</button>
          <button
            type='button'
            className='flex-1 rounded bg-blue-600 p-3 text-white'
            onClick={() => {
              try {
                onConfirm(parseKeypadValue(value, datatype, minimum, maximum))
              } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
            }}
          >Записать</button>
        </div>
      </div>
    </div>
  )
}
