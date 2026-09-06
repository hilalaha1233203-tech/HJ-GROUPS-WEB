import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './readerEnhancements.js'
import App from './App.jsx'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('HJ GROUPS Web Player runtime error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="hj-runtime-error">
          <div className="hj-runtime-error-card">
            <strong>HJ GROUPS</strong>
            <h1>Web Player could not load</h1>
            <p>{this.state.error?.message || 'Unexpected browser error.'}</p>
            <button onClick={() => window.location.reload()}>
              Reload Web Player
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

window.addEventListener('error', (event) => {
  console.error('HJ GROUPS browser error:', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('HJ GROUPS unhandled promise rejection:', event.reason)
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  document.body.innerHTML = '<div class="hj-runtime-error"><div class="hj-runtime-error-card"><strong>HJ GROUPS</strong><h1>Web Player startup failed</h1><p>Root element was not found.</p></div></div>'
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
}
