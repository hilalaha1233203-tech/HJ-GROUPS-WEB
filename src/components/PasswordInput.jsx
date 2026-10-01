import { forwardRef, useRef, useState } from 'react'

function EyeIcon({ off = false }) {
  return off ? (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A11.4 11.4 0 0 1 12 5c5.2 0 8.7 4.7 9.8 6.5a1 1 0 0 1 0 1A17.1 17.1 0 0 1 17.4 17" />
      <path d="M6.2 6.4C4.2 7.7 2.9 9.6 2.2 11.4a1.6 1.6 0 0 0 0 1.2C3.3 15.3 6.8 19 12 19c1 0 2-.1 2.9-.4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.2 12.6C3.3 9.8 6.8 5 12 5s8.7 4.8 9.8 7.6a1 1 0 0 1 0 .8C20.7 16.2 17.2 19 12 19s-8.7-2.8-9.8-5.6a1 1 0 0 1 0-.8Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  )
}

const PasswordInput = forwardRef(function PasswordInput(
  {
    className = '',
    disabled = false,
    ...inputProps
  },
  forwardedRef
) {
  const [visible, setVisible] = useState(false)
  const inputRef = useRef(null)

  const setRefs = (element) => {
    inputRef.current = element
    if (typeof forwardedRef === 'function') forwardedRef(element)
    else if (forwardedRef) forwardedRef.current = element
  }

  const toggleVisibility = () => {
    const element = inputRef.current
    const selectionStart = typeof element?.selectionStart === 'number' ? element.selectionStart : null
    const selectionEnd = typeof element?.selectionEnd === 'number' ? element.selectionEnd : selectionStart
    setVisible((current) => !current)

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        if (!element || document.activeElement !== element) return
        try {
          element.setSelectionRange(selectionStart ?? element.value.length, selectionEnd ?? element.value.length)
        } catch {}
      })
    }
  }

  return (
    <div className={`password-input ${className}`.trim()}>
      <input
        {...inputProps}
        ref={setRefs}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-visibility-toggle"
        onClick={toggleVisibility}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
      >
        <EyeIcon off={visible} />
      </button>
    </div>
  )
})

PasswordInput.displayName = 'PasswordInput'

export default PasswordInput
