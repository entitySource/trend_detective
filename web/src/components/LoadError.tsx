// What a student sees when data fails to load or a view crashes: a plain explanation, Retry, a way back to the
// globe, and the technical detail folded away for whoever is debugging.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Globe2, RotateCcw } from 'lucide-react'

export function LoadError({ title = 'We could not load the satellite data', detail }: { title?: string; detail?: string }) {
  return (
    <div role="alert" className="cc-grid flex min-h-screen items-center justify-center p-6">
      <div className="cc-glass w-full max-w-md rounded-xl p-6 text-slate-200">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          This is usually a dropped connection. Try again; if it keeps happening, the data files may be updating, so check back in a few minutes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-300/60 bg-cyan-400/15 px-3 py-1.5 text-sm text-cyan-50 transition hover:bg-cyan-400/25"
          >
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
          <a href="#/" onClick={() => window.setTimeout(() => window.location.reload(), 0)} className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition hover:text-slate-100">
            <Globe2 className="h-4 w-4" /> Back to the globe
          </a>
        </div>
        {detail && (
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <p className="mt-1 font-mono break-words">{detail}</p>
          </details>
        )}
      </div>
    </div>
  )
}

// Catches render crashes anywhere below it so the page never goes blank. Keyed by route in main.tsx, so moving
// to another view starts it fresh.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View crashed:', error, info.componentStack)
  }

  render() {
    return this.state.error ? <LoadError title="Something went wrong on this page" detail={this.state.error.message} /> : this.props.children
  }
}
