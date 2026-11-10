// The (?) help button. Its popup is portalled to <body> with fixed positioning so scrolling panels (overflow)
// never clip it, then nudged to stay inside the window: below the icon if it fits, otherwise above. It follows
// the icon when a panel scrolls and closes once the icon leaves the window.
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

const TIP_W = 256
const TIP_GAP = 8

export function Info({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!open) return // a reopened popup is placed again here, before paint, so a stale position never shows
    const place = () => {
      const b = btn.current?.getBoundingClientRect()
      const h = tip.current?.offsetHeight ?? 0
      if (!b) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (b.bottom < 0 || b.top > vh) return setOpen(false)
      const w = Math.min(TIP_W, vw - 2 * TIP_GAP)
      const left = Math.max(TIP_GAP, Math.min(b.left + b.width / 2 - w / 2, vw - w - TIP_GAP))
      const below = b.bottom + TIP_GAP
      const top = below + h <= vh - TIP_GAP ? below : Math.max(TIP_GAP, b.top - TIP_GAP - h)
      setPos({ left, top })
    }
    place()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true) // capture: any scrolling panel moves the icon
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label="What does this mean?"
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 shrink-0 -translate-y-px items-center justify-center rounded-full align-middle text-cyan-400/70 hover:text-cyan-200 focus-visible:text-cyan-200"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <span
            ref={tip}
            role="tooltip"
            onMouseDown={(e) => e.preventDefault()} // keep focus on the button so clicking the text doesn't close it
            style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, width: Math.min(TIP_W, window.innerWidth - 2 * TIP_GAP), visibility: pos ? 'visible' : 'hidden' }}
            aria-live="polite"
            className="cc-glass z-[1000] block rounded-lg p-3 text-left text-[13px] leading-relaxed font-normal tracking-normal text-slate-200 normal-case shadow-xl shadow-black/50"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  )
}
