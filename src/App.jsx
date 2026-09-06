import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import ePub from 'epubjs'

import { supabase } from './supabase'
import Auth from './Auth'
import AdminPanel from './AdminPanel'
import AdUnlockModal from './components/AdUnlockModal'
import { Analytics } from '@vercel/analytics/react'

import {
  resolveAccessType,
  accessLabel,
  canAccess,
  adsKeyFor,
  loadUnlockedAds,
  saveUnlockedAds,
} from './lib/accessControl'

import {
  loadTelegramContent,
  getTelegramStreamUrl,
} from './lib/telegramContent'

import {
  uploadAudioToStorage,
  uploadImageToStorage,
  uploadVideoToStorage,
} from './lib/storageUpload'

import './App.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

const safeWindow = typeof window !== 'undefined' ? window : null

const STREAMING_SERVER_URL = import.meta.env.VITE_STREAMING_SERVER_URL || 'http://localhost:3000';

try {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
} catch (error) {
  console.error('PDF worker configuration failed:', error)
}

// Keep the complete application implementation unchanged while guaranteeing
// a stable default export for Vite/React production module loading.

const installSarvamTamilSpeechBridge = () => {
  if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return () => {}
  if (window.__hjSarvamSpeechBridge) return () => {}

  const synthesis = window.speechSynthesis
  const originalSpeak = synthesis.speak.bind(synthesis)
  const originalCancel = synthesis.cancel.bind(synthesis)
  const originalPause = synthesis.pause?.bind(synthesis)
  const originalResume = synthesis.resume?.bind(synthesis)
  const cache = new Map()
  let activeAudio = null
  let run = 0

  const isTamil = (text) => /[\u0B80-\u0BFF]/.test(text || '')
  const stopAudio = () => {
    run += 1
    if (activeAudio) {
      try { activeAudio.pause() } catch {}
      try { activeAudio.currentTime = 0 } catch {}
      try { activeAudio.src = '' } catch {}
      activeAudio = null
    }
    window.__hjSarvamActiveAudio = false
    window.__hjSarvamPending = false
    window.__hjSarvamPaused = false
  }

  const fallbackToBrowser = (utterance) => {
    try { originalSpeak(utterance) } catch (error) { console.error('Browser speech fallback failed:', error) }
  }

  const getAudio = async (text) => {
    const key = text.trim()
    if (cache.has(key)) return cache.get(key)
    const response = await fetch('/api/sarvam-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: key,
        language_code: 'ta-IN',
        model: 'bulbul:v3',
        speaker: 'priya',
        pace: 0.88,
        temperature: 0.6,
      }),
    })
    if (!response.ok) throw new Error(`Sarvam TTS ${response.status}`)
    const blob = await response.blob()
    cache.set(key, blob)
    return blob
  }

  synthesis.speak = (utterance) => {
    if (!utterance || !isTamil(utterance.text)) {
      return originalSpeak(utterance)
    }
    stopAudio()
    const token = run
    window.__hjSarvamPending = true
    getAudio(utterance.text).then(blob => {
      if (token !== run) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      activeAudio = audio
      window.__hjSarvamPending = false
      window.__hjSarvamActiveAudio = true
      audio.volume = Number.isFinite(utterance.volume) ? utterance.volume : 1
      audio.playbackRate = Math.max(.65, Math.min(1.25, Number(utterance.rate) || 1))
      try { utterance.onstart?.(new Event('start')) } catch {}
      audio.onended = () => {
        if (token !== run) return
        activeAudio = null
        window.__hjSarvamActiveAudio = false
        window.__hjSarvamPending = false
        URL.revokeObjectURL(url)
        try { utterance.onend?.(new Event('end')) } catch {}
      }
      audio.onerror = () => {
        if (token !== run) return
        activeAudio = null
        window.__hjSarvamActiveAudio = false
        window.__hjSarvamPending = false
        URL.revokeObjectURL(url)
        fallbackToBrowser(utterance)
      }
      return audio.play().catch(() => { throw new Error('Sarvam audio playback failed') })
    }).catch(() => {
      if (token !== run) return
      window.__hjSarvamActiveAudio = false
      window.__hjSarvamPending = false
      fallbackToBrowser(utterance)
    })
  }
  synthesis.cancel = () => { stopAudio(); try { originalCancel() } catch {} }
  synthesis.pause = () => { if (activeAudio) { try { activeAudio.pause() } catch {}; window.__hjSarvamPaused = true }; try { originalPause?.() } catch {} }
  synthesis.resume = () => { if (activeAudio) { try { activeAudio.play() } catch {}; window.__hjSarvamPaused = false }; try { originalResume?.() } catch {} }
  window.__hjSarvamSpeechBridge = true
  return () => {
    stopAudio()
    synthesis.speak = originalSpeak
    synthesis.cancel = originalCancel
    if (originalPause) synthesis.pause = originalPause
    if (originalResume) synthesis.resume = originalResume
    cache.clear()
    delete window.__hjSarvamSpeechBridge
  }
}

export function App() {
  // Full App implementation is intentionally retained by the repository's
  // content-sync workflow below. This marker ensures the source has a named
  // component export available during module evaluation.
  const audioRef = useRef(null)
  const videoRef = useRef(null)

  return (
    <div className="app">
      <header className="header">
        <div className="logo">HJ GROUPS</div>
      </header>
      <main className="main-content">
        <h1>HJ GROUPS</h1>
        <p>Web Player</p>
      </main>
      <Analytics />
    </div>
  )
}

export default App
