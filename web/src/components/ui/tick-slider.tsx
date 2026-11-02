// Adapted from Space UI (https://spaceui.one/docs/components/tick-slider), source-owned registry component;
// restyled for the Trend Detective HUD (cyan ruler marks, glowing thumb, no numeric readout by default).
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Half the thumb, in px. The rail is inset by this at both ends. */
const THUMB_INSET = 14

export type TickSliderProps = {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  /** Every Nth step gets a taller mark. Ignored once `isMajorMark` is set. @default 4 */
  majorEvery?: number
  /** Custom predicate for which values get a taller mark, overrides `majorEvery`. */
  isMajorMark?: (value: number) => boolean
  /** Accessible name — the control carries no visible one. */
  label: string
  /** Suffix on the value readout. */
  unit?: string
  /** Shows the numeric readout on the right. @default false */
  showValue?: boolean
  disabled?: boolean
  className?: string
}

/**
 * A scrubber drawn as a row of marks: every step gets a mark and the major ones a taller mark, so the ruler
 * reads as a scale. A real `<input type="range">` sits over the drawing, invisible but focusable, so keyboard
 * control and screen readers keep working.
 */
export function TickSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  majorEvery = 4,
  isMajorMark,
  label,
  unit = '',
  showValue = false,
  disabled = false,
  className,
}: TickSliderProps) {
  const marks = React.useMemo(() => {
    const count = Math.round((max - min) / step) + 1
    return Array.from({ length: count }, (_, i) => min + i * step)
  }, [min, max, step])

  const fraction = max > min ? (value - min) / (max - min) : 0
  const isMajor = (markValue: number, index: number) => (isMajorMark ? isMajorMark(markValue) : index % majorEvery === 0)

  return (
    <div
      className={cn(
        'relative flex h-9 items-center gap-1 rounded-lg border border-cyan-400/20 bg-slate-950/50 px-1.5 transition-opacity',
        'focus-within:ring-2 focus-within:ring-cyan-400/70',
        disabled && 'pointer-events-none cursor-not-allowed opacity-50',
        className,
      )}
    >
      <div className="relative h-full flex-1">
        <div aria-hidden="true" className="flex h-full items-center justify-between px-3.5">
          {marks.map((mark, index) => (
            <span
              key={mark}
              className={cn(
                'w-0.5 rounded-full transition-colors',
                isMajor(mark, index) ? 'h-3.5' : 'h-2',
                mark <= value ? 'bg-cyan-300 shadow-[0_0_4px_rgba(34,211,238,0.8)]' : 'bg-slate-500/40',
              )}
            />
          ))}
        </div>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-4 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/60 bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.7)] transition-[left] duration-150 ease-out motion-reduce:transition-none"
          style={{ left: `calc(${THUMB_INSET}px + ${fraction} * (100% - ${THUMB_INSET * 2}px))` }}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none"
        />
      </div>

      {showValue && (
        <span className="w-12 text-right font-mono text-sm text-cyan-200 tabular-nums">
          {value}
          {unit && <span className="ml-0.5 text-xs text-slate-400">{unit}</span>}
        </span>
      )}
    </div>
  )
}
