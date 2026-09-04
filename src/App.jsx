import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import ePub from 'epubjs'

import { supabase } from './supabase'
import Auth from './Auth'
import AdminPanel from './AdminPanel'
import AdUnlockModal from './components/AdUnlockModal'

import {
  resolveAccessType,
  accessLabel,
  canAccess,
  adsKeyFor,
  loadUnlockedAds,
  saveUnlockedAds,
} from './lib/accessControl'

import {
  downloadStorageFile,
  getStoragePathFromPublicUrl,
} from './lib/storageUpload'

import {
  fetchTelegramContent,
  subscribeToTelegramContent,
} from './lib/telegramContent'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

import './App.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const ADMIN_EMAIL = 'hilalaha1233203@gmail.com'

/* =========================================================
   SEED DATA
========================================================= */

const seedStories = [
  {
    id: 1,
    title: 'ஆதிஒளியின் அதிசய மாணவன்',
    genre: 'Fantasy',
    cover:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    description:
      'ஒரு சாதாரண மாணவனின் வாழ்க்கையில் நிகழும் அசாதாரணமான மாற்றங்களின் கதை.',
    episodes: [
      {
        number: 1,
        title: 'Episode 01',
        type: 'audio',
        src: '',
        available: true,
        accessType: 'free',
      },
      {
        number: 2,
        title: 'Episode 02',
        type: 'audio',
        src: '',
        available: false,
        accessType: 'free',
      },
      {
        number: 3,
        title: 'Episode 03',
        type: 'audio',
        src: '',
        available: false,
        accessType: 'premium',
      },
    ],
  },
  {
    id: 2,
    title: 'அழிவின் வாரிசு',
    genre: 'System',
    cover:
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    description:
      'அழிந்துபோன உலகில் உயிர்வாழ போராடும் ஒரு வாரிசின் கதை.',
    episodes: [
      {
        number: 1,
        title: 'Episode 01',
        type: 'audio',
        src: '',
        available: false,
        accessType: 'free',
      },
      {
        number: 2,
        title: 'Episode 02',
        type: 'audio',
        src: '',
        available: false,
        accessType: 'premium',
      },
    ],
  },
  {
    id: 3,
    title: 'நியதியின் கடைசி வாரிசு',
    genre: 'Adventure',
    cover:
      'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?auto=format&fit=crop&w=800&q=80',
    description:
      'நியதியால் தேர்ந்தெடுக்கப்பட்ட கடைசி வாரிசின் பயணம்.',
    episodes: [
      {
        number: 1,
        title: 'Episode 01',
        type: 'audio',
        src: '',
        available: false,
        accessType: 'free',
      },
    ],
  },
  {
    id: 4,
    title: 'தர்ம வீரன்',
    genre: 'Action',
    cover:
      'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?auto=format&fit=crop&w=800&q=80',
    description:
      'தர்மத்தை காப்பாற்ற போராடும் ஒரு வீரனின் கதை.',
    episodes: [
      {
        number: 1,
        title: 'Episode 01',
        type: 'audio',
        src: '',
        available: false,
        accessType: 'free',
      },
    ],
  },
]

const seedBooks = [
  {
    id: 1,
    title: 'ஆதிஒளி - Chapter 1',
    type: 'pdf',
    category: 'Fantasy',
    cover:
      'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80',
    file: '/books/sample.pdf',
    filePath: '',
    accessType: 'free',
  },
  {
    id: 2,
    title: 'நியதி - Full Novel',
    type: 'epub',
    category: 'Adventure',
    cover:
      'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80',
    file: '/books/sample.epub',
    filePath: '',
    accessType: 'premium',
  },
]

const seedVideoStories = [
  {
    id: 101,
    title: 'தர்ம வீரன் - Video',
    category: 'Action',
    cover:
      'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?auto=format&fit=crop&w=400&q=80',
    accessType: 'free',
    episodes: [
      {
        number: 1,
        title: 'Episode 01',
        type: 'video',
        src: '/video/episode-01.mp4',
        available: true,
        accessType: 'free',
      },
    ],
  },
]

const categories = [
  'All',
  'Fantasy',
  'Action',
  'Adventure',
  'Romance',
  'System',
  'Mystery',
]

const bookCategories = [
  'All',
  'Tamil Stories',
  'Fantasy',
  'Romance',
  'Mystery',
  'Other',
]

const videoCategories = [
  'All',
  'Fantasy',
  'Action',
  'Adventure',
  'Romance',
]

/* =========================================================
   LOCAL STORAGE
========================================================= */

const loadList = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const saveList = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { }
}

/* =========================================================
   HELPERS
========================================================= */

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value))

const cleanSpeechText = (text) =>
  String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const chunkTextForSpeech = (text, maxLength = 700) => {
  const cleaned = cleanSpeechText(text)
  if (!cleaned) return []

  const sentences =
    cleaned.match(/[^.!?。！？]+[.!?。！？]?/g) || [cleaned]

  const chunks = []
  let current = ''

  for (const sentence of sentences) {
    const part = sentence.trim()
    if (!part) continue

    if (
      current &&
      current.length + part.length + 1 > maxLength
    ) {
      chunks.push(current.trim())
      current = part
    } else {
      current = current
        ? `${current} ${part}`
        : part
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}

/* =========================================================
   APP
========================================================= */

function App() {
  /* =======================================================
     MEDIA
  ======================================================= */

  const audioRef = useRef(null)
  const videoRef = useRef(null)

  /* =======================================================
     READER
  ======================================================= */

  const readerContainerRef = useRef(null)
  const readerBodyRef = useRef(null)

  const epubContainerRef = useRef(null)
  const epubBookRef = useRef(null)
  const epubRenditionRef = useRef(null)

  const readerObjectUrlRef = useRef(null)

  const pdfDocumentRef = useRef(null)

  /* =======================================================
     EPUB NAVIGATION
  ======================================================= */

  const [epubToc, setEpubToc] = useState([])
  const [epubCurrentHref, setEpubCurrentHref] = useState('')

  /* =======================================================
     PDF NAVIGATION
  ======================================================= */

  const [pdfOutline, setPdfOutline] = useState([])

  /* =======================================================
     READ ALOUD
  ======================================================= */

  const speechUtteranceRef = useRef(null)
  const speechChunksRef = useRef([])
  const speechChunkIndexRef = useRef(0)
  const speechRunRef = useRef(0)

  const pendingAutoReadRef = useRef(false)
  const readAloudRef = useRef(() => { })

  const sleepTimerRef = useRef(null)

  /* =======================================================
     UI / WATERMARK
  ======================================================= */

  const particleCanvasRef = useRef(null)

  const mouseRef = useRef({
    x: -1000,
    y: -1000,
    lastX: -1000,
    lastY: -1000,
    moving: false,
  })

  /* =======================================================
     GENERAL
  ======================================================= */

  const [page, setPage] = useState('home')

  const [selectedStory, setSelectedStory] =
    useState(null)

  const [selectedBook, setSelectedBook] =
    useState(null)

  const [selectedVideo, setSelectedVideo] =
    useState(null)

  /*
    Remembers which page the user was on before
    opening Book Details / Video Details, so the
    "Back" buttons return there instead of Home.
  */
  const [preDetailsPage, setPreDetailsPage] =
    useState('home')

  const [activeCategory, setActiveCategory] =
    useState('All')

  /* =======================================================
     MEDIA PLAYER
  ======================================================= */

  const [currentStory, setCurrentStory] =
    useState(null)

  const [currentEpisode, setCurrentEpisode] =
    useState(null)

  const [activePlayerKind, setActivePlayerKind] =
    useState(null)

  const [playerOpen, setPlayerOpen] =
    useState(false)

  const [fullPlayer, setFullPlayer] =
    useState(false)

  const [isPlaying, setIsPlaying] =
    useState(false)

  const [currentTime, setCurrentTime] =
    useState(0)

  const [duration, setDuration] =
    useState(0)

  const [volume, setVolume] =
    useState(1)

  const [speed, setSpeed] =
    useState(1)

  const [sleepMinutes, setSleepMinutes] =
    useState(0)

  /* =======================================================
     AUTH
  ======================================================= */

  const [loginOpen, setLoginOpen] =
    useState(false)

  const [user, setUser] =
    useState(null)

  const [purchasedStoryIds, setPurchasedStoryIds] = useState(new Set())

  const loggedIn = !!user

  const isAdmin =
    loggedIn &&
    user?.email?.toLowerCase() ===
    ADMIN_EMAIL.toLowerCase()

  const isVIP = isAdmin

  /* =======================================================
     ADS
  ======================================================= */

  const [unlockedAds, setUnlockedAds] =
    useState(() => loadUnlockedAds())

  const [adModalOpen, setAdModalOpen] =
    useState(false)

  const pendingUnlockRef = useRef(null)

  /* =======================================================
     SEARCH
  ======================================================= */

  const [searchOpen, setSearchOpen] =
    useState(false)

  const [searchText, setSearchText] =
    useState('')

  /* =======================================================
     LIBRARY
  ======================================================= */

  const [library, setLibrary] =
    useState(() =>
      loadList('hj_user_library')
    )

  const [bookLibrary, setBookLibrary] =
    useState(() =>
      loadList('hj_user_book_library')
    )

  const [libraryMessage, setLibraryMessage] =
    useState('')

  /* =======================================================
     MODALS
  ======================================================= */

  const [booksModalOpen, setBooksModalOpen] =
    useState(false)

  const [videoModalOpen, setVideoModalOpen] =
    useState(false)

  const [bookCategory, setBookCategory] =
    useState('All')

  const [videoCategory, setVideoCategory] =
    useState('All')

  /* =======================================================
     ADMIN CONTENT
  ======================================================= */

  const [adminStories, setAdminStories] =
    useState(() =>
      loadList('hj_admin_stories')
    )

  const [adminBooks, setAdminBooks] =
    useState(() =>
      loadList('hj_admin_books')
    )

  const [adminVideos, setAdminVideos] =
    useState(() =>
      loadList('hj_admin_videos')
    )

  const [adminOpen, setAdminOpen] =
    useState(false)

  /* =======================================================
     READER STATE
  ======================================================= */

  const [readerOpen, setReaderOpen] =
    useState(false)

  const [readerType, setReaderType] =
    useState(null)

  const [readerFile, setReaderFile] =
    useState(null)

  const [readerFilePath, setReaderFilePath] =
    useState('')

  const [readerResolvedFile, setReaderResolvedFile] =
    useState(null)

  const [readerBook, setReaderBook] =
    useState(null)

  const [readerError, setReaderError] =
    useState('')

  const [readerLoading, setReaderLoading] =
    useState(false)

  const [pdfPages, setPdfPages] =
    useState(0)

  const [pdfPage, setPdfPage] =
    useState(1)

  const [pdfInputPage, setPdfInputPage] =
    useState('')

  const [pdfScale, setPdfScale] =
    useState(1)

  const [epubPage, setEpubPage] =
    useState(1)

  const [epubInputPage, setEpubInputPage] =
    useState('')

  const [epubPages, setEpubPages] =
    useState(0)

  const [epubFontScale, setEpubFontScale] =
    useState(100)

  const [epubReady, setEpubReady] =
    useState(false)

  /*
    True once book.locations.generate() has
    finished, meaning epubPages reflects the real
    whole-book page count rather than the current
    chapter's local page count.
  */
  const [epubLocationsReady, setEpubLocationsReady] =
    useState(false)

  const [readerFullscreen, setReaderFullscreen] =
    useState(false)

  /* =======================================================
     CHAPTER MENU
  ======================================================= */

  const [chapterPanelOpen, setChapterPanelOpen] =
    useState(false)

  /* =======================================================
     READ ALOUD STATE
  ======================================================= */

  const [isReading, setIsReading] =
    useState(false)

  const [readAloudProgress, setReadAloudProgress] =
    useState(0)

  const [readAloudLabel, setReadAloudLabel] =
    useState('')

  /* =======================================================
     CONTENT
     Three sources, in order:
       1. seed* — hardcoded demo content
       2. admin* — localStorage admin panel content (kept for
          backward compatibility, per-browser only)
       3. telegram* — the real production source: Supabase
          tables kept in sync by the Telegram webhook, live-
          updated via Realtime (see src/lib/telegramContent.js)
  ======================================================= */

  const [telegramStories, setTelegramStories] = useState([])
  const [telegramBooks, setTelegramBooks] = useState([])
  const [telegramVideoStories, setTelegramVideoStories] = useState([])

  const stories = [
    
    ...adminStories,
    ...telegramStories,
  ]

  const books = [
    ...seedBooks,
    ...adminBooks,
    ...telegramBooks,
  ]

  const videoStories = [
    
    ...adminVideos,
    ...telegramVideoStories,
  ]

  /* =======================================================
     PERSISTENCE
  ======================================================= */

  const persistStories = (list) => {
    setAdminStories(list)
    saveList(
      'hj_admin_stories',
      list
    )
  }

  const persistBooks = (list) => {
    setAdminBooks(list)
    saveList(
      'hj_admin_books',
      list
    )
  }

  const persistVideos = (list) => {
    setAdminVideos(list)
    saveList(
      'hj_admin_videos',
      list
    )
  }

  const addStory = (story) =>
    persistStories([
      ...adminStories,
      story,
    ])

  const updateStory = (
    storyId,
    updates
  ) =>
    persistStories(
      adminStories.map((story) =>
        story.id === storyId
          ? {
            ...story,
            ...updates,
          }
          : story
      )
    )

  const addEpisodeToStory = (
    storyId,
    episode
  ) =>
    persistStories(
      adminStories.map((story) =>
        story.id === storyId
          ? {
            ...story,
            episodes: [
              ...(story.episodes || []),
              episode,
            ],
          }
          : story
      )
    )

  const updateEpisode = (
    storyId,
    episodeNumber,
    updates
  ) =>
    persistStories(
      adminStories.map((story) =>
        story.id === storyId
          ? {
            ...story,
            episodes: (
              story.episodes || []
            ).map(
              (episode) =>
                episode.number ===
                  episodeNumber
                  ? {
                    ...episode,
                    ...updates,
                  }
                  : episode
            ),
          }
          : story
      )
    )

  const deleteEpisode = (
    storyId,
    episodeNumber
  ) =>
    persistStories(
      adminStories.map((story) =>
        story.id === storyId
          ? {
            ...story,
            episodes: (
              story.episodes || []
            ).filter(
              (episode) =>
                episode.number !==
                episodeNumber
            ),
          }
          : story
      )
    )

  const deleteAdminStory = (
    storyId
  ) => {
    persistStories(
      adminStories.filter(
        (story) =>
          story.id !== storyId
      )
    )

    if (
      selectedStory?.id === storyId
    ) {
      setSelectedStory(null)
      setPage('home')
    }
  }

  const addBook = (book) =>
    persistBooks([
      ...adminBooks,
      book,
    ])

  const updateBook = (
    bookId,
    updates
  ) =>
    persistBooks(
      adminBooks.map((book) =>
        book.id === bookId
          ? {
            ...book,
            ...updates,
          }
          : book
      )
    )

  const deleteAdminBook = (
    bookId
  ) => {
    persistBooks(
      adminBooks.filter(
        (book) =>
          book.id !== bookId
      )
    )

    if (
      selectedBook?.id === bookId
    ) {
      setSelectedBook(null)
      setPage('home')
    }
  }

  const addVideoStory = (
    video
  ) =>
    persistVideos([
      ...adminVideos,
      video,
    ])

  const updateVideoStory = (
    videoId,
    updates
  ) =>
    persistVideos(
      adminVideos.map((video) =>
        video.id === videoId
          ? {
            ...video,
            ...updates,
          }
          : video
      )
    )

  const updateVideoEpisode = (
    videoId,
    episodeNumber,
    updates
  ) =>
    persistVideos(
      adminVideos.map((video) =>
        video.id === videoId
          ? {
            ...video,
            episodes: (
              video.episodes ||
              []
            ).map(
              (episode) =>
                episode.number ===
                  episodeNumber
                  ? {
                    ...episode,
                    ...updates,
                  }
                  : episode
            ),
          }
          : video
      )
    )

  const addVideoEpisode = (
    videoId,
    episode
  ) =>
    persistVideos(
      adminVideos.map((video) =>
        video.id === videoId
          ? {
            ...video,
            episodes: [
              ...(video.episodes ||
                []),
              episode,
            ],
          }
          : video
      )
    )

  const deleteVideoEpisode = (
    videoId,
    episodeNumber
  ) =>
    persistVideos(
      adminVideos.map((video) =>
        video.id === videoId
          ? {
            ...video,
            episodes: (
              video.episodes ||
              []
            ).filter(
              (episode) =>
                episode.number !==
                episodeNumber
            ),
          }
          : video
      )
    )

  const deleteAdminVideo = (
    videoId
  ) => {
    persistVideos(
      adminVideos.filter(
        (video) =>
          video.id !== videoId
      )
    )

    if (
      selectedVideo?.id === videoId
    ) {
      setSelectedVideo(null)
      setPage('home')
    }
  }

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    if(currentEpisode) {
      console.log("SELECTED EPISODE", currentEpisode);
      console.log("FINAL AUDIO SRC", currentEpisode?.src);
      console.log('AUDIO SRC', currentEpisode?.src);
      setTimeout(() => {
        console.log('AUDIO ELEMENT SRC', audioRef.current?.src);
        
        if (audioRef.current) {
          const el = audioRef.current;
          console.log('[AUDIO INIT STATUS]', {
            ref: !!el,
            src: el.src,
            currentSrc: el.currentSrc,
            readyState: el.readyState,
            networkState: el.networkState,
            error: el.error,
            currentEpisodeSrc: currentEpisode?.src
          });

          const events = ['loadstart','loadedmetadata','loadeddata','canplay','canplaythrough','waiting','stalled','suspend','error','abort','ended', 'play', 'pause'];
          events.forEach(e => {
            el.addEventListener(e, (ev) => {
              console.log(`[AUDIO EVENT] ${e}`, {
                src: el.src,
                currentSrc: el.currentSrc,
                readyState: el.readyState,
                networkState: el.networkState,
                error: el.error
              });
            });
          });
        }
      }, 100);
    }
  }, [currentEpisode]);

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          setUser(
            data.session?.user ??
            null
          )
        }
      })

    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(
            session?.user ?? null
          )
        }
      )

    console.log("FINAL STORIES STATE", stories);
  return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setPurchasedStoryIds(new Set())
      return
    }

    let mounted = true
    const fetchPurchases = async () => {
      try {
        const { data, error } = await supabase
          .from('purchases')
          .select('story_id')
          .eq('user_id', user.id)

        if (error) {
          console.warn('Could not fetch purchases:', error.message)
          return
        }

        if (mounted && data) {
          const ids = new Set(data.map((p) => String(p.story_id)))
          setPurchasedStoryIds(ids)
        }
      } catch (err) {
        console.warn('Error fetching purchases:', err)
      }
    }

    fetchPurchases()

    return () => {
      mounted = false
    }
  }, [user])

  /* =======================================================
     TELEGRAM-BACKED CONTENT (Supabase + Realtime)
     Fetches once on mount, then refetches whenever the
     webhook writes a change — so new Telegram uploads show
     up on the site without a manual refresh.
  ======================================================= */

  useEffect(() => {
    let mounted = true

    const load = () => {
      fetchTelegramContent()
        .then((data) => {
            console.log("APP RECEIVED STORIES:", data.stories.length);
          if (!mounted) return
          console.log('FETCHED STORIES IN APP:', data.stories); setTelegramStories(data.stories)
          setTelegramBooks(data.books)
          setTelegramVideoStories(data.videoStories)
        })
        .catch((error) => {
          // Realtime content is additive — if Supabase isn't
          // configured yet (e.g. local dev without the
          // migration applied), the site still works fine on
          // seed/localStorage content alone.
          console.warn(
            'Telegram content unavailable:',
            error?.message || error
          )
        })
    }

    load()

    const unsubscribe = subscribeToTelegramContent(load)

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (
      user &&
      loginOpen
    ) {
      setLoginOpen(false)
    }
  }, [
    user,
    loginOpen,
  ])

  /* =======================================================
     PARTICLE WATERMARK
  ======================================================= */

  useEffect(() => {
    const canvas =
      particleCanvasRef.current

    if (!canvas) return

    const ctx =
      canvas.getContext('2d')

    if (!ctx) return

    let width =
      window.innerWidth

    let height =
      window.innerHeight

    let animationId
    let particles = []
    let ready = false

    const resize = () => {
      width =
        window.innerWidth

      height =
        window.innerHeight

      const dpr = Math.min(
        window.devicePixelRatio ||
        1,
        2
      )

      canvas.width =
        width * dpr

      canvas.height =
        height * dpr

      canvas.style.width =
        `${width}px`

      canvas.style.height =
        `${height}px`

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      )
    }

    resize()

    window.addEventListener(
      'resize',
      resize
    )

    const img =
      new Image()

    img.src =
      '/hj-groups-logo.png'

    img.onload = () => {
      const targetWidth =
        Math.min(
          320,
          width * 0.4
        )

      const scale =
        targetWidth /
        img.width

      const targetHeight =
        img.height *
        scale

      const sampleCanvas =
        document.createElement(
          'canvas'
        )

      sampleCanvas.width =
        targetWidth

      sampleCanvas.height =
        targetHeight

      const sctx =
        sampleCanvas.getContext(
          '2d'
        )

      if (!sctx) return

      sctx.drawImage(
        img,
        0,
        0,
        targetWidth,
        targetHeight
      )

      let data

      try {
        data =
          sctx.getImageData(
            0,
            0,
            targetWidth,
            targetHeight
          ).data
      } catch {
        return
      }

      const originX =
        width / 2 -
        targetWidth / 2

      const originY =
        height * 0.14

      const step =
        targetWidth > 220
          ? 3
          : 2

      for (
        let y = 0;
        y < targetHeight;
        y += step
      ) {
        for (
          let x = 0;
          x < targetWidth;
          x += step
        ) {
          const idx =
            (y *
              targetWidth +
              x) *
            4

          const alpha =
            data[idx + 3]

          if (alpha > 80) {
            const homeX =
              originX + x

            const homeY =
              originY + y

            particles.push({
              x: homeX,
              y: homeY,
              homeX,
              homeY,
              vx: 0,
              vy: 0,
              size:
                Math.random() *
                0.8 +
                0.6,
              r: data[idx],
              g: data[idx + 1],
              b: data[idx + 2],
            })
          }
        }
      }

      ready = true
    }

    const animate =
      () => {
        ctx.clearRect(
          0,
          0,
          width,
          height
        )

        if (ready) {
          const mouse =
            mouseRef.current

          const dxMove =
            mouse.x -
            mouse.lastX

          const dyMove =
            mouse.y -
            mouse.lastY

          const movement =
            Math.sqrt(
              dxMove *
              dxMove +
              dyMove *
              dyMove
            )

          mouse.moving =
            movement > 0.3

          for (const particle of particles) {
            let targetX =
              particle.homeX

            let targetY =
              particle.homeY

            if (mouse.moving) {
              const dx =
                particle.homeX -
                mouse.x

              const dy =
                particle.homeY -
                mouse.y

              const distance =
                Math.sqrt(
                  dx * dx +
                  dy * dy
                )

              const radius =
                150

              if (
                distance <
                radius
              ) {
                const strength =
                  (1 -
                    distance /
                    radius) *
                  1.6

                targetX =
                  particle.homeX +
                  dx *
                  strength *
                  Math.min(
                    movement /
                    12,
                    4
                  )

                targetY =
                  particle.homeY +
                  dy *
                  strength *
                  Math.min(
                    movement /
                    12,
                    4
                  )

                targetX +=
                  dxMove *
                  Math.min(
                    movement /
                    5,
                    6
                  )

                targetY +=
                  dyMove *
                  Math.min(
                    movement /
                    5,
                    6
                  )
              }
            }

            particle.vx +=
              (targetX -
                particle.x) *
              0.03

            particle.vy +=
              (targetY -
                particle.y) *
              0.03

            particle.vx *= 0.87
            particle.vy *= 0.87

            particle.x +=
              particle.vx

            particle.y +=
              particle.vy

            ctx.beginPath()

            ctx.arc(
              particle.x,
              particle.y,
              particle.size,
              0,
              Math.PI *
              2
            )

            ctx.fillStyle =
              `rgba(${particle.r},${particle.g},${particle.b},0.80)`

            ctx.fill()
          }

          mouse.lastX +=
            (mouse.x -
              mouse.lastX) *
            0.25

          mouse.lastY +=
            (mouse.y -
              mouse.lastY) *
            0.25
        }

        animationId =
          requestAnimationFrame(
            animate
          )
      }

    const handleMouseMove = (
      event
    ) => {
      mouseRef.current.x =
        event.clientX

      mouseRef.current.y =
        event.clientY
    }

    window.addEventListener(
      'mousemove',
      handleMouseMove
    )

    animate()

    return () => {
      cancelAnimationFrame(
        animationId
      )

      window.removeEventListener(
        'resize',
        resize
      )

      window.removeEventListener(
        'mousemove',
        handleMouseMove
      )
    }
  }, [])

  /* =======================================================
     ACCESS CONTROL
  ======================================================= */

  const canAccessContent = (
    item,
    adsKey
  ) =>
    canAccess(item, {
      isAdmin,
      unlockedAds,
      adsKey,
      purchasedStoryIds,
    })

  const getEpisodeAccessLabel = (
    episode
  ) =>
    accessLabel(episode, {
      isAdmin,
    })

  const requestAccess = (
    item,
    adsKey,
    onGranted
  ) => {
    if (canAccessContent(item, adsKey)) {
      onGranted()
      return
    }

    if (item.available === false) {
      alert('This content is coming soon.')
      return
    }

    const types = resolveAccessType(item)

    if (types.includes('ads')) {
      pendingUnlockRef.current = {
        adsKey,
        onGranted,
      }
      setAdModalOpen(true)
      return
    }

    if (types.includes('vip')) {
      alert('This is VIP content. VIP access or a purchase is required.')
      return
    }

    if (types.includes('premium')) {
      alert('This is Premium content. Premium access is required.')
      return
    }

    alert('This content is locked.')
  }

  const handleAdUnlocked =
    () => {
      const pending =
        pendingUnlockRef.current

      if (
        pending?.adsKey
      ) {
        setUnlockedAds(
          (previous) => {
            const next =
              new Set(
                previous
              )

            next.add(
              pending.adsKey
            )

            saveUnlockedAds(
              next
            )

            return next
          }
        )
      }

      pending?.onGranted?.()

      pendingUnlockRef.current =
        null

      setAdModalOpen(false)
    }

  const handleAdCancel =
    () => {
      pendingUnlockRef.current =
        null

      setAdModalOpen(false)
    }

  /* =======================================================
     MEDIA PLAYER
  ======================================================= */

  const getMediaElement =
    () =>
      currentEpisode?.type ===
        'video'
        ? videoRef.current
        : audioRef.current

  const playMedia =
    async () => {
      const media =
        getMediaElement()

      if (!media) return

      const adsKey =
        currentEpisode &&
          currentStory
          ? adsKeyFor(
            currentEpisode.type ===
              'video'
              ? 'video-episode'
              : 'episode',
            currentStory.id,
            currentEpisode.number
          )
          : undefined

      if (
        !canAccessContent(
          currentEpisode,
          adsKey
        )
      ) {
        return
      }

      if (isReading) {
        stopReadAloud()
      }

      setActivePlayerKind(
        'episode'
      )

      try {
        media.volume =
          volume

        media.playbackRate =
          speed

        await media.play()

        setIsPlaying(true)
      } catch {
        setIsPlaying(false)
      }
    }

  const togglePlay =
    () => {
      const media =
        getMediaElement()

      if (!media) return

      if (isPlaying) {
        media.pause()
        setIsPlaying(false)
      } else {
        playMedia()
      }
    }

  const loadAndPlay =
    (episode) => {
      setTimeout(() => {
        const media =
          episode.type ===
            'video'
            ? videoRef.current
            : audioRef.current

        if (!media) {
          setIsPlaying(false)
          return
        }

        const adsKey =
          currentStory
            ? adsKeyFor(
              episode.type ===
                'video'
                ? 'video-episode'
                : 'episode',
              currentStory.id,
              episode.number
            )
            : undefined

        if (
          !canAccessContent(
            episode,
            adsKey
          )
        ) {
          setIsPlaying(false)
          return
        }

        try {
          media.load()

          media.volume =
            volume

          media.playbackRate =
            speed

          const playPromise = media.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log("LOADANDPLAY: PROMISE RESOLVED");
              setIsPlaying(true);
            }).catch(error => {
              console.error("PLAY FAILED in loadAndPlay", error);
              setIsPlaying(false);
            });
          }
        } catch {
          setIsPlaying(false)
        }
      }, 250)
    }

  const openPlayer = (
    story,
    episode
  ) => {
    if (!episode) return

    if (readerBook) {
      teardownReader()
    }

    const adsKey =
      adsKeyFor(
        episode.type ===
          'video'
          ? 'video-episode'
          : 'episode',
        story.id,
        episode.number
      )

    requestAccess(
      episode,
      adsKey,
      () => {
        if (isReading) {
          stopReadAloud()
        }

        setActivePlayerKind(
          'episode'
        )

        setCurrentStory(
          story
        )

        setCurrentEpisode(
          episode
        )

        setPlayerOpen(true)
        setFullPlayer(true)

        setCurrentTime(0)
        setDuration(0)

        loadAndPlay(
          episode
        )
      }
    )
  }

  const selectEpisode =
    (episode) => {
      if (!currentStory) return

      const adsKey =
        adsKeyFor(
          episode.type ===
            'video'
            ? 'video-episode'
            : 'episode',
          currentStory.id,
          episode.number
        )

      requestAccess(
        episode,
        adsKey,
        () => {
          setCurrentEpisode(
            episode
          )

          setCurrentTime(0)
          setDuration(0)

          loadAndPlay(
            episode
          )
        }
      )
    }

  const nextEpisode =
    () => {
      if (
        !currentStory ||
        !currentEpisode
      ) {
        return
      }

      const episodes =
        currentStory.episodes ||
        []

      const currentIndex =
        episodes.findIndex(
          (episode) =>
            episode.number ===
            currentEpisode.number
        )

      const next =
        currentIndex >= 0
          ? episodes[
          currentIndex +
          1
          ]
          : null

      if (next) {
        selectEpisode(
          next
        )
      }
    }

  const previousEpisode =
    () => {
      if (
        !currentStory ||
        !currentEpisode
      ) {
        return
      }

      const episodes =
        currentStory.episodes ||
        []

      const currentIndex =
        episodes.findIndex(
          (episode) =>
            episode.number ===
            currentEpisode.number
        )

      const previous =
        currentIndex > 0
          ? episodes[
          currentIndex -
          1
          ]
          : null

      if (previous) {
        selectEpisode(
          previous
        )
      }
    }

  const seek = (
    seconds
  ) => {
    const media =
      getMediaElement()

    if (!media) return

    const max =
      Number.isFinite(
        media.duration
      )
        ? media.duration
        : 0

    media.currentTime =
      clamp(
        media.currentTime +
        seconds,
        0,
        max
      )

    setCurrentTime(
      media.currentTime
    )
  }

  const handleTimeUpdate =
    () => {
      const media =
        getMediaElement()

      if (!media) return

      setCurrentTime(
        media.currentTime ||
        0
      )
    }

  const handleLoadedMetadata =
    () => {
      const media =
        getMediaElement()

      if (!media) return

      setDuration(
        Number.isFinite(
          media.duration
        )
          ? media.duration
          : 0
      )
    }

  const handleEnded =
    () => {
      setIsPlaying(false)
      nextEpisode()
    }

  const changeProgress =
    (event) => {
      const value =
        Number(
          event.target.value
        )

      const media =
        getMediaElement()

      if (!media) return

      media.currentTime =
        value

      setCurrentTime(
        value
      )
    }

  const changeVolume =
    (event) => {
      const value =
        Number(
          event.target.value
        )

      setVolume(value)

      if (audioRef.current) {
        audioRef.current.volume =
          value
      }

      if (videoRef.current) {
        videoRef.current.volume =
          value
      }

      if (
        speechUtteranceRef.current
      ) {
        speechUtteranceRef.current.volume =
          value
      }
    }

  const changeSpeed =
    (value) => {
      setSpeed(value)

      if (audioRef.current) {
        audioRef.current.playbackRate =
          value
      }

      if (videoRef.current) {
        videoRef.current.playbackRate =
          value
      }

      /*
        SpeechSynthesis applies
        the rate to the next utterance.
      */
    }

  const startSleepTimer =
    (minutes) => {
      if (
        sleepTimerRef.current
      ) {
        clearTimeout(
          sleepTimerRef.current
        )
      }

      if (
        minutes === 0
      ) {
        setSleepMinutes(0)
        return
      }

      sleepTimerRef.current =
        setTimeout(() => {
          const media =
            getMediaElement()

          if (media) {
            media.pause()
          }

          stopReadAloud()

          setIsPlaying(
            false
          )

          setSleepMinutes(
            0
          )
        }, minutes * 60 * 1000)

      setSleepMinutes(
        minutes
      )
    }

  const closePlayer =
    () => {
      const media =
        getMediaElement()

      if (media) {
        media.pause()
      }

      setPlayerOpen(false)
      setFullPlayer(false)
      setIsPlaying(false)

      setActivePlayerKind(
        (kind) =>
          kind ===
            'episode'
            ? null
            : kind
      )
    }

  /* =======================================================
     STORY / LIBRARY
  ======================================================= */

  const openStoryDetails =
    (story) => {
      setSelectedStory(
        story
      )

      setPage('story')

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }

  const closeStoryDetails =
    () => {
      setSelectedStory(null)
      setPage('home')
    }

  const addToLibrary =
    (story) => {
      setLibrary(
        (previous) => {
          if (
            previous.some(
              (item) =>
                item.id ===
                story.id
            )
          ) {
            return previous
          }

          const next = [
            ...previous,
            story,
          ]

          saveList(
            'hj_user_library',
            next
          )

          return next
        }
      )

      setLibraryMessage(
        '✓ Added to My Library'
      )

      setTimeout(
        () =>
          setLibraryMessage(
            ''
          ),
        2200
      )
    }

  const removeFromLibrary =
    (storyId) => {
      setLibrary(
        (previous) => {
          const next =
            previous.filter(
              (item) =>
                item.id !==
                storyId
            )

          saveList(
            'hj_user_library',
            next
          )

          return next
        }
      )

      setLibraryMessage(
        '✓ Removed from My Library'
      )

      setTimeout(
        () =>
          setLibraryMessage(
            ''
          ),
        2200
      )
    }

  const toggleBookLibrary =
    (book) => {
      setBookLibrary(
        (previous) => {
          const exists =
            previous.some(
              (item) =>
                item.id ===
                book.id
            )

          const next =
            exists
              ? previous.filter(
                (item) =>
                  item.id !==
                  book.id
              )
              : [
                ...previous,
                book,
              ]

          saveList(
            'hj_user_book_library',
            next
          )

          return next
        }
      )

      const exists =
        bookLibrary.some(
          (item) =>
            item.id ===
            book.id
        )

      setLibraryMessage(
        exists
          ? '✓ Removed from My Library'
          : '✓ Added to My Library'
      )

      setTimeout(
        () =>
          setLibraryMessage(
            ''
          ),
        2200
      )
    }

  /* =======================================================
     LOGOUT
  ======================================================= */

  const handleLogout =
    async () => {
      await supabase.auth.signOut()

      setPage('home')

      setSelectedBook(null)
      setSelectedVideo(null)
      setSelectedStory(null)
    }

  /* =======================================================
     READER FILE CLEANUP
  ======================================================= */

  const cleanupReaderObjectUrl =
    () => {
      if (
        readerObjectUrlRef.current
      ) {
        try {
          URL.revokeObjectURL(
            readerObjectUrlRef.current
          )
        } catch { }

        readerObjectUrlRef.current =
          null
      }
    }

  /* =======================================================
     STOP READ ALOUD
  ======================================================= */

  const stopReadAloud =
    () => {
      speechRunRef.current +=
        1

      pendingAutoReadRef.current =
        false

      speechChunksRef.current =
        []

      speechChunkIndexRef.current =
        0

      if (
        'speechSynthesis' in
        window
      ) {
        window.speechSynthesis.cancel()
      }

      speechUtteranceRef.current =
        null

      setIsReading(false)
      setReadAloudProgress(0)
      setReadAloudLabel('')
    }

  /* =======================================================
     READER TEXT
  ======================================================= */

  const getPdfPageText =
    async () => {
      const pdf =
        pdfDocumentRef.current

      if (!pdf) return ''

      try {
        const page =
          await pdf.getPage(
            pdfPage
          )

        const content =
          await page.getTextContent()

        return cleanSpeechText(
          content.items
            .map(
              (item) =>
                item?.str || ''
            )
            .join(' ')
        )
      } catch (error) {
        console.warn(
          'PDF text extraction failed:',
          error
        )

        return ''
      }
    }

  const getEpubText =
    () => {
      const container =
        epubContainerRef.current

      if (!container)
        return ''

      const iframe =
        container.querySelector(
          'iframe'
        )

      if (!iframe)
        return ''

      try {
        const doc =
          iframe.contentDocument

        if (!doc)
          return ''

        return cleanSpeechText(
          doc.body?.innerText ||
          doc.documentElement
            ?.innerText ||
          ''
        )
      } catch (error) {
        console.warn(
          'EPUB text extraction failed:',
          error
        )

        return ''
      }
    }

  const getCurrentReaderText =
    async () => {
      if (
        readerType ===
        'pdf'
      ) {
        return getPdfPageText()
      }

      if (
        readerType ===
        'epub'
      ) {
        /*
          EPUB iframe can need a small
          amount of time after rendering.
        */
        let text =
          getEpubText()

        if (!text) {
          await sleep(120)
          text =
            getEpubText()
        }

        if (!text) {
          await sleep(300)
          text =
            getEpubText()
        }

        return text
      }

      return ''
    }

  /* =======================================================
     READ ALOUD ENGINE
  ======================================================= */

  const speakNextChunk =
    (runId) => {
      if (
        speechRunRef.current !==
        runId
      ) {
        return
      }

      const chunks =
        speechChunksRef.current

      const index =
        speechChunkIndexRef.current

      if (
        index >=
        chunks.length
      ) {
        setIsReading(false)
        setReadAloudProgress(100)

        const continueReading =
          () => {
            if (
              speechRunRef.current !==
              runId
            ) {
              return
            }

            /*
              PDF:
              Page 1 → Page 2 → ...
            */
            if (
              readerType ===
              'pdf'
            ) {
              if (
                pdfPages > 0 &&
                pdfPage <
                pdfPages
              ) {
                pendingAutoReadRef.current =
                  true

                setPdfPage(
                  (
                    current
                  ) =>
                    Math.min(
                      current +
                      1,
                      pdfPages
                    )
                )

                return
              }
            }

            /*
              EPUB:
              next EPUB location.
            */
            if (
              readerType ===
              'epub' &&
              epubReady
            ) {
              pendingAutoReadRef.current =
                true

              epubNext()
            }
          }

        setReadAloudLabel(
          'Finished'
        )

        continueReading()

        return
      }

      const chunk =
        chunks[index]

      const total =
        chunks.length

      setReadAloudLabel(
        `Reading ${index + 1
        } / ${total}`
      )

      const utterance =
        new SpeechSynthesisUtterance(
          chunk
        )

      utterance.rate = speed
      utterance.volume =
        volume

      speechUtteranceRef.current =
        utterance

      utterance.onstart =
        () => {
          if (
            speechRunRef.current !==
            runId
          ) {
            return
          }

          setIsReading(
            true
          )

          setReadAloudProgress(
            Math.round(
              (index /
                total) *
              100
            )
          )
        }

      utterance.onboundary =
        (event) => {
          if (
            speechRunRef.current !==
            runId
          ) {
            return
          }

          if (
            typeof event.charIndex ===
            'number'
          ) {
            const withinChunk =
              chunk.length
                ? event.charIndex /
                chunk.length
                : 0

            const overall =
              ((index +
                withinChunk) /
                total) *
              100

            setReadAloudProgress(
              clamp(
                overall,
                0,
                100
              )
            )
          }
        }

      utterance.onend =
        () => {
          if (
            speechRunRef.current !==
            runId
          ) {
            return
          }

          speechChunkIndexRef.current +=
            1

          speakNextChunk(
            runId
          )
        }

      utterance.onerror =
        (event) => {
          if (
            speechRunRef.current !==
            runId
          ) {
            return
          }

          /*
            `canceled` happens when we
            intentionally stop speech.
          */
          if (
            event?.error ===
            'canceled' ||
            event?.error ===
            'interrupted'
          ) {
            return
          }

          console.warn(
            'Speech synthesis error:',
            event
          )

          setIsReading(false)
          setReadAloudLabel(
            'Speech stopped'
          )
        }

      /*
        IMPORTANT: do NOT call cancel() here.
        This function is invoked either (a) once,
        from readAloud(), right after we already
        cancelled any prior speech, or (b) from a
        previous utterance's onend handler, at
        which point nothing is speaking. Calling
        cancel() immediately before speak() in
        either case is a well-known trigger for
        Chrome silently dropping the utterance
        (no onstart, no onend, no onerror) or
        firing a spurious onerror — which is what
        produced the "Speech stopped" state.
      */
      try {
        window.speechSynthesis.resume()
      } catch { }

      window.speechSynthesis.speak(
        utterance
      )

      /*
        Watchdog: Chrome occasionally drops a
        speak() call silently (no events fire at
        all). If onstart hasn't fired shortly
        after, retry once before giving up.
      */
      setTimeout(() => {
        if (
          speechRunRef.current !== runId
        ) {
          return
        }

        if (
          speechUtteranceRef.current !==
          utterance
        ) {
          return
        }

        if (
          window.speechSynthesis.speaking ||
          window.speechSynthesis.pending
        ) {
          return
        }

        try {
          window.speechSynthesis.resume()
          window.speechSynthesis.speak(
            utterance
          )
        } catch { }
      }, 900)
    }

  const readAloud =
    async () => {
      if (
        !('speechSynthesis' in
          window)
      ) {
        alert(
          'Read Aloud is not supported in this browser.'
        )

        return
      }

      if (isReading) {
        stopReadAloud()
        return
      }

      if (
        !readerBook ||
        !readerType
      ) {
        return
      }

      if (
        activePlayerKind ===
        'episode'
      ) {
        const media =
          getMediaElement()

        if (media) {
          media.pause()
        }

        setIsPlaying(false)
      }

      setActivePlayerKind(
        'readaloud'
      )

      /*
        Cancel anything previously speaking.
      */
      speechRunRef.current +=
        1

      const runId =
        speechRunRef.current

      window.speechSynthesis.cancel()

      setReadAloudLabel(
        'Preparing…'
      )

      const text =
        await getCurrentReaderText()

      if (
        speechRunRef.current !==
        runId
      ) {
        return
      }

      if (!text.trim()) {
        setReadAloudLabel(
          ''
        )

        alert(
          readerType === 'pdf'
            ? 'This PDF page has no readable text. If the PDF is scanned/image-only, OCR or a text layer is required for Read Aloud.'
            : 'No readable text was found in this EPUB chapter.'
        )

        return
      }

      const chunks =
        chunkTextForSpeech(
          text,
          700
        )

      if (!chunks.length) {
        alert(
          'No readable text was found.'
        )

        return
      }

      speechChunksRef.current =
        chunks

      speechChunkIndexRef.current =
        0

      setReadAloudProgress(
        0
      )

      setReadAloudLabel(
        `Reading 1 / ${chunks.length}`
      )

      speakNextChunk(
        runId
      )
    }

  readAloudRef.current =
    readAloud

  /* =======================================================
     READER CLEANUP
  ======================================================= */

  const teardownReader =
    () => {
      stopReadAloud()

      try {
        epubRenditionRef.current?.destroy()
      } catch { }

      try {
        epubBookRef.current?.destroy()
      } catch { }

      epubRenditionRef.current =
        null

      epubBookRef.current =
        null

      pdfDocumentRef.current =
        null

      cleanupReaderObjectUrl()

      setReaderOpen(false)

      setReaderFile(null)
      setReaderFilePath('')
      setReaderResolvedFile(
        null
      )

      setReaderType(null)
      setReaderBook(null)

      setReaderError('')
      setReaderLoading(false)

      setPdfPages(0)
      setPdfPage(1)
      setPdfScale(1)
      setPdfOutline([])

      setEpubPage(1)
      setEpubPages(0)
      setEpubFontScale(100)
      setEpubReady(false)
      setEpubLocationsReady(false)
      setEpubToc([])
      setEpubCurrentHref('')

      setChapterPanelOpen(
        false
      )

      setReaderFullscreen(
        false
      )

      setActivePlayerKind(
        (kind) =>
          kind ===
            'readaloud'
            ? null
            : kind
      )
    }

  const closeReaderView =
    () => {
      if (isReading) {
        setReaderOpen(false)
        setPage(
          'book-details'
        )
        return
      }

      teardownReader()

      if (selectedBook) {
        setPage(
          'book-details'
        )
      }
    }

  const closeReadAloud =
    () => {
      teardownReader()
    }

  /* =======================================================
     OPEN BOOK
  ======================================================= */

  const openReaderForBook =
    (
      book,
      {
        autoRead = false,
      } = {}
    ) => {
      if (!book) return

      if (
        readerBook &&
        readerBook.id !==
        book.id
      ) {
        teardownReader()
      }

      if (playerOpen) {
        closePlayer()
      }

      setReaderBook(book)

      setReaderType(
        book.type === 'epub'
          ? 'epub'
          : 'pdf'
      )

      setReaderFile(
        book.file || ''
      )

      setReaderFilePath(
        book.filePath ||
        ''
      )

      setReaderResolvedFile(
        null
      )

      setReaderError('')
      setReaderLoading(
        true
      )

      setReaderOpen(true)

      setPdfPage(1)
      setPdfPages(0)
      setPdfScale(1)
      setPdfOutline([])

      setEpubPage(1)
      setEpubPages(0)
      setEpubFontScale(100)
      setEpubReady(false)
      setEpubLocationsReady(false)
      setEpubToc([])
      setEpubCurrentHref('')

      setChapterPanelOpen(
        false
      )

      pendingAutoReadRef.current =
        autoRead

      if (autoRead) {
        setActivePlayerKind(
          'readaloud'
        )
      }
    }

  const startReadingBook =
    (book) => {
      const adsKey =
        adsKeyFor(
          'book',
          book.id
        )

      requestAccess(
        book,
        adsKey,
        () =>
          openReaderForBook(
            book
          )
      )
    }

  const startReadAloudForBook =
    (book) => {
      const adsKey =
        adsKeyFor(
          'book',
          book.id
        )

      requestAccess(
        book,
        adsKey,
        () =>
          openReaderForBook(
            book,
            {
              autoRead: true,
            }
          )
      )
    }

  const openBook =
    (book) => {
      setPreDetailsPage(
        page
      )

      setBooksModalOpen(
        false
      )

      setSelectedBook(
        book
      )

      setPage(
        'book-details'
      )

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }

  /* =======================================================
     READER FILE LOADING
  ======================================================= */

  useEffect(() => {
    if (
      !readerType ||
      !readerFile
    ) {
      return undefined
    }

    let cancelled = false

    const loadFile =
      async () => {
        setReaderLoading(
          true
        )

        setReaderError('')
        setReaderResolvedFile(
          null
        )

        try {
          const storagePath =
            readerFilePath ||
            getStoragePathFromPublicUrl(
              readerFile,
              'books'
            )

          let blob

          if (
            storagePath ||
            readerFile.includes(
              '/storage/v1/object/'
            )
          ) {
            blob =
              await downloadStorageFile(
                {
                  bucket: 'books',
                  path:
                    storagePath,
                  url: readerFile,
                }
              )
          } else if (
            readerFile.startsWith(
              '/'
            ) ||
            readerFile.startsWith(
              './'
            )
          ) {
            const response =
              await fetch(
                readerFile
              )

            if (!response.ok) {
              throw new Error(
                `Could not fetch book file (${response.status})`
              )
            }

            blob =
              await response.blob()
          } else {
            blob =
              await downloadStorageFile(
                {
                  bucket: 'books',
                  path:
                    readerFilePath,
                  url: readerFile,
                }
              )
          }

          if (cancelled)
            return

          if (
            !blob ||
            blob.size === 0
          ) {
            throw new Error(
              'The book file is empty.'
            )
          }

          const objectUrl =
            URL.createObjectURL(
              blob
            )

          readerObjectUrlRef.current =
            objectUrl

          setReaderResolvedFile(
            objectUrl
          )

          setReaderLoading(
            false
          )
        } catch (error) {
          if (cancelled)
            return

          console.error(
            'Book file loading failed:',
            error
          )

          setReaderResolvedFile(
            null
          )

          setReaderLoading(
            false
          )

          setReaderError(
            error?.message ||
            'Failed to load this book file.'
          )
        }
      }

    loadFile()

    return () => {
      cancelled = true
    }
  }, [
    readerType,
    readerFile,
    readerFilePath,
  ])

  /* =======================================================
     PDF
  ======================================================= */

  const extractPdfOutline =
    async (
      pdf
    ) => {
      try {
        const outline =
          await pdf.getOutline()

        if (!outline) {
          setPdfOutline([])
          return
        }

        const resolveItems =
          async (
            items,
            level = 0
          ) => {
            const output = []

            for (
              const item of items
            ) {
              if (!item) continue

              let pageNumber =
                null

              try {
                let destination =
                  item.dest

                if (
                  typeof destination ===
                  'string'
                ) {
                  destination =
                    await pdf.getDestination(
                      destination
                    )
                }

                if (
                  Array.isArray(
                    destination
                  ) &&
                  destination[0]
                ) {
                  const index =
                    await pdf.getPageIndex(
                      destination[0]
                    )

                  pageNumber =
                    index + 1
                }
              } catch { }

              output.push({
                id:
                  `${level}-${item.title}-${pageNumber}-${Math.random()}`,
                title:
                  item.title ||
                  'Untitled Chapter',
                page:
                  pageNumber,
                level,
                items:
                  item.items
                    ? await resolveItems(
                      item.items,
                      level + 1
                    )
                    : [],
              })
            }

            return output
          }

        const resolved =
          await resolveItems(
            outline
          )

        setPdfOutline(
          resolved
        )
      } catch (error) {
        console.warn(
          'PDF outline unavailable:',
          error
        )

        setPdfOutline([])
      }
    }

  const handlePdfLoadSuccess =
    async (pdf) => {
      pdfDocumentRef.current =
        pdf

      setPdfPages(
        pdf.numPages
      )

      setPdfPage(
        (current) =>
          clamp(
            current,
            1,
            pdf.numPages
          )
      )

      setReaderLoading(
        false
      )

      await extractPdfOutline(
        pdf
      )

      if (
        pendingAutoReadRef.current
      ) {
        pendingAutoReadRef.current =
          false

        setTimeout(
          () =>
            readAloudRef.current(),
          500
        )
      }
    }

  /* =======================================================
     EPUB
  ======================================================= */

  const flattenToc =
    (
      items,
      level = 0
    ) => {
      const result = []

      for (
        const item of items ||
        []
      ) {
        if (!item)
          continue

        result.push({
          label:
            item.label ||
            'Chapter',
          href:
            item.href ||
            '',
          level,
        })

        if (
          item.subitems?.length
        ) {
          result.push(
            ...flattenToc(
              item.subitems,
              level + 1
            )
          )
        }
      }

      return result
    }

  useEffect(() => {
    if (
      readerType !== 'epub' ||
      !readerResolvedFile ||
      !epubContainerRef.current
    ) {
      return undefined
    }

    let cancelled =
      false

    let book = null
    let rendition = null

    const setupEpub =
      async () => {
        setEpubReady(false)
        setReaderError('')
        setReaderLoading(
          true
        )

        try {
          const response =
            await fetch(
              readerResolvedFile
            )

          if (!response.ok) {
            throw new Error(
              `EPUB request failed (${response.status})`
            )
          }

          const arrayBuffer =
            await response.arrayBuffer()

          if (
            !arrayBuffer ||
            arrayBuffer.byteLength ===
            0
          ) {
            throw new Error(
              'EPUB file is empty.'
            )
          }

          if (cancelled)
            return

          const container =
            epubContainerRef.current

          if (!container) {
            throw new Error(
              'EPUB reader container is unavailable.'
            )
          }

          container.innerHTML =
            ''

          book =
            ePub(
              arrayBuffer
            )

          epubBookRef.current =
            book

          /*
            Read EPUB's navigation
            table of contents.
          */
          try {
            const navigation =
              await book.loaded
                .navigation

            if (
              !cancelled &&
              navigation
            ) {
              const toc =
                flattenToc(
                  navigation.toc
                )

              setEpubToc(
                toc
              )
            }
          } catch (error) {
            console.warn(
              'EPUB TOC unavailable:',
              error
            )

            setEpubToc([])
          }

          const width =
            Math.max(
              container.clientWidth ||
              1,
              1
            )

          const height =
            Math.max(
              container.clientHeight ||
              1,
              1
            )

          rendition =
            book.renderTo(
              container,
              {
                width,
                height,
                flow:
                  'paginated',
                manager:
                  'default',
              }
            )

          epubRenditionRef.current =
            rendition

          rendition.on(
            'relocated',
            (location) => {
              if (
                cancelled
              ) {
                return
              }

              const start =
                location?.start

              /*
                `start.displayed.page/.total` are
                the position WITHIN THE CURRENT
                CHAPTER only (epub.js pagination
                is per-section), so they undercount
                a real book. Prefer whole-book
                locations once they're generated;
                fall back to the per-chapter values
                only until then so the UI isn't
                blank while locations build.
              */
              const book =
                epubBookRef.current

              const hasLocations =
                book?.locations?.length > 0

              if (
                hasLocations &&
                start?.cfi
              ) {
                const index =
                  book.locations.locationFromCfi(
                    start.cfi
                  )

                if (
                  Number.isFinite(
                    index
                  ) &&
                  index >= 0
                ) {
                  setEpubPage(
                    index + 1
                  )
                }

                setEpubPages(
                  book.locations.length
                )
              } else if (
                start?.displayed
              ) {
                setEpubPage(
                  start.displayed
                    .page || 1
                )

                setEpubPages(
                  start.displayed
                    .total || 0
                )
              }

              if (
                start?.href
              ) {
                setEpubCurrentHref(
                  start.href
                )
              }
            }
          )

          rendition.on(
            'rendered',
            () => {
              if (
                cancelled
              ) {
                return
              }

              setEpubReady(
                true
              )

              setReaderLoading(
                false
              )

              try {
                rendition.themes.fontSize(
                  `${epubFontScale}%`
                )
              } catch { }

              if (
                pendingAutoReadRef.current
              ) {
                pendingAutoReadRef.current =
                  false

                setTimeout(
                  () =>
                    readAloudRef.current(),
                  400
                )
              }
            }
          )

          await rendition.display()

          if (cancelled)
            return

          try {
            rendition.themes.fontSize(
              `${epubFontScale}%`
            )
          } catch { }

          setEpubReady(
            true
          )

          setReaderLoading(
            false
          )

          if (
            pendingAutoReadRef.current
          ) {
            pendingAutoReadRef.current =
              false

            setTimeout(
              () =>
                readAloudRef.current(),
              400
            )
          }

          /*
            Generate real whole-book locations in
            the background (this is what makes
            "Page N / TOTAL" reflect the actual
            book instead of the current chapter).
            Runs after first paint so it never
            blocks opening the book. 1600 chars
            per "page" matches epub.js's own
            default/typical convention.
          */
          book.locations
            .generate(1600)
            .then(() => {
              if (cancelled) return

              setEpubLocationsReady(
                true
              )

              setEpubPages(
                book.locations
                  .length
              )

              try {
                const currentCfi =
                  rendition.currentLocation()
                    ?.start?.cfi

                if (currentCfi) {
                  const index =
                    book.locations.locationFromCfi(
                      currentCfi
                    )

                  if (
                    Number.isFinite(
                      index
                    ) &&
                    index >= 0
                  ) {
                    setEpubPage(
                      index + 1
                    )
                  }
                }
              } catch { }
            })
            .catch((error) => {
              console.warn(
                'EPUB location generation failed:',
                error
              )
            })
        } catch (error) {
          if (cancelled)
            return

          console.error(
            'EPUB setup failed:',
            error
          )

          setEpubReady(false)

          setReaderLoading(
            false
          )

          setReaderError(
            error?.message ||
            'Could not load this EPUB file.'
          )
        }
      }

    setupEpub()

    return () => {
      cancelled = true

      try {
        rendition?.destroy()
      } catch { }

      try {
        book?.destroy()
      } catch { }

      if (
        epubRenditionRef.current ===
        rendition
      ) {
        epubRenditionRef.current =
          null
      }

      if (
        epubBookRef.current ===
        book
      ) {
        epubBookRef.current =
          null
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    readerType,
    readerResolvedFile,
  ])

  useEffect(() => {
    if (
      readerType ===
      'epub' &&
      epubRenditionRef.current
    ) {
      try {
        epubRenditionRef.current.themes.fontSize(
          `${epubFontScale}%`
        )
      } catch { }
    }
  }, [
    epubFontScale,
    readerType,
  ])

  /* =======================================================
     EPUB NEXT / PREVIOUS
  ======================================================= */

  const epubPrevious =
    async () => {
      if (
        !epubRenditionRef.current ||
        !epubReady
      ) {
        return
      }

      try {
        await epubRenditionRef.current.prev()
      } catch (error) {
        console.warn(
          'EPUB previous failed:',
          error
        )
      }
    }

  const epubNext =
    async () => {
      if (
        !epubRenditionRef.current ||
        !epubReady
      ) {
        return
      }

      try {
        await epubRenditionRef.current.next()
      } catch (error) {
        console.warn(
          'EPUB next failed:',
          error
        )
      }
    }

  /* =======================================================
     READER NAVIGATION
  ======================================================= */

  const readerPrevious =
    () => {
      const wasReading =
        isReading

      if (isReading) {
        stopReadAloud()
      }

      if (
        readerType ===
        'pdf'
      ) {
        setPdfPage(
          (current) =>
            Math.max(
              1,
              current - 1
            )
        )
      } else {
        epubPrevious()
      }

      if (wasReading) {
        pendingAutoReadRef.current =
          true
      }
    }

  const readerNext =
    () => {
      const wasReading =
        isReading

      if (isReading) {
        stopReadAloud()
      }

      if (
        readerType ===
        'pdf'
      ) {
        setPdfPage(
          (current) =>
            Math.min(
              pdfPages ||
              current + 1,
              current + 1
            )
        )
      } else {
        epubNext()
      }

      if (wasReading) {
        pendingAutoReadRef.current =
          true
      }
    }

  /* =======================================================
     CHAPTER JUMP
  ======================================================= */

  const jumpToPdfChapter =
    async (
      item
    ) => {
      if (
        !item?.page
      ) {
        return
      }

      if (isReading) {
        stopReadAloud()
      }

      setPdfPage(
        item.page
      )

      setChapterPanelOpen(
        false
      )
    }

  const jumpToEpubChapter =
    async (
      item
    ) => {
      if (
        !item?.href ||
        !epubRenditionRef.current
      ) {
        return
      }

      if (isReading) {
        stopReadAloud()
      }

      try {
        await epubRenditionRef.current.display(
          item.href
        )

        setChapterPanelOpen(
          false
        )
      } catch (error) {
        console.warn(
          'EPUB chapter jump failed:',
          error
        )
      }
    }

  /* =======================================================
     EPUB PAGE / LOCATION INPUT
  ======================================================= */

  const jumpEpubByPage = async (
    pageNumber
  ) => {
    if (
      !epubBookRef.current ||
      !epubRenditionRef.current ||
      !epubReady
    ) {
      return
    }

    const book =
      epubBookRef.current

    const total =
      book.locations?.length || 0

    if (!total) {
      alert(
        'EPUB page locations are still being prepared. Please try again in a moment.'
      )
      return
    }

    const target = Math.max(
      1,
      Math.min(
        Number(pageNumber) || 1,
        total
      )
    )

    const locationIndex =
      target - 1

    try {
      const cfi =
        book.locations.cfiFromLocation(
          locationIndex
        )

      if (!cfi) return

      if (isReading) {
        stopReadAloud()
      }

      pendingAutoReadRef.current =
        false

      await epubRenditionRef.current.display(
        cfi
      )

      setEpubPage(target)
    } catch (error) {
      console.warn(
        'EPUB page jump failed:',
        error
      )
    }
  }

  /* =======================================================
     ZOOM
  ======================================================= */

  const zoomIn =
    () => {
      if (
        readerType ===
        'pdf'
      ) {
        setPdfScale(
          (value) =>
            Number(
              Math.min(
                2.5,
                value + 0.25
              ).toFixed(2)
            )
        )
      } else {
        setEpubFontScale(
          (value) =>
            Math.min(
              200,
              value + 10
            )
        )
      }
    }

  const zoomOut =
    () => {
      if (
        readerType ===
        'pdf'
      ) {
        setPdfScale(
          (value) =>
            Number(
              Math.max(
                0.5,
                value - 0.25
              ).toFixed(2)
            )
        )
      } else {
        setEpubFontScale(
          (value) =>
            Math.max(
              60,
              value - 10
            )
        )
      }
    }

  const zoomReset =
    () => {
      if (
        readerType ===
        'pdf'
      ) {
        setPdfScale(1)
      } else {
        setEpubFontScale(
          100
        )
      }
    }

  /* =======================================================
     FULLSCREEN
  ======================================================= */

  const toggleReaderFullscreen =
    async () => {
      const element =
        readerContainerRef.current

      if (!element) return

      try {
        if (
          !document.fullscreenElement
        ) {
          await element.requestFullscreen?.()
        } else {
          await document.exitFullscreen?.()
        }
      } catch (error) {
        console.warn(
          'Fullscreen failed:',
          error
        )

        alert(
          'Fullscreen is not supported in this browser.'
        )
      }
    }

  useEffect(() => {
    const handleFullscreen =
      () => {
        setReaderFullscreen(
          !!document.fullscreenElement
        )

        setTimeout(() => {
          try {
            epubRenditionRef.current?.resize()
          } catch { }
        }, 100)
      }

    document.addEventListener(
      'fullscreenchange',
      handleFullscreen
    )

    return () =>
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreen
      )
  }, [])

  /* =======================================================
     RESIZE
  ======================================================= */

  useEffect(() => {
    const handleResize =
      () => {
        try {
          epubRenditionRef.current?.resize()
        } catch { }
      }

    window.addEventListener(
      'resize',
      handleResize
    )

    return () =>
      window.removeEventListener(
        'resize',
        handleResize
      )
  }, [])

  /* =======================================================
     PDF RENDERED
  ======================================================= */

  const handlePageRendered =
    () => {
      if (
        readerBodyRef.current
      ) {
        readerBodyRef.current.scrollTop =
          0
      }

      if (
        pendingAutoReadRef.current
      ) {
        pendingAutoReadRef.current =
          false

        setTimeout(
          () =>
            readAloudRef.current(),
          250
        )
      }
    }

  /* =======================================================
     KEYBOARD
  ======================================================= */

  useEffect(() => {
    const handleKeyDown =
      (event) => {
        if (!readerOpen)
          return

        if (
          event.key ===
          'ArrowLeft'
        ) {
          event.preventDefault()
          readerPrevious()
        }

        if (
          event.key ===
          'ArrowRight'
        ) {
          event.preventDefault()
          readerNext()
        }

        if (
          event.key ===
          'Escape'
        ) {
          closeReaderView()
        }
      }

    window.addEventListener(
      'keydown',
      handleKeyDown
    )

    return () =>
      window.removeEventListener(
        'keydown',
        handleKeyDown
      )

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    readerOpen,
    readerType,
    pdfPages,
    isReading,
    epubReady,
  ])

  /* =======================================================
     GLOBAL CLEANUP
  ======================================================= */

  useEffect(() => {
    return () => {
      stopReadAloud()

      if (
        sleepTimerRef.current
      ) {
        clearTimeout(
          sleepTimerRef.current
        )
      }

      cleanupReaderObjectUrl()
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* =======================================================
     NOW PLAYING
  ======================================================= */

  const nowPlaying =
    activePlayerKind ===
      'episode' &&
      currentStory &&
      currentEpisode
      ? {
        kind: 'episode',
        title:
          currentStory.title,
        subtitle:
          `Episode ${currentEpisode.number}`,
        cover:
          currentStory.cover,
      }
      : activePlayerKind ===
        'readaloud' &&
        readerBook
        ? {
          kind: 'readaloud',
          title:
            readerBook.title,
          subtitle:
            readerType ===
              'pdf'
              ? `Page ${pdfPage} / ${pdfPages ||
              '—'
              }`
              : `Page ${epubPage} / ${epubPages ||
              '—'
              }`,
          cover:
            readerBook.cover,
        }
        : null

  const togglePlayback =
    () => {
      if (
        nowPlaying?.kind ===
        'episode'
      ) {
        togglePlay()
      } else if (
        nowPlaying?.kind ===
        'readaloud'
      ) {
        readAloud()
      }
    }

  const closeNowPlaying =
    () => {
      if (
        nowPlaying?.kind ===
        'episode'
      ) {
        closePlayer()
      } else if (
        nowPlaying?.kind ===
        'readaloud'
      ) {
        closeReadAloud()
      }
    }

  const expandNowPlaying =
    () => {
      if (
        nowPlaying?.kind ===
        'episode'
      ) {
        setFullPlayer(true)
        setPlayerOpen(true)
      } else if (
        nowPlaying?.kind ===
        'readaloud'
      ) {
        setReaderOpen(true)
      }
    }

  /* =======================================================
     FILTER
  ======================================================= */

  const filteredStories =
    activeCategory === 'All'
      ? stories
      : stories.filter(
        (story) =>
          story.genre ===
          activeCategory
      )

  const searchedStories =
    searchText.trim()
      ? stories.filter(
        (story) =>
          story.title
            .toLowerCase()
            .includes(
              searchText
                .toLowerCase()
            )
      )
      : filteredStories

  const filteredBooks =
    books.filter(
      (book) =>
        bookCategory ===
        'All' ||
        book.category ===
        bookCategory
    )

  const filteredVideos =
    videoStories.filter(
      (video) =>
        videoCategory ===
        'All' ||
        video.category ===
        videoCategory
    )

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="app">
      <canvas
        ref={
          particleCanvasRef
        }
        className="particle-canvas"
      />

      {currentEpisode?.available &&
        currentEpisode.type ===
        'audio' && (
          <audio
            ref={audioRef}
            src={currentEpisode.telegram_message_id ? `http://localhost:3000/audio/message/${currentEpisode.telegram_message_id}` : (currentEpisode.src || undefined)}
            preload="metadata"
            onLoadedMetadata={
              handleLoadedMetadata
            }
            onTimeUpdate={
              handleTimeUpdate
            }
            onEnded={
              handleEnded
            }
          />
        )}

      {currentEpisode?.available &&
        currentEpisode.type ===
        'video' &&
        !fullPlayer && (
          <video
            ref={videoRef}
            src={currentEpisode.telegram_message_id ? `http://localhost:3000/audio/message/${currentEpisode.telegram_message_id}` : (currentEpisode.src || undefined)}
            preload="metadata"
            onLoadedMetadata={
              handleLoadedMetadata
            }
            onTimeUpdate={
              handleTimeUpdate
            }
            onEnded={
              handleEnded
            }
          />
        )}

      {/* =====================================================
         HEADER
      ===================================================== */}

      <header className="top-header">
        <button
          className="brand-button"
          onClick={() => {
            teardownReader()
            closePlayer()

            setPage('home')
            setSelectedStory(
              null
            )
            setSelectedBook(
              null
            )
            setSelectedVideo(
              null
            )

            window.scrollTo({
              top: 0,
              behavior:
                'smooth',
            })
          }}
        >
          <img
            src="/hj-groups-logo.png"
            alt="HJ GROUPS"
          />
        </button>

        <nav className="top-nav">
          <button
            onClick={() =>
              setBooksModalOpen(
                true
              )
            }
          >
            📚Books
          </button>

          <button
            onClick={() =>
              setVideoModalOpen(
                true
              )
            }
          >
            🎬Video Stories
          </button>

          <button
            onClick={() =>
              setSearchOpen(
                (value) =>
                  !value
              )
            }
          >
            🔍Search
          </button>
        </nav>

        <button
          className="header-account"
          onClick={() => {
            if (loggedIn) {
              setPage(
                'account'
              )
            } else {
              setLoginOpen(true)
            }
          }}
        >
          {loggedIn
            ? isAdmin
              ? '👑Admin'
              : 'Account'
            : 'Login / Signup'}
        </button>
      </header>

      {/* =====================================================
         SEARCH
      ===================================================== */}

      {searchOpen && (
        <div className="search-panel">
          <input
            autoFocus
            value={
              searchText
            }
            onChange={(
              event
            ) =>
              setSearchText(
                event.target
                  .value
              )
            }
            placeholder="Search stories..."
          />

          {searchText && (
            <div className="search-results">
              {searchedStories.length ? (
                searchedStories.map(
                  (story) => (
                    <button
                      key={
                        story.id
                      }
                      onClick={() => {
                        openStoryDetails(
                          story
                        )

                        setSearchOpen(
                          false
                        )

                        setSearchText(
                          ''
                        )
                      }}
                    >
                      <img
                        src={
                          story.cover
                        }
                        alt=""
                      />

                      <div>
                        <strong>
                          {
                            story.title
                          }
                        </strong>

                        <small>
                          {
                            story.genre
                          }
                        </small>
                      </div>
                    </button>
                  )
                )
              ) : (
                <p>
                  Story கிடைக்கவில்லை.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================
         HOME
      ===================================================== */}

      {page === 'home' && (
        <main>
          <section className="category-section">
            <div className="eyebrow">
              EXPLORE
            </div>

            <h2>
              Choose your world
            </h2>

            <div className="category-list">
              {categories.map(
                (category) => (
                  <button
                    key={
                      category
                    }
                    className={
                      activeCategory ===
                        category
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setActiveCategory(
                        category
                      )
                    }
                  >
                    {
                      category
                    }
                  </button>
                )
              )}
            </div>
          </section>

          <section
            id="stories"
            className="section"
          >
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  LIBRARY
                </div>

                <h2>
                  Popular Stories
                </h2>

                <p>
                  Enter a new world
                  with every story.
                </p>
              </div>
            </div>

            <div className="story-grid">
              {searchedStories.map(
                (story) => (
                  <article
                    key={
                      story.id
                    }
                    className="story-card"
                    onClick={() =>
                      openStoryDetails(
                        story
                      )
                    }
                  >
                    <div className="story-image">
                      <img
                        src={
                          story.cover
                        }
                        alt={
                          story.title
                        }
                      />

                      <div className="story-overlay" />

                      <span className="story-status">
                        Ongoing
                      </span>

                      <button
                        className="story-play"
                        onClick={(
                          event
                        ) => {
                          event.stopPropagation()

                          const first =
                            story.episodes?.find(
                              (
                                episode
                              ) =>
                                episode.available !==
                                false &&
                                canAccessContent(
                                  episode,
                                  adsKeyFor(
                                    'episode',
                                    story.id,
                                    episode.number
                                  )
                                )
                            )

                          if (
                            first
                          ) {
                            openPlayer(
                              story,
                              first
                            )
                          } else {
                            alert(
                              'No playable episode available.'
                            )
                          }
                        }}
                      >
                        ▶
                      </button>
                    </div>

                    <div className="story-info">
                      <div className="story-meta">
                        <span>
                          {
                            story.genre
                          }
                        </span>

                        <span>
                          {
                            story
                              .episodes
                              ?.length ||
                            0
                          }{' '}
                          Episodes
                        </span>
                      </div>

                      <h3>
                        {
                          story.title
                        }
                      </h3>

                      <p>
                        {
                          story.description
                        }
                      </p>

                      <button
                        className="library-add"
                        onClick={(
                          event
                        ) => {
                          event.stopPropagation()

                          const exists =
                            library.some(
                              (
                                item
                              ) =>
                                item.id ===
                                story.id
                            )

                          if (
                            exists
                          ) {
                            removeFromLibrary(
                              story.id
                            )
                          } else {
                            addToLibrary(
                              story
                            )
                          }
                        }}
                      >
                        {library.some(
                          (
                            item
                          ) =>
                            item.id ===
                            story.id
                        )
                          ? '✓ In My Library · Remove'
                          : '+ My Library'}
                      </button>
                    </div>
                  </article>
                )
              )}
            </div>
          </section>

          <section
            id="latest"
            className="section"
          >
            <div className="eyebrow">
              LATEST
            </div>

            <h2>
              Latest Episodes
            </h2>

            <div className="latest-list">
              {stories.map(
                (story) => {
                  const episode =
                    story.episodes?.find(
                      (
                        item
                      ) =>
                        item.available !==
                        false &&
                        canAccessContent(
                          item,
                          adsKeyFor(
                            'episode',
                            story.id,
                            item.number
                          )
                        )
                    )

                  if (
                    !episode
                  ) {
                    return null
                  }

                  return (
                    <div
                      className="latest-item"
                      key={
                        story.id
                      }
                    >
                      <div className="latest-number">
                        {String(
                          episode.number
                        ).padStart(
                          2,
                          '0'
                        )}
                      </div>

                      <div className="latest-info">
                        <small>
                          {
                            story.title
                          }
                        </small>

                        <h3>
                          {
                            episode.title
                          }
                        </h3>
                      </div>

                      <button
                        className="latest-play"
                        onClick={() =>
                          openPlayer(
                            story,
                            episode
                          )
                        }
                      >
                        ▶
                      </button>
                    </div>
                  )
                }
              )}
            </div>
          </section>
        </main>
      )}

      {/* =====================================================
         STORY DETAILS
      ===================================================== */}

      {page ===
        'story' &&
        selectedStory && (
          <main className="story-details-page">
            <button
              className="back-btn"
              onClick={
                closeStoryDetails
              }
            >
              ← Back to Stories
            </button>

            <div className="story-details-content">
              <div className="story-details-cover">
                <img
                  src={
                    selectedStory.cover
                  }
                  alt={
                    selectedStory.title
                  }
                />
              </div>

              <div className="story-details-info">
                <div className="eyebrow">
                  {
                    selectedStory.genre
                  }
                </div>

                <h1>
                  {
                    selectedStory.title
                  }
                </h1>

                <p className="story-description">
                  {
                    selectedStory.description
                  }
                </p>

                <div className="story-details-meta">
                  {
                    selectedStory
                      .episodes
                      ?.length ||
                    0
                  }{' '}
                  Episodes
                </div>

                <button
                  className="primary-btn"
                  onClick={() => {
                    const first =
                      selectedStory.episodes?.find(
                        (
                          episode
                        ) =>
                          episode.available !==
                          false &&
                          canAccessContent(
                            episode,
                            adsKeyFor(
                              'episode',
                              selectedStory.id,
                              episode.number
                            )
                          )
                      )

                    if (
                      first
                    ) {
                      openPlayer(
                        selectedStory,
                        first
                      )
                    } else {
                      alert(
                        'No playable episode available.'
                      )
                    }
                  }}
                >
                  ▶ Play Story
                </button>

                <button
                  className="secondary-btn details-library-btn"
                  onClick={() => {
                    const exists =
                      library.some(
                        (
                          item
                        ) =>
                          item.id ===
                          selectedStory.id
                      )

                    if (
                      exists
                    ) {
                      removeFromLibrary(
                        selectedStory.id
                      )
                    } else {
                      addToLibrary(
                        selectedStory
                      )
                    }
                  }}
                >
                  {library.some(
                    (
                      item
                    ) =>
                      item.id ===
                      selectedStory.id
                  )
                    ? '✓ In Library · Remove'
                    : '+ Add to My Library'}
                </button>

                <div className="details-episodes">
                  {selectedStory.episodes?.map(
                    (
                      episode
                    ) => {
                      const adsKey =
                        adsKeyFor(
                          'episode',
                          selectedStory.id,
                          episode.number
                        )

                      const accessible =
                        canAccessContent(
                          episode,
                          adsKey
                        )

                      return (
                        <button
                          key={
                            episode.number
                          }
                          onClick={() =>
                            openPlayer(
                              selectedStory,
                              episode
                            )
                          }
                        >
                          <span>
                            {String(
                              episode.number
                            ).padStart(
                              2,
                              '0'
                            )}
                          </span>

                          <div>
                            <strong>
                              {
                                episode.title
                              }
                            </strong>

                            <small>
                              {
                                getEpisodeAccessLabel(
                                  episode
                                )
                              }
                            </small>
                          </div>

                          <b>
                            {accessible
                              ? '▶'
                              : '🔒'}
                          </b>
                        </button>
                      )
                    }
                  )}
                </div>
              </div>
            </div>
          </main>
        )}

      {/* =====================================================
         BOOK DETAILS
      ===================================================== */}

      {page ===
        'book-details' &&
        selectedBook && (
          <main className="story-details-page">
            <button
              className="back-btn"
              onClick={() => {
                setSelectedBook(
                  null
                )

                setBooksModalOpen(
                  true
                )

                setPage(
                  preDetailsPage
                )
              }}
            >
              ← Back to Books
            </button>

            <div className="story-details-content">
              <div className="story-details-cover">
                <img
                  src={
                    selectedBook.cover
                  }
                  alt={
                    selectedBook.title
                  }
                />
              </div>

              <div className="story-details-info">
                <div className="eyebrow">
                  {
                    selectedBook.category
                  }
                </div>

                <h1>
                  {
                    selectedBook.title
                  }
                </h1>

                {selectedBook.description && (
                  <p className="story-description">
                    {
                      selectedBook.description
                    }
                  </p>
                )}

                {selectedBook.author && (
                  <p className="story-details-meta">
                    By{' '}
                    {
                      selectedBook.author
                    }
                  </p>
                )}

                <div className="story-details-meta">
                  {selectedBook.type?.toUpperCase()}{' '}
                  ·{' '}
                  {accessLabel(
                    selectedBook,
                    {
                      isAdmin,
                    }
                  )}
                </div>

                <button
                  className="primary-btn"
                  onClick={() =>
                    startReadingBook(
                      selectedBook
                    )
                  }
                >
                  📖Read
                </button>

                <button
                  className="secondary-btn"
                  onClick={() =>
                    startReadAloudForBook(
                      selectedBook
                    )
                  }
                >
                  🔊Read Aloud
                </button>

                <button
                  className="secondary-btn details-library-btn"
                  onClick={() =>
                    toggleBookLibrary(
                      selectedBook
                    )
                  }
                >
                  {bookLibrary.some(
                    (
                      item
                    ) =>
                      item.id ===
                      selectedBook.id
                  )
                    ? '✓ In Library · Remove'
                    : '+ Add to My Library'}
                </button>
              </div>
            </div>
          </main>
        )}

      {/* =====================================================
         VIDEO DETAILS
      ===================================================== */}

      {page ===
        'video-details' &&
        selectedVideo && (
          <main className="story-details-page">
            <button
              className="back-btn"
              onClick={() => {
                setSelectedVideo(
                  null
                )

                setVideoModalOpen(
                  true
                )

                setPage(
                  preDetailsPage
                )
              }}
            >
              ← Back to Videos
            </button>

            <div className="story-details-content">
              <div className="story-details-cover">
                <img
                  src={
                    selectedVideo.cover
                  }
                  alt={
                    selectedVideo.title
                  }
                />
              </div>

              <div className="story-details-info">
                <div className="eyebrow">
                  {
                    selectedVideo.category
                  }
                </div>

                <h1>
                  {
                    selectedVideo.title
                  }
                </h1>

                <div className="story-details-meta">
                  {
                    selectedVideo
                      .episodes
                      ?.length ||
                    0
                  }{' '}
                  Episode(s) ·{' '}
                  {accessLabel(
                    selectedVideo,
                    {
                      isAdmin,
                    }
                  )}
                </div>

                <button
                  className="primary-btn"
                  onClick={() => {
                    const first =
                      selectedVideo.episodes?.find(
                        (
                          episode
                        ) =>
                          episode.available !==
                          false &&
                          canAccessContent(
                            episode,
                            adsKeyFor(
                              'video-episode',
                              selectedVideo.id,
                              episode.number
                            )
                          )
                      )

                    if (
                      first
                    ) {
                      openPlayer(
                        selectedVideo,
                        first
                      )
                    } else {
                      alert(
                        'No playable episode available.'
                      )
                    }
                  }}
                >
                  ▶ Play
                </button>

                <div className="details-episodes">
                  {selectedVideo.episodes?.map(
                    (
                      episode
                    ) => {
                      const adsKey =
                        adsKeyFor(
                          'video-episode',
                          selectedVideo.id,
                          episode.number
                        )

                      const accessible =
                        canAccessContent(
                          episode,
                          adsKey
                        )

                      return (
                        <button
                          key={
                            episode.number
                          }
                          onClick={() =>
                            openPlayer(
                              selectedVideo,
                              episode
                            )
                          }
                        >
                          <span>
                            {String(
                              episode.number
                            ).padStart(
                              2,
                              '0'
                            )}
                          </span>

                          <div>
                            <strong>
                              {
                                episode.title
                              }
                            </strong>

                            <small>
                              {
                                getEpisodeAccessLabel(
                                  episode
                                )
                              }
                            </small>
                          </div>

                          <b>
                            {accessible
                              ? '▶'
                              : '🔒'}
                          </b>
                        </button>
                      )
                    }
                  )}
                </div>
              </div>
            </div>
          </main>
        )}

      {/* =====================================================
         LIBRARY
      ===================================================== */}

      {page ===
        'library' && (
          <main className="account-page">
            <div className="eyebrow">
              MY LIBRARY
            </div>

            <h1>
              Your Library
            </h1>

            {library.length ===
              0 ? (
              <div className="empty-state">
                <span>
                  📚
                </span>

                <h2>
                  Your library is empty
                </h2>

                <p>
                  Add stories to your library to find them here.
                </p>

                <button
                  className="primary-btn"
                  onClick={() =>
                    setPage(
                      'home'
                    )
                  }
                >
                  Explore Stories
                </button>
              </div>
            ) : (
              <div className="story-grid">
                {library.map(
                  (
                    story
                  ) => (
                    <article
                      key={
                        story.id
                      }
                      className="story-card"
                    >
                      <div
                        className="story-image"
                        onClick={() =>
                          openStoryDetails(
                            story
                          )
                        }
                      >
                        <img
                          src={
                            story.cover
                          }
                          alt={
                            story.title
                          }
                        />
                      </div>

                      <div className="story-info">
                        <small>
                          {
                            story.genre
                          }
                        </small>

                        <h3>
                          {
                            story.title
                          }
                        </h3>

                        <button
                          className="library-add"
                          onClick={() =>
                            removeFromLibrary(
                              story.id
                            )
                          }
                        >
                          Remove from Library
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </main>
        )}

      {/* =====================================================
         VIP
      ===================================================== */}

      {page === 'vip' && (
        <main className="account-page">
          <div className="eyebrow">
            VIP
          </div>

          <h1>
            {isAdmin
              ? '👑Admin VIP'
              : 'Purchased Stories'}
          </h1>

          {(() => {
            if (isAdmin) {
              return (
                <div className="vip-empty">
                  <div className="vip-icon">♛</div>
                  <h2>Full VIP Access</h2>
                  <p>Your admin account has unlimited VIP access.</p>
                  <button
                    className="primary-btn"
                    onClick={() => setPage('home')}
                  >
                    Explore Stories
                  </button>
                </div>
              )
            }

            const purchasedContent = [
              ...stories,
              ...books,
              ...videoStories,
            ].filter((item) => purchasedStoryIds.has(String(item.id)) || purchasedStoryIds.has(Number(item.id)))

            if (purchasedContent.length === 0) {
              return (
                <div className="vip-empty">
                  <div className="vip-icon">♛</div>
                  <h2>No purchased stories yet</h2>
                  <p>Stories you purchase will appear here.</p>
                  <button
                    className="primary-btn"
                    onClick={() => setPage('home')}
                  >
                    Explore Stories
                  </button>
                </div>
              )
            }

            return (
              <div className="story-grid">
                {purchasedContent.map((item) => (
                  <article key={item.id} className="story-card">
                    <div
                      className="story-image"
                      onClick={() => openStoryDetails(item)}
                    >
                      <img src={item.cover} alt={item.title} />
                      <div className="story-badge vip">
                        {resolveAccessType(item).includes('premium') ? 'Premium' : 'VIP'}
                      </div>
                    </div>

                    <div className="story-info">
                      <small>{item.genre || item.category || 'Story'}</small>
                      <h3>{item.title}</h3>
                      <button
                        className="library-add"
                        onClick={() => openStoryDetails(item)}
                      >
                        View Story
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          })()}
        </main>
      )}

      {/* =====================================================
         ACCOUNT
      ===================================================== */}

      {page ===
        'account' && (
          <main className="account-page">
            <div className="account-card">
              <div className="account-avatar">
                {isAdmin
                  ? '👑'
                  : '👤'}
              </div>

              <div>
                <div className="eyebrow">
                  ACCOUNT
                </div>

                <h1>
                  {isAdmin
                    ? 'Admin Account'
                    : 'Welcome Back'}
                </h1>

                <p>
                  {user?.email ||
                    user?.phone ||
                    'Your HJ GROUPS account'}
                </p>

                {isAdmin && (
                  <small>
                    👑 VIP Access · Administrator
                  </small>
                )}
              </div>

              <button
                className="secondary-btn"
                onClick={
                  handleLogout
                }
              >
                Logout
              </button>
            </div>
          </main>
        )}

      {/* =====================================================
         FOOTER
      ===================================================== */}

      <footer className="footer">
        <img
          src="/hj-groups-logo.png"
          alt="HJ GROUPS"
        />

        <p>
          © 2026 HJ GROUPS
        </p>
      </footer>

      {libraryMessage && (
        <div className="library-toast">
          {
            libraryMessage
          }
        </div>
      )}

      {/* =====================================================
         MINI PLAYER
      ===================================================== */}

      {nowPlaying &&
        !(
          nowPlaying.kind ===
            'episode'
            ? fullPlayer
            : readerOpen
        ) && (
          <div className="mini-player">
            <img
              src={
                nowPlaying.cover
              }
              alt=""
              className="mini-cover"
              onClick={
                expandNowPlaying
              }
            />

            <div
              className="mini-info"
              onClick={
                expandNowPlaying
              }
            >
              <small>
                {nowPlaying.kind ===
                  'readaloud'
                  ? 'READ ALOUD'
                  : 'NOW PLAYING'}
              </small>

              <strong>
                {
                  nowPlaying.title
                }
              </strong>

              <span>
                {
                  nowPlaying.subtitle
                }
              </span>
            </div>

            <button
              className="mini-control"
              onClick={
                nowPlaying.kind ===
                  'episode'
                  ? previousEpisode
                  : readerPrevious
              }
            >
              ⏮
            </button>

            <button
              className="mini-play"
              onClick={
                togglePlayback
              }
            >
              {(
                nowPlaying.kind ===
                  'episode'
                  ? isPlaying
                  : isReading
              )
                ? '❚❚'
                : '▶'}
            </button>

            <button
              className="mini-control"
              onClick={
                nowPlaying.kind ===
                  'episode'
                  ? nextEpisode
                  : readerNext
              }
            >
              ⏭
            </button>

            <div className="mini-progress">
              {nowPlaying.kind ===
                'episode' ? (
                <>
                  <input
                    type="range"
                    min="0"
                    max={
                      duration ||
                      0
                    }
                    value={
                      currentTime
                    }
                    step="0.1"
                    onChange={
                      changeProgress
                    }
                  />

                  <span>
                    {
                      formatTime(
                        currentTime
                      )
                    }{' '}
                    /{' '}
                    {
                      formatTime(
                        duration
                      )
                    }
                  </span>
                </>
              ) : (
                <>
                  <div className="reader-progress">
                    <div
                      className="reader-progress-bar"
                      style={{
                        width: `${readAloudProgress}%`,
                      }}
                    />
                  </div>

                  <span>
                    {Math.round(
                      readAloudProgress
                    )}
                    %
                  </span>
                </>
              )}
            </div>

            <button
              className="mini-expand"
              onClick={
                expandNowPlaying
              }
            >
              ⛶
            </button>

            <button
              className="mini-close"
              onClick={
                closeNowPlaying
              }
            >
              ✕
            </button>
          </div>
        )}

      {/* =====================================================
         FULL PLAYER
      ===================================================== */}

      {playerOpen &&
        currentStory &&
        currentEpisode &&
        fullPlayer && (
          <div className="player-overlay">
            <div className="full-player">
              <div className="player-top">
                <button
                  onClick={() =>
                    setFullPlayer(
                      false
                    )
                  }
                >
                  ↓ Minimize
                </button>

                <strong>
                  HJ GROUPS
                </strong>

                <button
                  onClick={
                    closePlayer
                  }
                >
                  ✕
                </button>
              </div>

              <div className="player-layout">
                <div className="player-main">
                  {currentEpisode.type ===
                    'video' ? (
                    <video
                      ref={
                        videoRef
                      }
                      className="main-video"
                      src={currentEpisode.telegram_message_id ? `http://localhost:3000/audio/message/${currentEpisode.telegram_message_id}` : (currentEpisode.src || undefined)}
                      controls
                      autoPlay
                      onLoadedMetadata={
                        handleLoadedMetadata
                      }
                      onTimeUpdate={
                        handleTimeUpdate
                      }
                      onEnded={
                        handleEnded
                      }
                    />
                  ) : (
                    <img
                      className="player-cover-large"
                      src={
                        currentStory.cover
                      }
                      alt=""
                    />
                  )}

                  <div className="eyebrow">
                    NOW PLAYING
                  </div>

                  <h1>
                    {
                      currentStory.title
                    }
                  </h1>

                  <p>
                    {
                      currentEpisode.title
                    }
                  </p>

                  {currentEpisode.type ===
                    'audio' && (
                      <>
                        <div className="progress">
                          <span>
                            {
                              formatTime(
                                currentTime
                              )
                            }
                          </span>

                          <input
                            type="range"
                            min="0"
                            max={
                              duration ||
                              0
                            }
                            value={
                              currentTime
                            }
                            step="0.1"
                            onChange={
                              changeProgress
                            }
                          />

                          <span>
                            {
                              formatTime(
                                duration
                              )
                            }
                          </span>
                        </div>

                        <div className="main-controls">
                          <button
                            onClick={() =>
                              seek(-15)
                            }
                          >
                            ↶
                            <small>
                              15
                            </small>
                          </button>

                          <button
                            onClick={
                              previousEpisode
                            }
                          >
                            ⏮
                          </button>

                          <button
                            className="big-play"
                            onClick={
                              togglePlay
                            }
                          >
                            {isPlaying
                              ? '❚❚'
                              : '▶'}
                          </button>

                          <button
                            onClick={
                              nextEpisode
                            }
                          >
                            ⏭
                          </button>

                          <button
                            onClick={() =>
                              seek(30)
                            }
                          >
                            <small>
                              30
                            </small>
                            ↷
                          </button>
                        </div>

                        <div className="player-options">
                          <select
                            value={
                              speed
                            }
                            onChange={(
                              event
                            ) =>
                              changeSpeed(
                                Number(
                                  event
                                    .target
                                    .value
                                )
                              )
                            }
                          >
                            <option value="0.5">
                              0.5x
                            </option>
                            <option value="0.75">
                              0.75x
                            </option>
                            <option value="1">
                              1x
                            </option>
                            <option value="1.25">
                              1.25x
                            </option>
                            <option value="1.5">
                              1.5x
                            </option>
                            <option value="2">
                              2x
                            </option>
                          </select>

                          <select
                            value={
                              sleepMinutes
                            }
                            onChange={(
                              event
                            ) =>
                              startSleepTimer(
                                Number(
                                  event
                                    .target
                                    .value
                                )
                              )
                            }
                          >
                            <option value="0">
                              😴Sleep Off
                            </option>
                            <option value="5">
                              5 min
                            </option>
                            <option value="10">
                              10 min
                            </option>
                            <option value="15">
                              15 min
                            </option>
                            <option value="30">
                              30 min
                            </option>
                            <option value="45">
                              45 min
                            </option>
                            <option value="60">
                              60 min
                            </option>
                          </select>
                        </div>

                        <div className="volume">
                          <span>
                            🔊
                          </span>

                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={
                              volume
                            }
                            onChange={
                              changeVolume
                            }
                          />
                        </div>
                      </>
                    )}
                </div>

                <aside className="episode-sidebar">
                  <div className="eyebrow">
                    {
                      currentStory.genre ||
                      currentStory.category
                    }
                  </div>

                  <h2>
                    Episodes
                  </h2>

                  <p>
                    Select an episode
                  </p>

                  <div className="episode-list">
                    {[
                      ...(
                        currentStory.episodes ||
                        []
                      ),
                    ]
                      .slice()
                      .reverse()
                      .map(
                        (
                          episode
                        ) => {
                          const adsKey =
                            adsKeyFor(
                              episode.type ===
                                'video'
                                ? 'video-episode'
                                : 'episode',
                              currentStory.id,
                              episode.number
                            )

                          const accessible =
                            canAccessContent(
                              episode,
                              adsKey
                            )

                          return (
                            <button
                              key={
                                episode.number
                              }
                              className={
                                currentEpisode.number ===
                                  episode.number
                                  ? 'selected'
                                  : ''
                              }
                              onClick={() =>
                                selectEpisode(
                                  episode
                                )
                              }
                            >
                              <span>
                                {String(
                                  episode.number
                                ).padStart(
                                  2,
                                  '0'
                                )}
                              </span>

                              <div>
                                <strong>
                                  {
                                    episode.title
                                  }
                                </strong>

                                <small>
                                  {
                                    getEpisodeAccessLabel(
                                      episode
                                    )
                                  }
                                </small>
                              </div>

                              <b>
                                {accessible
                                  ? '▶'
                                  : '🔒'}
                              </b>
                            </button>
                          )
                        }
                      )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        )}

      {/* =====================================================
         BOOK MODAL
      ===================================================== */}

      {booksModalOpen && (
        <div className="library-overlay">
          <div className="library-window">
            <div className="library-header">
              <strong>
                📚Books
              </strong>

              <button
                onClick={() =>
                  setBooksModalOpen(
                    false
                  )
                }
              >
                ✕
              </button>
            </div>

            <div className="library-categories">
              {bookCategories.map(
                (cat) => (
                  <button
                    key={cat}
                    className={
                      bookCategory ===
                        cat
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setBookCategory(
                        cat
                      )
                    }
                  >
                    {cat}
                  </button>
                )
              )}
            </div>

            <div className="library-grid">
              {filteredBooks.length ? (
                filteredBooks.map(
                  (
                    book
                  ) => (
                    <button
                      key={
                        book.id
                      }
                      className="library-card"
                      onClick={() =>
                        openBook(
                          book
                        )
                      }
                    >
                      <span className="library-card-type">
                        {accessLabel(
                          book,
                          {
                            isAdmin,
                          }
                        ).toUpperCase()}
                      </span>

                      <img
                        src={
                          book.cover
                        }
                        alt={
                          book.title
                        }
                      />

                      <strong>
                        {
                          book.title
                        }
                      </strong>

                      <small>
                        {
                          book.category
                        }
                      </small>
                    </button>
                  )
                )
              ) : (
                <p className="library-empty">
                  No books in this category yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
         VIDEO MODAL
      ===================================================== */}

      {videoModalOpen && (
        <div className="library-overlay">
          <div className="library-window">
            <div className="library-header">
              <strong>
                🎬Video Stories
              </strong>

              <button
                onClick={() =>
                  setVideoModalOpen(
                    false
                  )
                }
              >
                ✕
              </button>
            </div>

            <div className="library-categories">
              {videoCategories.map(
                (cat) => (
                  <button
                    key={cat}
                    className={
                      videoCategory ===
                        cat
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setVideoCategory(
                        cat
                      )
                    }
                  >
                    {cat}
                  </button>
                )
              )}
            </div>

            <div className="library-grid">
              {filteredVideos.length ? (
                filteredVideos.map(
                  (
                    story
                  ) => (
                    <button
                      key={
                        story.id
                      }
                      className="library-card"
                      onClick={() => {
                        setPreDetailsPage(
                          page
                        )

                        setVideoModalOpen(
                          false
                        )

                        setSelectedVideo(
                          story
                        )

                        setPage(
                          'video-details'
                        )
                      }}
                    >
                      <span className="library-card-type">
                        {accessLabel(
                          story,
                          {
                            isAdmin,
                          }
                        ).toUpperCase()}
                      </span>

                      <img
                        src={
                          story.cover
                        }
                        alt={
                          story.title
                        }
                      />

                      <strong>
                        {
                          story.title
                        }
                      </strong>

                      <small>
                        {
                          story.category
                        }
                      </small>
                    </button>
                  )
                )
              ) : (
                <p className="library-empty">
                  No videos in this category yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
         LOGIN
      ===================================================== */}

      {loginOpen && (
        <div className="login-overlay">
          <Auth
            onBack={() =>
              setLoginOpen(
                false
              )
            }
          />
        </div>
      )}

      {/* =====================================================
         ADS
      ===================================================== */}

      {adModalOpen && (
        <AdUnlockModal
          onClose={
            handleAdCancel
          }
          onUnlocked={
            handleAdUnlocked
          }
        />
      )}

      {/* =====================================================
         ADMIN
      ===================================================== */}

      {adminOpen && (
        <div className="login-overlay">
          <AdminPanel
            stories={stories}
            books={books}
            videoStories={
              videoStories
            }
            onClose={() =>
              setAdminOpen(
                false
              )
            }
            onAddStory={
              addStory
            }
            onUpdateStory={
              updateStory
            }
            onAddEpisode={
              addEpisodeToStory
            }
            onUpdateEpisode={
              updateEpisode
            }
            onDeleteEpisode={
              deleteEpisode
            }
            onDeleteStory={
              deleteAdminStory
            }
            onAddBook={
              addBook
            }
            onUpdateBook={
              updateBook
            }
            onDeleteBook={
              deleteAdminBook
            }
            onAddVideo={
              addVideoStory
            }
            onUpdateVideo={
              updateVideoStory
            }
            onAddVideoEpisode={
              addVideoEpisode
            }
            onUpdateVideoEpisode={
              updateVideoEpisode
            }
            onDeleteVideoEpisode={
              deleteVideoEpisode
            }
            onDeleteVideo={
              deleteAdminVideo
            }
            adminStoryIds={
              adminStories.map(
                (story) =>
                  story.id
              )
            }
            adminBookIds={
              adminBooks.map(
                (book) =>
                  book.id
              )
            }
            adminVideoIds={
              adminVideos.map(
                (video) =>
                  video.id
              )
            }
          />
        </div>
      )}

      {/* =====================================================
         FULL PAGE BOOK READER
      ===================================================== */}

      {readerBook && (
        <div
          ref={
            readerContainerRef
          }
          className={`reader-overlay ${readerOpen
            ? ''
            : 'reader-minimized'
            }`}
        >
          <div className="reader-window">
            {/* HEADER */}

            <div className="reader-header">
              <button
                onClick={
                  closeReaderView
                }
              >
                ←{' '}
                {isReading
                  ? 'Minimize'
                  : 'Close'}
              </button>

              <strong>
                {
                  readerBook.title
                }
              </strong>

              <div className="reader-tools">
                <button
                  onClick={() =>
                    setChapterPanelOpen(
                      (value) =>
                        !value
                    )
                  }
                >
                  ☰ Chapters
                </button>

                <button
                  onClick={
                    toggleReaderFullscreen
                  }
                >
                  {readerFullscreen
                    ? '⤡ Exit Fullscreen'
                    : '⛶ Fullscreen'}
                </button>

                <button
                  onClick={
                    readAloud
                  }
                >
                  {isReading
                    ? '⏹ Stop'
                    : '🔊Read Aloud'}
                </button>
              </div>
            </div>

            {/*
              CHAPTERS (left) + READER BODY (center)
              rendered as one row so chapters sit
              persistently on the left on desktop,
              while still collapsing to an overlay
              drawer on narrow/mobile screens via CSS.
            */}

            <div className="reader-middle">

              {/* CHAPTER PANEL */}

              {chapterPanelOpen && (
                <div className="reader-chapter-panel">
                  <div className="reader-chapter-header">
                    <strong>
                      {readerType ===
                        'pdf'
                        ? 'PDF Bookmarks / Outline'
                        : 'EPUB Chapters / TOC'}
                    </strong>

                    <button
                      onClick={() =>
                        setChapterPanelOpen(
                          false
                        )
                      }
                    >
                      ✕
                    </button>
                  </div>

                  <div className="reader-chapter-list">
                    {readerType ===
                      'pdf' ? (
                      pdfOutline.length ? (
                        pdfOutline.map(
                          (
                            item
                          ) => (
                            <button
                              key={
                                item.id
                              }
                              className="reader-chapter-item"
                              style={{
                                paddingLeft:
                                  `${12 + item.level * 18}px`,
                              }}
                              onClick={() =>
                                jumpToPdfChapter(
                                  item
                                )
                              }
                            >
                              <span>
                                {item.page
                                  ? `Page ${item.page}`
                                  : '↳'}
                              </span>

                              <strong>
                                {
                                  item.title
                                }
                              </strong>
                            </button>
                          )
                        )
                      ) : (
                        <div className="reader-chapter-empty">
                          This PDF does not contain a bookmark/outline.
                        </div>
                      )
                    ) : epubToc.length ? (
                      epubToc.map(
                        (
                          item,
                          index
                        ) => (
                          <button
                            key={`${item.href}-${index}`}
                            className={`reader-chapter-item ${item.href &&
                              epubCurrentHref &&
                              epubCurrentHref.includes(
                                item.href.split('#')[0]
                              )
                              ? 'active'
                              : ''
                              }`}
                            style={{
                              paddingLeft:
                                `${12 + item.level * 18}px`,
                            }}
                            onClick={() =>
                              jumpToEpubChapter(
                                item
                              )
                            }
                          >
                            <strong>
                              {
                                item.label
                              }
                            </strong>
                          </button>
                        )
                      )
                    ) : (
                      <div className="reader-chapter-empty">
                        This EPUB does not contain a navigation table of contents.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* READER BODY */}

              <div
                className="reader-body reader-body-full"
                ref={
                  readerBodyRef
                }
              >
                {readerError && (
                  <div className="reader-error">
                    <strong>
                      Reader Error
                    </strong>

                    <p>
                      {
                        readerError
                      }
                    </p>

                    <button
                      className="secondary-btn"
                      onClick={() =>
                        openReaderForBook(
                          readerBook
                        )
                      }
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {!readerError &&
                  readerLoading && (
                    <div className="reader-loading">
                      <div className="reader-loading-spinner" />

                      <span>
                        Loading{' '}
                        {readerType ===
                          'pdf'
                          ? 'PDF'
                          : 'EPUB'}
                        …
                      </span>
                    </div>
                  )}

                {!readerError &&
                  !readerLoading &&
                  readerType ===
                  'pdf' &&
                  readerResolvedFile && (
                    <Document
                      file={
                        readerResolvedFile
                      }
                      options={{
                        cMapUrl: `https://unpkg.com/pdfjs-dist@5.4.296/cmaps/`,
                        cMapPacked: true,
                        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/`,
                      }}
                      loading={
                        <div className="reader-loading">
                          Loading PDF…
                        </div>
                      }
                      error={
                        <div className="reader-error">
                          {readerError || "Couldn't render this PDF."}
                        </div>
                      }
                      onLoadSuccess={
                        handlePdfLoadSuccess
                      }
                      onLoadError={(
                        error
                      ) => {
                        console.error(
                          'PDF render error:',
                          error
                        )

                        setReaderError(
                          error?.message ||
                          'Failed to render PDF.'
                        )

                        setReaderLoading(
                          false
                        )
                      }}
                    >
                      <Page
                        key={`pdf-${pdfPage}-${pdfScale}`}
                        pageNumber={
                          pdfPage
                        }
                        scale={
                          pdfScale
                        }
                        renderTextLayer
                        renderAnnotationLayer
                        onRenderSuccess={
                          handlePageRendered
                        }
                        loading={
                          <div className="reader-loading">
                            Loading page…
                          </div>
                        }
                      />
                    </Document>
                  )}

                {!readerError &&
                  readerType === 'epub' && (
                    <div
                      ref={epubContainerRef}
                      className="epub-reader epub-reader-full"
                    />
                  )}
              </div>

            </div>
            {/* end .reader-middle */}

            {/* BOTTOM READER CONTROLS */}

            <div className="reader-bottom">
              <div className="reader-navigation">
                <button
                  disabled={
                    readerType ===
                      'pdf'
                      ? pdfPage <=
                      1
                      : !epubReady
                  }
                  onClick={
                    readerPrevious
                  }
                >
                  ← Previous
                </button>

                {readerType ===
                  'pdf' ? (
                  <div className="reader-page-jump">
                    <label>
                      Page
                    </label>

                    <input
                      type="number"
                      min="1"
                      max={
                        pdfPages || 1
                      }
                      value={
                        pdfInputPage !== '' ? pdfInputPage : pdfPage
                      }
                      className="reader-page-input"
                      onChange={(
                        event
                      ) => {
                        setPdfInputPage(event.target.value)
                      }}
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                          'Enter'
                        ) {
                          const val = parseInt(pdfInputPage, 10)
                          if (Number.isFinite(val)) {
                            setPdfPage(
                              clamp(
                                val,
                                1,
                                pdfPages || 1
                              )
                            )
                          }
                          setPdfInputPage('')
                        }
                      }}
                    />

                    <span>
                      {' / '}
                      {pdfPages ||
                        '—'}
                    </span>

                    <button
                      type="button"
                      className="reader-page-go"
                      onClick={() => {
                        const val = parseInt(pdfInputPage, 10)
                        if (Number.isFinite(val)) {
                          setPdfPage(
                            clamp(
                              val,
                              1,
                              pdfPages || 1
                            )
                          )
                        }
                        setPdfInputPage('')
                      }}
                      disabled={
                        !pdfPages
                      }
                    >
                      Go
                    </button>
                  </div>
                ) : (
                  <div className="reader-page-jump">
                    <label>
                      Page
                    </label>

                    <input
                      type="number"
                      min="1"
                      max={
                        epubPages || 1
                      }
                      value={
                        epubInputPage !== '' ? epubInputPage : epubPage
                      }
                      className="reader-page-input"
                      onChange={(
                        event
                      ) => {
                        setEpubInputPage(event.target.value)
                      }}
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                          'Enter'
                        ) {
                          const val = parseInt(epubInputPage, 10)
                          if (Number.isFinite(val)) {
                            jumpEpubByPage(val)
                          }
                          setEpubInputPage('')
                        }
                      }}
                    />

                    <span>
                      {' / '}
                      {epubPages ||
                        (epubLocationsReady
                          ? '—'
                          : 'Preparing…')}
                    </span>

                    <button
                      type="button"
                      className="reader-page-go"
                      onClick={() => {
                        const val = parseInt(epubInputPage, 10)
                        if (Number.isFinite(val)) {
                          jumpEpubByPage(val)
                        }
                        setEpubInputPage('')
                      }}
                      disabled={
                        !epubReady ||
                        !epubPages
                      }
                    >
                      Go
                    </button>
                  </div>
                )}

                <button
                  disabled={
                    readerType ===
                      'pdf'
                      ? !pdfPages ||
                      pdfPage >=
                      pdfPages
                      : !epubReady
                  }
                  onClick={
                    readerNext
                  }
                >
                  Next →
                </button>
              </div>

              <div className="reader-zoom">
                <button
                  onClick={
                    zoomOut
                  }
                >
                  −
                </button>

                <span>
                  {readerType ===
                    'pdf'
                    ? `${Math.round(
                      pdfScale *
                      100
                    )}%`
                    : `${epubFontScale}%`}
                </span>

                <button
                  onClick={
                    zoomIn
                  }
                >
                  +
                </button>

                <button
                  onClick={
                    zoomReset
                  }
                >
                  Reset
                </button>
              </div>

              <div className="reader-player">
                <button
                  onClick={
                    readerPrevious
                  }
                >
                  ⏮
                </button>

                <button
                  className="reader-play-button"
                  onClick={
                    readAloud
                  }
                >
                  {isReading
                    ? '❚❚'
                    : '▶'}
                </button>

                <button
                  onClick={
                    readerNext
                  }
                >
                  ⏭
                </button>

                <div className="reader-progress">
                  <div
                    className="reader-progress-bar"
                    style={{
                      width: `${readAloudProgress}%`,
                    }}
                  />
                </div>

                <span className="reader-progress-label">
                  {Math.round(
                    readAloudProgress
                  )}
                  %
                </span>

                <span>
                  🔊
                </span>

                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={
                    volume
                  }
                  onChange={
                    changeVolume
                  }
                />

                <select
                  value={
                    speed
                  }
                  onChange={(
                    event
                  ) =>
                    changeSpeed(
                      Number(
                        event
                          .target
                          .value
                      )
                    )
                  }
                >
                  <option value="0.5">
                    0.5x
                  </option>

                  <option value="0.75">
                    0.75x
                  </option>

                  <option value="1">
                    1x
                  </option>

                  <option value="1.25">
                    1.25x
                  </option>

                  <option value="1.5">
                    1.5x
                  </option>

                  <option value="2">
                    2x
                  </option>
                </select>

                <select
                  value={
                    sleepMinutes
                  }
                  onChange={(
                    event
                  ) =>
                    startSleepTimer(
                      Number(
                        event
                          .target
                          .value
                      )
                    )
                  }
                >
                  <option value="0">
                    😴Sleep Off
                  </option>

                  <option value="5">
                    5 min
                  </option>

                  <option value="10">
                    10 min
                  </option>

                  <option value="15">
                    15 min
                  </option>

                  <option value="30">
                    30 min
                  </option>

                  <option value="60">
                    60 min
                  </option>
                </select>
              </div>

              {readAloudLabel && (
                <div className="reader-read-status">
                  {readAloudLabel}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
         BOTTOM NAV
      ===================================================== */}

      <nav
        className={`bottom-nav ${isAdmin
          ? 'admin-bottom-nav'
          : ''
          }`}
      >
        <button
          className={
            page ===
              'home'
              ? 'active'
              : ''
          }
          onClick={() => {
            setPage('home')
            setSelectedStory(
              null
            )

            window.scrollTo({
              top: 0,
              behavior:
                'smooth',
            })
          }}
        >
          <span>
            ⌂
          </span>
          <small>
            Home
          </small>
        </button>

        <button
          className={
            page ===
              'library'
              ? 'active'
              : ''
          }
          onClick={() =>
            setPage(
              'library'
            )
          }
        >
          <span>
            ♡
          </span>
          <small>
            My Library
          </small>
        </button>

        <button
          className={
            page === 'vip'
              ? 'active'
              : ''
          }
          onClick={() =>
            setPage('vip')
          }
        >
          <span>
            ♛
          </span>
          <small>
            VIP
          </small>
        </button>

        <button
          className={
            page ===
              'account'
              ? 'active'
              : ''
          }
          onClick={() => {
            if (loggedIn) {
              setPage(
                'account'
              )
            } else {
              setLoginOpen(
                true
              )
            }
          }}
        >
          <span>
            👤
          </span>
          <small>
            {loggedIn
              ? 'Account'
              : 'Login'}
          </small>
        </button>

        {isAdmin && (
          <button
            className={
              adminOpen
                ? 'active'
                : ''
            }
            onClick={() =>
              setAdminOpen(
                true
              )
            }
          >
            <span>
              ⚙
            </span>
            <small>
              Admin
            </small>
          </button>
        )}
      </nav>
    </div>
  )
}

/* =========================================================
   TIME
========================================================= */

function formatTime(seconds) {
  if (
    !Number.isFinite(
      seconds
    )
  ) {
    return '00:00'
  }

  const min =
    Math.floor(
      seconds / 60
    )

  const sec =
    Math.floor(
      seconds % 60
    )

  return `${String(
    min
  ).padStart(
    2,
    '0'
  )}:${String(sec).padStart(
    2,
    '0'
  )}`
}

export default App
