// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useRef, useState } from 'react'
import type { VisuScreen } from '../../../../../../middleware/shared/targetvisu/model'
import { importGraphic } from './graphic-properties'

type BackgroundGraphic = NonNullable<VisuScreen['backgroundGraphic']>

/** An embedded background is part of the screen, never an interactive element. */
export function ScreenBackgroundProperties({
  backgroundGraphic,
  onChange,
}: {
  backgroundGraphic?: BackgroundGraphic
  onChange: (graphic: BackgroundGraphic | undefined) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(0)
  const latest = useRef({ backgroundGraphic, onChange })
  latest.current = { backgroundGraphic, onChange }

  // A different screen may be selected before the image has finished decoding.
  useEffect(() => () => { pending.current++ }, [])

  return (
    <div className='flex flex-col gap-2'>
      <label className='flex flex-col gap-1'>
        Screen background image (PNG / JPEG)
        <input
          type='file'
          aria-label='Screen background image'
          accept='.png,.jpg,.jpeg,image/png,image/jpeg'
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            const request = ++pending.current
            setBusy(true)
            setError('')
            void importGraphic(file)
              .then((data) => {
                if (request === pending.current)
                  latest.current.onChange({
                    data,
                    fit: latest.current.backgroundGraphic?.fit ?? 'cover',
                  })
              })
              .catch((e: unknown) => {
                if (request === pending.current) setError(e instanceof Error ? e.message : String(e))
              })
              .finally(() => {
                if (request === pending.current) setBusy(false)
              })
          }}
        />
      </label>
      {backgroundGraphic && (
        <>
          <img
            alt='Screen background preview'
            src={backgroundGraphic.data}
            className='h-24 w-full rounded border border-slate-300 object-contain dark:border-slate-600'
          />
          <label className='flex flex-col gap-1'>
            Background image fit
            <select
              aria-label='Background image fit'
              value={backgroundGraphic.fit}
              onChange={(e) => onChange({ ...backgroundGraphic, fit: e.target.value as BackgroundGraphic['fit'] })}
            >
              <option value='contain'>Contain — fit inside screen</option>
              <option value='cover'>Cover — fill screen, crop edges</option>
              <option value='stretch'>Stretch — fill screen without preserving proportions</option>
            </select>
          </label>
          <button
            type='button'
            aria-label='Remove screen background image'
            disabled={busy}
            className='rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600'
            onClick={() => {
              setError('')
              onChange(undefined)
            }}
          >
            Remove background image
          </button>
        </>
      )}
      <span className='text-xs'>
        Background color remains underneath transparent pixels and is used when no image is set.
        Image is embedded in the project (max 1024 × 1024 px, 1 MiB PNG).
      </span>
      {busy && <span>Loading image…</span>}
      {error && <span role='alert'>{error}</span>}
    </div>
  )
}
