// SPDX-License-Identifier: GPL-3.0-only
import type { VisuElement, VisuSymbol, VisuTrend } from '../../../../../../middleware/shared/targetvisu/model'
import { isNumericType } from '../../../../../../middleware/shared/targetvisu/model'

const control = 'rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
const intervals = [500, 1000, 2000, 5000, 10000, 30000, 60000]
const durations = [60, 300, 900, 1800, 3600]
const palette = ['#16a34a', '#e59b36', '#2563eb', '#e11d48']
const fallback: VisuTrend = { sampleMs: 2000, durationSec: 900, autoScale: false, series: [] }

export function TrendProperties({
  element, symbols, onChange,
}: {
  element: VisuElement
  symbols: readonly VisuSymbol[]
  onChange: (trend: VisuTrend) => void
}) {
  const trend = element.trend ?? fallback
  const numeric = symbols.filter((symbol) => isNumericType(symbol.type))
  const free = numeric.filter((s) => !trend.series.some((series) => series.path.toLowerCase() === s.path.toLowerCase()))
  const patch = (update: Partial<VisuTrend>) => onChange({ ...trend, ...update })
  const updateCurve = (index: number, update: Partial<VisuTrend['series'][number]>) =>
    patch({ series: trend.series.map((series, i) => i === index ? { ...series, ...update } : series) })
  return (
    <section className='flex flex-col gap-2' aria-label='Trend properties'>
      <strong>Trend history</strong>
      <label className='flex flex-col gap-1'>
        History window
        <select className={control} aria-label='Trend history window' value={trend.durationSec}
          onChange={(e) => {
            const durationSec = Number(e.target.value)
            const sampleMs = intervals.find((ms) => ms >= trend.sampleMs && Math.ceil(durationSec * 1000 / ms) <= 600) ?? 60000
            patch({ durationSec, sampleMs })
          }}>
          {durations.map((sec) => <option key={sec} value={sec}>{sec / 60} min</option>)}
        </select>
      </label>
      <label className='flex flex-col gap-1'>
        Sample period
        <select className={control} aria-label='Trend sample period' value={trend.sampleMs}
          onChange={(e) => patch({ sampleMs: Number(e.target.value) })}>
          {intervals.filter((ms) => Math.ceil(trend.durationSec * 1000 / ms) <= 600)
            .map((ms) => <option key={ms} value={ms}>{ms / 1000} s</option>)}
        </select>
      </label>
      <label className='flex items-center gap-2'>
        <input aria-label='Trend auto scale' type='checkbox' checked={trend.autoScale}
          onChange={(e) => patch({ autoScale: e.target.checked })} />
        Auto scale Y
      </label>
      {!trend.autoScale && <p className='text-slate-500'>Y range uses element Minimum / Maximum.</p>}
      <strong>Curves (up to 4)</strong>
      {trend.series.map((series, index) => (
        <div key={index} className='flex flex-col gap-1 rounded border p-2'>
          <label className='flex flex-col gap-1'>
            Variable {index + 1}
            <select className={control} aria-label={`Trend variable ${index + 1}`} value={series.path}
              onChange={(e) => updateCurve(index, { path: e.target.value })}>
              {!numeric.some((s) => s.path.toLowerCase() === series.path.toLowerCase()) &&
                <option value={series.path}>{series.path} (unresolved)</option>}
              {numeric.filter((s) => s.path === series.path ||
                !trend.series.some((item, i) => i !== index && item.path.toLowerCase() === s.path.toLowerCase()))
                .map((s) => <option key={s.path} value={s.path}>{s.path} : {s.type}</option>)}
            </select>
          </label>
          <label className='flex flex-col gap-1'>
            Legend
            <input className={control} aria-label={`Trend label ${index + 1}`} maxLength={80}
              value={series.label} onChange={(e) => updateCurve(index, { label: e.target.value })} />
          </label>
          <label className='flex items-center justify-between'>
            Line color
            <input type='color' aria-label={`Trend color ${index + 1}`} value={series.color}
              onChange={(e) => updateCurve(index, { color: e.target.value })} />
          </label>
          <button className={control} type='button' aria-label={`Remove trend curve ${index + 1}`}
            onClick={() => patch({ series: trend.series.filter((_, i) => i !== index) })}>Remove curve</button>
        </div>
      ))}
      <button className={control} type='button' disabled={trend.series.length >= 4 || !free.length}
        onClick={() => {
          const symbol = free[0]
          if (symbol) patch({ series: [...trend.series, {
            path: symbol.path, label: symbol.path.split('.').pop() ?? symbol.path,
            color: palette[trend.series.length],
          }] })
        }}>+ Add curve</button>
      <p className='text-slate-500'>On the Runtime chart: X+ / X− zoom time, &lt; / &gt; pan through history;
        Y+ / Y− zoom values, ^ / v pan vertically, LIVE resets the viewport.
        Controls are for viewing only and do not write PLC variables.</p>
      <p className='text-slate-500'>Up to 600 samples per configured time window.
        A bounded extra RAM history supports scrolling; all history clears when the TargetVisu service restarts.</p>
    </section>
  )
}

export function TrendPreview({ element }: { element: VisuElement }) {
  const series = element.trend?.series ?? []
  const x0 = 48, x1 = 308, y0 = 45, y1 = 128
  const controls = ['<', 'X+', 'X-', '>', 'v', 'Y+', 'Y-', '^', 'LIVE']
  return (
    <svg x={element.x} y={element.y} width={element.width} height={element.height}
      viewBox='0 0 320 180' preserveAspectRatio='none' aria-label='Trend preview'>
      <rect x='0' y='0' width='320' height='180' fill={element.fill}
        stroke={element.stroke} strokeWidth={element.strokeWidth} />
      <text x='12' y='20' fontSize='13' fontWeight='bold' fill={element.textColor}>{element.text}</text>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line x1={x0} x2={x1} y1={y0 + (y1 - y0) * i / 4}
            y2={y0 + (y1 - y0) * i / 4} stroke='#94a3b8' strokeDasharray='3 3' opacity='.55' />
          <text x='37' y={y0 + (y1 - y0) * i / 4 + 3} fontSize='9' textAnchor='end'
            fill={element.textColor}>{(element.maximum - (element.maximum - element.minimum) * i / 4).toFixed(0)}</text>
        </g>
      ))}
      {series.map((item, index) => {
        const path = Array.from({ length: 30 }, (_, i) => {
          const xx = x0 + (x1 - x0) * i / 29
          const yy = 92 - 17 * Math.sin(i / 5 + index * 1.5) - index * 12
          return `${i ? 'L' : 'M'}${xx.toFixed(1)},${yy.toFixed(1)}`
        }).join(' ')
        return <path key={item.path} d={path} stroke={item.color} strokeWidth='2' fill='none' />
      })}
      <text x='48' y='145' fontSize='9' fill={element.textColor}>Demo history • controls work in Runtime</text>
      <g aria-label='Trend preview toolbar'>
        {controls.map((label, index) => {
          const boxWidth = index === controls.length - 1 ? 32 : 24
          const bx = 40 + index * 26
          return (
            <g key={label} transform={`translate(${bx},155)`}>
              <rect width={boxWidth} height='19' fill='#2e3b4f' stroke='#94a3b8' strokeWidth='.8' rx='2' />
              <text x={boxWidth / 2} y='13' fontSize='10' textAnchor='middle' fill='#ffffff'>{label}</text>
            </g>
          )
        })}
      </g>
      {series.slice(0, 4).map((item, index) => (
        <g key={item.path} transform={`translate(${180 + (index % 2) * 70},${10 + Math.floor(index / 2) * 12})`}>
          <line x1='0' x2='12' y1='0' y2='0' stroke={item.color} strokeWidth='3' />
          <text x='15' y='3' fill={element.textColor} fontSize='8'>{item.label.slice(0, 8)}</text>
        </g>
      ))}
    </svg>
  )
}
