import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('HJ GROUPS Web Player runtime error:', error, info) }
  render() { return this.state.error ? <RuntimeFailure error={this.state.error} /> : this.props.children }
}

function BootShell() {
  return <div className="hj-boot-shell" role="status" aria-live="polite"><div className="hj-boot-card"><div className="hj-boot-logo">HJ <span>GROUPS</span></div><div className="hj-boot-title">Web Player</div><div className="hj-boot-loading">Loading…</div></div></div>
}

function RuntimeFailure({ error }) {
  return <div className="hj-runtime-error"><div className="hj-runtime-error-card"><strong>HJ GROUPS</strong><h1>Web Player could not load</h1><p>{error?.message || 'Unexpected browser startup error.'}</p><button onClick={() => window.location.reload()}>Reload Web Player</button></div></div>
}

window.addEventListener('error', (event) => console.error('HJ GROUPS browser error:', event.error || event.message))
window.addEventListener('unhandledrejection', (event) => console.error('HJ GROUPS unhandled promise rejection:', event.reason))
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const key = 'hj-vite-preload-reload'
  if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); window.location.reload() }
  else console.error('HJ GROUPS stale chunk could not be recovered:', event.payload)
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  document.body.innerHTML = '<div class="hj-runtime-error"><div class="hj-runtime-error-card"><strong>HJ GROUPS</strong><h1>Web Player startup failed</h1><p>Root element was not found.</p></div></div>'
} else {
  const appRoot = createRoot(rootElement)
  appRoot.render(<BootShell />)
  Promise.all([
    import('./App.jsx'),
    import('./readerEnhancements.js').catch((error) => { console.error('Reader enhancements disabled:', error); return null }),
  ]).then(([appModule]) => {
    const App = appModule?.default || appModule?.App
    if (!App) throw new Error('App module contains no usable App component export.')
    appRoot.render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>)
  }).catch((error) => {
    console.error('HJ GROUPS application startup failed:', error)
    appRoot.render(<RuntimeFailure error={error} />)
  })
}
