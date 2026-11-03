// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useRef, useState } from 'react'
import { isGraphicSelectorType, type VisuElement, type VisuSymbol } from '../../../../../../middleware/shared/targetvisu/model'
import { graphicDimensions, MAX_GRAPHIC_SIDE } from '../../../../../../middleware/shared/targetvisu/graphics'

type Graphic = NonNullable<VisuElement['graphic']>

export async function importGraphic(file: File): Promise<string> {
  if (!/\.(png|jpe?g)$/i.test(file.name) || file.size > 8 * 1024 * 1024)
    throw new Error('Выберите PNG или JPEG размером не более 8 МиБ.')
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => header[i] === byte)
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255
  if (!png && !jpeg) throw new Error('Файл не является PNG или JPEG.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Не удалось прочитать изображение.'))
      image.src = url
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Изображение пустое.')
    const scale = Math.min(1, MAX_GRAPHIC_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Не удалось подготовить изображение.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/png')
    if (!graphicDimensions(data)) throw new Error('PNG после обработки превышает 1 МиБ. Уменьшите изображение.')
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}


export function GraphicProperties({
  element,
  symbols,
  onChange,
  onBindingChange,
}: {
  element: VisuElement
  symbols: VisuSymbol[]
  onChange: (graphic: Graphic) => void
  onBindingChange: (path: string) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(0)
  const latest = useRef({ element, onChange })
  latest.current = { element, onChange }
  useEffect(() => () => { pending.current++ }, [])

  const graphic = element.graphic ?? { data: '', fit: 'contain' as const, variants: [] }
  const variants = graphic.variants ?? []
  const replaceVariant = (index: number, next: Graphic['variants'] extends (infer R)[] | undefined ? R : never) => {
    const current = latest.current.element.graphic
    if (!current) return
    const updated = [...(current.variants ?? [])]
    updated[index] = next
    latest.current.onChange({ ...current, variants: updated })
  }
  const upload = (file: File | undefined, target: 'default' | 'add' | number) => {
    if (!file) return
    const request = ++pending.current
    setBusy(true)
    setError('')
    void importGraphic(file)
      .then((data) => {
        if (request !== pending.current) return
        const current = latest.current.element.graphic ?? { data: '', fit: 'contain' as const, variants: [] }
        const states = current.variants ?? []
        if (target === 'default') {
          latest.current.onChange({ ...current, data })
        } else if (target === 'add') {
          if (states.length >= 16) throw new Error('Допускается не более 16 состояний изображения.')
          let value = 0
          while (states.some((state) => state.value === value)) value++
          latest.current.onChange({ ...current, variants: [...states, { value, data }] })
        } else if (states[target]) {
          const updated = [...states]
          updated[target] = { ...updated[target], data }
          latest.current.onChange({ ...current, variants: updated })
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (request === pending.current) setBusy(false) })
  }

  return (
    <div className='flex flex-col gap-3'>
      <label className='flex flex-col gap-1'>
        Default image (fallback PNG / JPEG)
        <input
          aria-label='Graphic file'
          type='file'
          accept='.png,.jpg,.jpeg,image/png,image/jpeg'
          disabled={busy}
          onChange={(event) => {
            upload(event.target.files?.[0], 'default')
            event.target.value = ''
          }}
        />
      </label>
      {graphic.data && (
        <div className='flex items-center gap-2'>
          <img alt='Default image' src={graphic.data} className='h-12 w-20 object-contain' />
          <button type='button' aria-label='Remove default image' disabled={busy}
            onClick={() => onChange({ ...graphic, data: '' })}>
            Remove default
          </button>
        </div>
      )}
      <label className='flex flex-col gap-1'>
        Масштабирование
        <select
          aria-label='Graphic fit'
          value={graphic.fit}
          onChange={(e) => onChange({ ...graphic, fit: e.target.value as Graphic['fit'] })}
        >
          <option value='contain'>Вписать с сохранением пропорций</option>
          <option value='cover'>Заполнить с обрезкой</option>
          <option value='stretch'>Растянуть</option>
        </select>
      </label>
      <label className='flex flex-col gap-1'>
        Image selector variable
        <select
          aria-label='Image selector variable'
          value={element.bindings.value}
          onChange={(event) => onBindingChange(event.target.value)}
        >
          <option value=''>Unbound</option>
          {element.bindings.value && !symbols.some((s) => s.path.toLowerCase() === element.bindings.value.toLowerCase()) && (
            <option value={element.bindings.value}>{element.bindings.value} (unresolved)</option>
          )}
          {symbols.filter((s) => isGraphicSelectorType(s.type)).map((s) => (
            <option key={s.path} value={s.path}>
              {s.path} : {s.type}
            </option>
          ))}
        </select>
      </label>
      <div className='flex flex-col gap-2'>
        <strong>Image states ({variants.length}/16)</strong>
        {variants.map((variant, index) => (
          <div key={index} className='rounded border border-slate-300 p-2 dark:border-slate-700'>
            <div className='flex items-center gap-2'>
              <img src={variant.data} alt={`Image state ${variant.value}`} className='h-12 w-16 object-contain' />
              <label className='flex flex-col gap-1 text-xs'>
                PLC value
                <input
                  type='number'
                  aria-label={`Image state value ${index}`}
                  min={-2147483648}
                  max={4294967295}
                  step={1}
                  value={variant.value}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isSafeInteger(value) || value < -2147483648 || value > 4294967295) return
                    if (variants.some((other, i) => i !== index && other.value === value)) {
                      setError('Значения состояний должны быть уникальными.')
                      return
                    }
                    setError('')
                    replaceVariant(index, { ...variant, value })
                  }}
                  className='w-24 rounded border px-1 py-1 text-slate-900'
                />
              </label>
              <button
                type='button'
                aria-label={`Remove image state ${index}`}
                disabled={busy}
                onClick={() => onChange({ ...graphic, variants: variants.filter((_, i) => i !== index) })}
              >
                Удалить
              </button>
            </div>
            <input
              aria-label={`Replace image state ${index}`}
              type='file'
              accept='.png,.jpg,.jpeg,image/png,image/jpeg'
              disabled={busy}
              onChange={(event) => {
                upload(event.target.files?.[0], index)
                event.target.value = ''
              }}
            />
          </div>
        ))}
        <label className='flex flex-col gap-1'>
          Добавить изображение для значения PLC
          <input
            aria-label='Add image state file'
            type='file'
            accept='.png,.jpg,.jpeg,image/png,image/jpeg'
            disabled={busy || variants.length >= 16}
            onChange={(event) => {
              upload(event.target.files?.[0], 'add')
              event.target.value = ''
            }}
          />
        </label>
      </div>
      <span className='text-xs'>
        На каждое состояние — PNG до 1 МиБ и 1024×1024; весь TargetVisu JSON — до 4 МиБ.
        При неизвестном значении PLC показывается изображение по умолчанию, если оно задано.
      </span>
      {busy && <span>Загрузка…</span>}
      {error && <span role='alert'>{error}</span>}
    </div>
  )
}
