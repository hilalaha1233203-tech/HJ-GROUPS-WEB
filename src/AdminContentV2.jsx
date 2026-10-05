import { getFreshEpisodeImportState, getFreshVideoEpisodeImportState, buildTelegramMediaTitle, sortTelegramMessagesOldestFirst } from './lib/telegramImport.js'
import { useMemo, useState } from 'react'
import FileUploadField from './components/FileUploadField'
import { resolveAccessType } from './lib/accessControl'
import { normalizeContentStatus } from './lib/contentStatus.js'
import { normalizeGenreSelection, serializeGenreSelection } from './lib/genreSelection.js'
import { STREAMING_SERVER_URL } from './lib/streamingUrl'
import { supabase } from './supabase'

const GENRES = ['Fantasy','Action','Adventure','Romance','Mystery','Thriller','Sci-Fi','Horror','Comedy','Drama','Historical','Mythology','Crime','Supernatural','System','Isekai','Cultivation']
const BOOK_GENRES = ['Tamil Literature','Fiction','Fantasy','Action','Adventure','Romance','Mystery','Thriller','Sci-Fi','Horror','Comedy','Drama','Historical','Mythology','Crime','Supernatural','Self Help','Biography','Education','Children','Poetry','Other']
const VIDEO_GENRES = ['Action','Adventure','Drama','Romance','Comedy','Thriller','Mystery','Crime','Horror','Sci-Fi','Fantasy','Historical','Documentary','Short Film','Music','Kids','Family','Animation','Educational','Other']
const LANGUAGES = ['Tamil','English','Hindi','Malayalam','Telugu','Kannada','Bengali','Marathi','Gujarati','Punjabi','Urdu','Odia','Assamese','Sanskrit','Other']
const ACCESS = ['free','vip','premium','ads']

function Access({ value, onChange }) {
  const values = Array.isArray(value) ? value : (value ? [value] : ['free'])
  const toggle = (v) => {
    const next = values.includes(v) ? values.filter(x => x !== v) : [...values, v]
    onChange(next.length ? next : ['free'])
  }
  return <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{ACCESS.map(v =>
    <label key={v} style={{display:'inline-flex',gap:5,alignItems:'center',fontSize:13}}>
      <input type="checkbox" checked={values.includes(v)} onChange={() => toggle(v)} /> {v.toUpperCase()}
    </label>
  )}</div>
}

function CategoryCards({ value, onChange }) {
  return <div className="admin-v2-category-grid">{[
    ['audio','🎧 Audio'],['books','📚 Books'],['videos','🎬 Videos']
  ].map(([id,label]) => <button key={id} type="button" className={'admin-v2-card '+(value===id?'active':'')} onClick={() => onChange(id)}>{label}</button>)}</div>
}

function ActionCards({ items, value, onChange, className = '' }) {
  return <div className={'admin-v2-action-grid '+className}>{items.map(([id,label]) =>
    <button key={id} type="button" className={'admin-v2-card '+(value===id?'active':'')} onClick={() => onChange(id)}>{label}</button>
  )}</div>
}

function ListPicker({ rows, selectedId, onSelect, search, onSearch, page, totalPages, onPage, label }) {
  return <div className="admin-v2-picker">
    <input aria-label={label+' search'} placeholder={'Search '+label+'…'} value={search} onChange={e=>onSearch(e.target.value)} />
    <div className="admin-v2-list">
      {rows.map(row => <button type="button" key={row.id} className={'admin-v2-list-row '+(String(selectedId)===String(row.manageKey)?'active':'')} onClick={()=>onSelect(row.id)}>
        <span><strong>{row.title || row.name || 'Untitled'}</strong><small>{row.category || row.language || ''}</small></span><span>›</span>
      </button>)}
      {!rows.length && <div className="admin-v2-empty">No matching {label.toLowerCase()} found.</div>}
    </div>
    {totalPages > 1 && <div className="admin-v2-pagination">
      <button type="button" disabled={page<=1} onClick={()=>onPage(page-1)}>‹ Previous</button>
      <span>{page} / {totalPages}</span>
      <button type="button" disabled={page>=totalPages} onClick={()=>onPage(page+1)}>Next ›</button>
    </div>}
  </div>
}

function TelegramImport({ category, stories, books, videoStories, onAddEpisode, onUpdateBook, onAddVideoEpisode, toast }) {
  const [source, setSource] = useState('')
  const [parentId, setParentId] = useState('')
  const [messages, setMessages] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [nextOffsetId, setNextOffsetId] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const sourceType = category === 'audio' ? 'audio' : category === 'videos' ? 'video' : 'document'
  const parents = category === 'audio' ? stories : category === 'videos' ? videoStories : books

  const scan = async ({ append = false } = {}) => {
    if (append ? loadingOlder : loading) return
    append ? setLoadingOlder(true) : setLoading(true)
    if (!append) setProgress(null)
    try {
      const { data: { session } = {} } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Admin session is unavailable.')

      const params = new URLSearchParams({ type: sourceType, limit: '100' })
      if (append && nextOffsetId) params.set('offset_id', String(nextOffsetId))
      const res = await fetch(STREAMING_SERVER_URL + '/telegram/messages?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + session.access_token },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Telegram scan failed (' + res.status + ').')

      const data = await res.json()
      const scanned = Array.isArray(data)
        ? data.filter((m) => category !== 'books' || /\.(pdf|epub)$/i.test(String(m.fileName || '')))
        : []

      setMessages((current) => append ? [...current, ...scanned] : scanned)
      setSelected((current) => append ? current : [])
      const next = Number(res.headers.get('X-HJ-Telegram-Next-Offset') || 0) || null
      const more = String(res.headers.get('X-HJ-Telegram-Has-More') || '').toLowerCase() === 'true'
      setNextOffsetId(next)
      setHasMore(more)
      toast((append ? 'Loaded ' : 'Found ') + scanned.length + ' Telegram ' + (category === 'books' ? 'books' : category) + '.')
    } catch (e) {
      toast(e.message || 'Telegram scan failed.', 'error')
    } finally {
      append ? setLoadingOlder(false) : setLoading(false)
    }
  }

  const doImport = async () => {
    if (!parentId) return toast('Select the target ' + (category === 'books' ? 'book' : 'story') + '.', 'error')
    if (!selected.length) return toast('Select at least one Telegram item.', 'error')

    const parent = parents.find((x) => String(x.id) === String(parentId))
    if (!parent) return toast('Target not found.', 'error')

    const ordered = sortTelegramMessagesOldestFirst(
      selected
        .map((id) => messages.find((m) => String(m.messageId) === String(id)))
        .filter(Boolean)
    )

    if (!ordered.length) return toast('Selected Telegram items are no longer available in the scan.', 'error')

    const messageIds = ordered.map((m) => Number(m.messageId))
    setImporting(true)
    setProgress({ processed: 0, total: ordered.length, imported: 0, failed: 0, duplicates: 0 })

    let imported = 0
    let failed = 0
    let duplicates = 0

    try {
      if (category === 'books') {
        const existing = new Set(
          books.flatMap((book) => {
            const ids = Number(book.telegram_message_id) > 0 ? [Number(book.telegram_message_id)] : []
            for (const volume of Array.isArray(book.volumes) ? book.volumes : []) {
              const match = String(volume?.filePath || '').match(/^tg-document:(\d+)$/)
              if (match) ids.push(Number(match[1]))
            }
            return ids
          })
        )
        let target = books.find((book) => String(book.id) === String(parentId))
        if (!target) throw new Error('Target book was not found.')

        const volumes = Array.isArray(target.volumes) ? target.volumes : []
        let nextVolume = volumes.reduce((max, volume) => Math.max(max, Number(volume.number) || 0), 0)

        for (const [index, message] of ordered.entries()) {
          const messageId = Number(message.messageId)
          if (!Number.isInteger(messageId) || messageId <= 0) {
            failed++
            setProgress({ processed: index + 1, total: ordered.length, imported, failed, duplicates })
            continue
          }

          if (existing.has(messageId)) {
            duplicates++
            setProgress({ processed: index + 1, total: ordered.length, imported, failed, duplicates })
            continue
          }

          nextVolume += 1
          const title = buildTelegramMediaTitle(message, nextVolume, 'Volume')
          try {
            await onUpdateBook(target.id, {
              ...target,
              volumes: [
                ...volumes,
                {
                  number: nextVolume,
                  title,
                  file: STREAMING_SERVER_URL + '/document/message/' + encodeURIComponent(messageId),
                  filePath: 'tg-document:' + messageId,
                  type: /\.epub$/i.test(String(message.fileName || '')) ? 'epub' : 'pdf',
                },
              ],
            })
            volumes.push({
              number: nextVolume,
              title,
              file: STREAMING_SERVER_URL + '/document/message/' + encodeURIComponent(messageId),
              filePath: 'tg-document:' + messageId,
              type: /\.epub$/i.test(String(message.fileName || '')) ? 'epub' : 'pdf',
            })
            existing.add(messageId)
            imported++
          } catch (e) {
            nextVolume -= 1
            failed++
            console.error('Telegram book volume import failed', e)
          }
          setProgress({ processed: index + 1, total: ordered.length, imported, failed, duplicates })
        }
      } else {
        const state = category === 'audio'
          ? await getFreshEpisodeImportState(parent.id, messageIds)
          : await getFreshVideoEpisodeImportState(parent.id, messageIds)

        let nextEpisode = Number(state.maxNumber) || 0
        const existingMessageIds = new Set(state.existingMessageIds)

        for (const [index, message] of ordered.entries()) {
          const messageId = Number(message.messageId)
          if (!Number.isInteger(messageId) || messageId <= 0) {
            failed++
            setProgress({ processed: index + 1, total: ordered.length, imported, failed, duplicates })
            continue
          }

          if (existingMessageIds.has(messageId)) {
            duplicates++
            setProgress({ processed: index + 1, total: ordered.length, imported, failed, duplicates })
            continue
          }

          const finalNumber = nextEpisode + 1
          const title = buildTelegramMediaTitle(message, finalNumber, 'Episode')
          try {
            const result = category === 'audio'
              ? await onAddEpisode(parent.id, {
                  number: finalNumber,
                  title,
                  type: 'audio',
                  src: '',
                  telegram_message_id: messageId,
                  available: true,
                  accessType: ['free'],
                })
              : await onAddVideoEpisode(parent.id, {
                  number: finalNumber,
                  title,
                  type: 'video',
                  src: '',
                  telegram_message_id: messageId,
                  available: true,
                  accessType: ['free'],
                })

            if (result?.status === 'duplicate') {
              duplicates++
            } else {
              nextEpisode = finalNumber
              existingMessageIds.add(messageId)
              imported++
            }
          } catch (e) {
            failed++
            console.error('Telegram media import failed', e)
          }

          setProgress({ processed: index + 1, total: ordered.length, imported, failed, duplicates })
        }
      }

      setSelected([])
      toast(
        imported + ' imported' +
        (duplicates ? ', ' + duplicates + ' duplicates skipped' : '') +
        (failed ? ', ' + failed + ' failed.' : '.'),
        failed ? 'error' : 'success'
      )
    } catch (e) {
      console.error('Telegram bulk import failed', e)
      toast(e.message || 'Telegram import failed.', 'error')
    } finally {
      setImporting(false)
    }
  }

  return <section className="admin-section">
    <h3>📲 Bulk Telegram Import · {category === 'audio' ? 'Audio' : category === 'books' ? 'Books' : 'Videos'}</h3>
    <p className="admin-v2-hint">Shared importer UI with fresh database numbering, duplicate protection, oldest-first ordering and paginated Telegram scanning.</p>

    {category !== 'books'
      ? <label>Target Story<select value={parentId} onChange={e => setParentId(e.target.value)}><option value="">Select Story</option>{parents.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
      : <label>Target Book<select value={parentId} onChange={e => setParentId(e.target.value)}><option value="">Select Book</option>{parents.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}

    <input placeholder="Telegram source/channel (server configured)" value={source} onChange={e => setSource(e.target.value)} />

    <div className="admin-v2-import-toolbar">
      <button type="button" className="admin-submit" onClick={() => scan()} disabled={loading || importing}>{loading ? '🔄 Scanning…' : '🔄 Scan Telegram'}</button>
      {hasMore && <button type="button" className="admin-submit" onClick={() => scan({ append: true })} disabled={loadingOlder || importing}>{loadingOlder ? '⏳ Loading older…' : '⬇️ Load Older'}</button>}
    </div>

    {messages.length > 0 && <><div className="admin-v2-import-head"><strong>{selected.length} selected / {messages.length}</strong><button type="button" onClick={() => setSelected(selected.length === messages.length ? [] : messages.map(m => m.messageId))}>{selected.length === messages.length ? 'Clear All' : 'Select All'}</button></div>
      <div className="admin-v2-import-list">{messages.map(m => <label key={m.messageId} className="admin-v2-import-row"><input type="checkbox" checked={selected.includes(m.messageId)} onChange={() => setSelected(s => s.includes(m.messageId) ? s.filter(x => String(x) !== String(m.messageId)) : [...s, m.messageId])}/><span>{buildTelegramMediaTitle(m, '', category === 'books' ? 'Book' : 'Episode')}<small>ID {m.messageId}</small></span></label>)}</div>
      <button type="button" className="admin-submit" onClick={doImport} disabled={importing}>{importing ? '⬆️ Importing…' : '⬆️ Import Selected'}</button>
    </>}

    {nextOffsetId && !hasMore && messages.length > 0 && <div className="admin-v2-progress">Telegram scan reached the available history for this media type.</div>}
    {progress && <div className="admin-v2-progress">Processed {progress.processed}/{progress.total} · Imported {progress.imported} · Duplicates {progress.duplicates} · Failed {progress.failed}</div>}
  </section>
}
export default function AdminContentV2({mode, stories, books, videoStories, adminStoryIds, adminBookIds, adminVideoIds, onAddStory, onUpdateStory, onAddEpisode, onUpdateEpisode, onDeleteStory, onDeleteEpisode, onAddBook, onUpdateBook, onDeleteBook, onAddVideo, onUpdateVideo, onAddVideoEpisode, onUpdateVideoEpisode, onDeleteVideo, onDeleteVideoEpisode, toast}) {
  const [category,setCategory]=useState('audio')
  const [createAction,setCreateAction]=useState('new-story')
  const [manageAction,setManageAction]=useState('edit')
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(50)
  const [selectedId,setSelectedId]=useState('')
  const [manageTarget,setManageTarget]=useState('story')
  const [bulkSelectedIds,setBulkSelectedIds]=useState([])
  const [bulkBusy,setBulkBusy]=useState(false)
  const [bulkEditApplyTitlePrefix,setBulkEditApplyTitlePrefix]=useState(false)
  const [bulkEditTitlePrefix,setBulkEditTitlePrefix]=useState('')
  const [bulkEditApplyAccess,setBulkEditApplyAccess]=useState(false)
  const [bulkEditAccessType,setBulkEditAccessType]=useState(['free'])
  const [bulkEditApplyStatus,setBulkEditApplyStatus]=useState(false)
  const [bulkEditStatus,setBulkEditStatus]=useState('ongoing')
  const [bulkEditApplyLanguage,setBulkEditApplyLanguage]=useState(false)
  const [bulkEditLanguage,setBulkEditLanguage]=useState('Tamil')
  const [bulkEditApplyCategory,setBulkEditApplyCategory]=useState(false)
  const [bulkEditCategory,setBulkEditCategory]=useState('Fantasy')
  const [bulkEditApplyAvailable,setBulkEditApplyAvailable]=useState(false)
  const [bulkEditAvailable,setBulkEditAvailable]=useState(true)
  const [parentId,setParentId]=useState('')
  const [edit,setEdit]=useState(null)
  const [title,setTitle]=useState('')
  const [description,setDescription]=useState('')
  const [cover,setCover]=useState('')
  const [coverUploading,setCoverUploading]=useState(false)
  const [language,setLanguage]=useState('Tamil')
  const [genre,setGenre]=useState(['Fantasy'])
  const [status,setStatus]=useState('ongoing')
  const [accessType,setAccessType]=useState(['free'])
  const [number,setNumber]=useState('')
  const [src,setSrc]=useState('')
  const [telegramUrl,setTelegramUrl]=useState('')
  const [bookType,setBookType]=useState('pdf')
  const [author,setAuthor]=useState('')
  const [file,setFile]=useState('')
  const [filePath,setFilePath]=useState('')

  const notify = (m,t='success') => toast?.(m,t)
  const resetList=()=>{setPage(1);setSelectedId('');setEdit(null)}
  const resetBulkEditor=()=>{
    setBulkSelectedIds([])
    setBulkEditApplyTitlePrefix(false)
    setBulkEditTitlePrefix('')
    setBulkEditApplyAccess(false)
    setBulkEditAccessType(['free'])
    setBulkEditApplyStatus(false)
    setBulkEditStatus('ongoing')
    setBulkEditApplyLanguage(false)
    setBulkEditLanguage('Tamil')
    setBulkEditApplyCategory(false)
    setBulkEditCategory('Fantasy')
    setBulkEditApplyAvailable(false)
    setBulkEditAvailable(true)
  }
  const onCat=(c)=>{
    setCategory(c)
    resetList()
    setParentId('')
    setSearch('')
    setCreateAction(c==='audio'?'new-story':c==='books'?'new-book':'new-video')
    setManageAction('edit')
    setManageTarget(c==='audio'?'story':c==='books'?'book':'video-story')
    resetBulkEditor()
  }
  const onSearch=(v)=>{setSearch(v);setPage(1);setSelectedId('');setEdit(null);setBulkSelectedIds([])}

  const setManageActionAndReset = (nextAction) => {
    setManageAction(nextAction)
    resetList()
    setParentId('')
    setSearch('')
    resetBulkEditor()
    setEdit(null)
  }

  const setManageTargetAndReset = (nextTarget) => {
    setManageTarget(nextTarget)
    resetList()
    setParentId('')
    setSearch('')
    resetBulkEditor()
    setEdit(null)
  }

  const actionItems = category==='audio' ? [['new-story','🆕 New Story'],['add-episode','➕ Add Episode'],['telegram','📲 Bulk Telegram Import'],['other','⚙️ Other Existing Audio Creation Options']]
    : category==='books' ? [['new-book','🆕 New Book'],['add-volume','➕ Add Volume'],['telegram','📲 Bulk Telegram Import'],['other','⚙️ Other Existing Book Creation Options']]
    : [['new-video','🆕 New Video Story'],['add-video-episode','➕ Add Video Episode'],['telegram','📲 Bulk Telegram Import'],['other','⚙️ Other Existing Video Creation Options']]
  const manageItems = [['edit','✏️ Edit'],['delete','🗑️ Delete'],['bulk-edit','🧩 Bulk Edit'],['bulk-delete','🗑️ Bulk Delete']]
  const manageTargetItems = category==='audio'
    ? [['story','📚 Stories'],['episode','🎧 Episodes']]
    : category==='books'
      ? [['book','📕 Books'],['volume','📖 Volumes']]
      : [['video-story','🎬 Video Stories'],['video-episode','🎞️ Video Episodes']]

  const sourceRows = useMemo(()=>{
    const rows = category==='audio'?stories:category==='books'?books:videoStories
    const q=search.trim().toLowerCase()
    return rows.filter(x=>!q||String(x.title||'').toLowerCase().includes(q)).filter(x=>{
      if(category==='audio') return adminStoryIds.includes(x.id)
      if(category==='books') return adminBookIds.includes(x.id)
      return adminVideoIds.includes(x.id)
    })
  },[category,search,stories,books,videoStories,adminStoryIds,adminBookIds,adminVideoIds])
  const audioEpisodeRows=useMemo(()=>{
    const story=stories.find(x=>String(x.id)===String(parentId)); const rows=story?.episodes||[]; const q=search.trim().toLowerCase()
    return rows.filter(e=>!q||String(e.title||'').toLowerCase().includes(q)||String(e.number).includes(q))
  },[stories,parentId,search])

  const videoEpisodeRows=useMemo(()=>{
    const story=videoStories.find(x=>String(x.id)===String(parentId)); const rows=story?.episodes||[]; const q=search.trim().toLowerCase()
    return rows.filter(e=>!q||String(e.title||'').toLowerCase().includes(q)||String(e.number).includes(q))
  },[videoStories,parentId,search])

  const targetRows = useMemo(()=>{
    if(manageTarget==='story') return sourceRows.map((row)=>({ ...row, manageKey:'story:'+String(row.id) }))
    if(manageTarget==='book') return sourceRows.map((row)=>({ ...row, manageKey:'book:'+String(row.id) }))
    if(manageTarget==='video-story') return sourceRows.map((row)=>({ ...row, manageKey:'video-story:'+String(row.id) }))
    if(manageTarget==='episode') return audioEpisodeRows.map((row)=>({ ...row, manageKey: row.id != null ? 'episode-id:'+String(row.id) : 'episode-number:'+String(row.number) }))
    if(manageTarget==='video-episode') return videoEpisodeRows.map((row)=>({ ...row, manageKey: row.id != null ? 'video-episode-id:'+String(row.id) : 'video-episode-number:'+String(row.number) }))
    if(manageTarget==='volume'){
      const book=books.find(x=>String(x.id)===String(parentId))
      return (book?.volumes||[]).map((volume,index)=>({ ...volume, manageKey:'volume:'+String(index), volumeIndex:index }))
    }
    return []
  },[manageTarget,sourceRows,audioEpisodeRows,videoEpisodeRows,books,parentId])

  const targetPages=Math.max(1,Math.ceil(targetRows.length/pageSize))
  const targetPageRows=targetRows.slice((page-1)*pageSize,page*pageSize)
  const targetLabel = manageTarget==='story' ? 'Story' : manageTarget==='episode' ? 'Episode' : manageTarget==='book' ? 'Book' : manageTarget==='volume' ? 'Volume' : manageTarget==='video-story' ? 'Video Story' : 'Video Episode'
  const targetPlural = manageTarget==='story' ? 'Stories' : manageTarget==='episode' ? 'Episodes' : manageTarget==='book' ? 'Books' : manageTarget==='volume' ? 'Volumes' : manageTarget==='video-story' ? 'Video Stories' : 'Video Episodes'
  const selectedTarget = targetRows.find(row => String(row.manageKey)===String(selectedId))

  const selectDetail=(id, rows=sourceRows)=>{
    setSelectedId(id)
    const item=rows.find(x=>String(x.id)===String(id))
    if(!item) return
    setEdit(item); setTitle(item.title||''); setDescription(item.description||''); setCover(item.cover||''); setLanguage(item.language||'Tamil')
    setGenre(normalizeGenreSelection(item.genre,['Fantasy'])); setStatus(normalizeContentStatus(item.status)); setAccessType(resolveAccessType(item))
    setAuthor(item.author||''); setBookType(item.type||'pdf'); setFile(item.file||''); setFilePath(item.filePath||'')
  }

  const selectManageRow = (row) => {
    setSelectedId(String(row.manageKey))
    if(manageTarget==='episode' || manageTarget==='video-episode'){
      setEdit(row)
      setTitle(row.title||'')
      setNumber(String(row.number||''))
      setSrc(row.src||'')
      setTelegramUrl(row.telegram_message_id?String(row.telegram_message_id):'')
      setAccessType(resolveAccessType(row))
      setBulkSelectedIds((current)=>current.filter((id)=>String(id)!==String(row.manageKey)))
      return
    }
    if(manageTarget==='volume'){
      setEdit(row)
      setTitle(row.title||'')
      setFile(row.file||'')
      setFilePath(row.filePath||'')
      return
    }
    selectDetail(row.id,targetRows)
  }

  const save = async (e)=>{
    e.preventDefault()
    try {
      if(category==='audio' && manageTarget==='story') {
        if(!selectedTarget?.id) throw new Error('Story database ID is missing.')
        await onUpdateStory(selectedTarget.id,{title:title.trim(),genre:serializeGenreSelection(genre),language,cover:cover.trim(),description:description.trim(),status,accessType})
      }
      else if(category==='audio' && manageTarget==='episode') {
        const rawMediaUrl = String(telegramUrl || '').trim()
        const messageId = extractId(rawMediaUrl) || (!rawMediaUrl ? Number(edit.telegram_message_id) || null : null)
        const nextSrc = messageId ? STREAMING_SERVER_URL + '/audio/message/' + encodeURIComponent(messageId) : src.trim()
        await onUpdateEpisode(parentId,Number(edit.number),{number:Number(number),title:title.trim(),type:'audio',src:nextSrc,available:true,accessType,telegram_message_id:messageId || undefined},edit.id)
      }
      else if(category==='books' && manageTarget==='book') {
        if(!selectedTarget?.id) throw new Error('Book database ID is missing.')
        await onUpdateBook(selectedTarget.id,{...edit,title:title.trim(),author:author.trim(),description:description.trim(),type:bookType,language,cover:cover.trim(),file:file.trim(),filePath,accessType,status})
      }
      else if(category==='books' && manageTarget==='volume') {
        const b=books.find(x=>String(x.id)===String(parentId)); const vols=Array.isArray(b?.volumes)?b.volumes:[]; const idx=Number(selectedTarget?.volumeIndex); if(!Number.isInteger(idx)||!vols[idx]) throw new Error('Volume not found.')
        const next=vols.map((v,i)=>i===idx?{...v,title:title.trim(),file:file.trim(),filePath,type:b.type||bookType}:v); await onUpdateBook(b.id,{...b,volumes:next})
      } else if(category==='videos' && manageTarget==='video-story') {
        if(!selectedTarget?.id) throw new Error('Video story database ID is missing.')
        await onUpdateVideo(selectedTarget.id,{title:title.trim(),category:genre[0]||'Action',language,cover:cover.trim(),status,accessType})
      }
      else if(category==='videos' && manageTarget==='video-episode') {
        const rawMediaUrl = String(telegramUrl || '').trim()
        const messageId = extractId(rawMediaUrl) || (!rawMediaUrl ? Number(edit.telegram_message_id) || null : null)
        const nextSrc = messageId ? STREAMING_SERVER_URL + '/video/message/' + encodeURIComponent(messageId) : src.trim()
        await onUpdateVideoEpisode(parentId,Number(edit.number),{number:Number(number),title:title.trim(),type:'video',src:nextSrc,available:true,accessType,telegram_message_id:messageId || undefined},edit.id)
      }
      notify('Saved successfully.')
      const current=selectedId; setSelectedId(''); setEdit(null)
      setTimeout(()=>setSelectedId(current),0)
    } catch(err){ console.error(err); notify(err.message||'Save failed.','error') }
  }

  const deleteSingle = async () => {
    if(!selectedTarget) return notify('Select an item first.','error')
    if(!window.confirm('Delete '+targetLabel.toLowerCase()+' "'+(selectedTarget.title||selectedTarget.name||targetLabel)+'"? This cannot be undone.')) return

    try {
      if(manageTarget==='story') {
        if(!onDeleteStory) throw new Error('Story delete operation is unavailable.')
        await onDeleteStory(selectedTarget.id)
      } else if(manageTarget==='episode') {
        if(!selectedTarget.id) throw new Error('This episode is missing its database ID and cannot be safely deleted.')
        if(!onDeleteEpisode) throw new Error('Episode delete operation is unavailable.')
        await onDeleteEpisode(parentId, selectedTarget.id)
      } else if(manageTarget==='book') {
        if(!onDeleteBook) throw new Error('Book delete operation is unavailable.')
        await onDeleteBook(selectedTarget.id)
      } else if(manageTarget==='volume') {
        const book=books.find(x=>String(x.id)===String(parentId))
        if(!book) throw new Error('Parent book not found.')
        const volumes=Array.isArray(book.volumes)?book.volumes:[]
        const index=Number(selectedTarget.volumeIndex)
        if(!Number.isInteger(index)||!volumes[index]) throw new Error('Volume not found.')
        const nextVolumes=volumes.filter((_,i)=>i!==index).map((volume,i)=>({...volume,number:i+1}))
        await onUpdateBook(book.id,{...book,volumes:nextVolumes})
      } else if(manageTarget==='video-story') {
        if(!onDeleteVideo) throw new Error('Video story delete operation is unavailable.')
        await onDeleteVideo(selectedTarget.id)
      } else if(manageTarget==='video-episode') {
        if(!onDeleteVideoEpisode) throw new Error('Video episode delete operation is unavailable.')
        if(!selectedTarget.id) throw new Error('Video episode database ID is missing; deletion is unsafe.')
        await onDeleteVideoEpisode(parentId, selectedTarget.number, selectedTarget.id)
      }
      notify(targetLabel+' deleted successfully.')
      resetList()
    } catch(err) {
      console.error('Manage delete error',err)
      notify(err.message||'Delete failed.','error')
    }
  }

  const runBulkEdit = async () => {
    if(bulkBusy) return
    const selectedRows=targetRows.filter(row=>bulkSelectedIds.some(id=>String(id)===String(row.manageKey)))
    if(!selectedRows.length) return notify('Select at least one '+targetLabel.toLowerCase()+'.','error')
    const hasPatch=bulkEditApplyTitlePrefix||bulkEditApplyAccess||bulkEditApplyStatus||bulkEditApplyLanguage||bulkEditApplyCategory||bulkEditApplyAvailable
    if(!hasPatch) return notify('Choose at least one field to update.','error')
    if(bulkEditApplyTitlePrefix && !bulkEditTitlePrefix.trim()) return notify('Enter a title prefix.','error')

    setBulkBusy(true)
    let updated=0
    let failed=0

    try {
      if(manageTarget==='volume'){
        const book=books.find(x=>String(x.id)===String(parentId))
        if(!book) throw new Error('Parent book not found.')
        const chosen=new Set(selectedRows.map(row=>Number(row.volumeIndex)))
        const volumes=Array.isArray(book.volumes)?book.volumes:[]
        const nextVolumes=volumes.map((volume,index)=>{
          if(!chosen.has(index)) return volume
          return bulkEditApplyTitlePrefix ? {...volume,title:bulkEditTitlePrefix.trim()+String(volume.title||'')} : volume
        })
        await onUpdateBook(book.id,{...book,volumes:nextVolumes})
        updated=selectedRows.length
      } else {
        for(const row of selectedRows){
          try{
            if(manageTarget==='story'){
              if(!row.id) throw new Error('Story database ID is missing.')
              const patch={
                title:bulkEditApplyTitlePrefix ? bulkEditTitlePrefix.trim()+String(row.title||'') : String(row.title||''),
                genre:bulkEditApplyCategory ? serializeGenreSelection([bulkEditCategory]) : serializeGenreSelection(normalizeGenreSelection(row.genre,['Fantasy'])),
                language:bulkEditApplyLanguage ? bulkEditLanguage : String(row.language||'Tamil'),
                cover:String(row.cover||''),
                coverPath:String(row.coverPath||''),
                description:String(row.description||''),
                status:bulkEditApplyStatus ? bulkEditStatus : normalizeContentStatus(row.status),
                accessType:bulkEditApplyAccess ? bulkEditAccessType : resolveAccessType(row),
              }
              await onUpdateStory(row.id,patch)
            } else if(manageTarget==='episode'){
              if(!row.id) throw new Error('Episode database ID is missing; bulk edit is unsafe.')
              const patch={
                number:Number(row.number),
                title:bulkEditApplyTitlePrefix ? bulkEditTitlePrefix.trim()+String(row.title||'') : String(row.title||''),
                type:String(row.type||'audio'),
                src:String(row.src||''),
                filePath:String(row.filePath||''),
                available:bulkEditApplyAvailable ? bulkEditAvailable : row.available !== false,
                accessType:bulkEditApplyAccess ? bulkEditAccessType : resolveAccessType(row),
                language:String(row.language||'Tamil'),
                ...(row.telegram_message_id ? {telegram_message_id:Number(row.telegram_message_id)} : {}),
              }
              await onUpdateEpisode(parentId,Number(row.number),patch,row.id)
            } else if(manageTarget==='book'){
              if(!row.id) throw new Error('Book database ID is missing.')
              const patch={...row}
              patch.title=bulkEditApplyTitlePrefix ? bulkEditTitlePrefix.trim()+String(row.title||'') : String(row.title||'')
              patch.accessType=bulkEditApplyAccess ? bulkEditAccessType : resolveAccessType(row)
              patch.status=bulkEditApplyStatus ? bulkEditStatus : normalizeContentStatus(row.status)
              patch.language=bulkEditApplyLanguage ? bulkEditLanguage : String(row.language||'Tamil')
              patch.category=bulkEditApplyCategory ? bulkEditCategory : String(row.category||'Other')
              delete patch.manageKey
              await onUpdateBook(row.id,patch)
            } else if(manageTarget==='video-story'){
              if(!row.id) throw new Error('Video story database ID is missing.')
              const patch={
                title:bulkEditApplyTitlePrefix ? bulkEditTitlePrefix.trim()+String(row.title||'') : String(row.title||''),
                category:bulkEditApplyCategory ? bulkEditCategory : String(row.category||'Action'),
                language:bulkEditApplyLanguage ? bulkEditLanguage : String(row.language||'Tamil'),
                cover:String(row.cover||''),
                coverPath:String(row.coverPath||''),
                status:bulkEditApplyStatus ? bulkEditStatus : normalizeContentStatus(row.status),
                accessType:bulkEditApplyAccess ? bulkEditAccessType : resolveAccessType(row),
                ...(row.telegram_message_id ? {telegram_message_id:Number(row.telegram_message_id)} : {}),
              }
              await onUpdateVideo(row.id,patch)
            } else if(manageTarget==='video-episode'){
              if(!row.id) throw new Error('Video episode database ID is missing; bulk edit is unsafe.')
              const patch={
                number:Number(row.number),
                title:bulkEditApplyTitlePrefix ? bulkEditTitlePrefix.trim()+String(row.title||'') : String(row.title||''),
                type:String(row.type||'video'),
                src:String(row.src||''),
                filePath:String(row.filePath||''),
                available:bulkEditApplyAvailable ? bulkEditAvailable : row.available !== false,
                accessType:bulkEditApplyAccess ? bulkEditAccessType : resolveAccessType(row),
                ...(row.telegram_message_id ? {telegram_message_id:Number(row.telegram_message_id)} : {}),
              }
              await onUpdateVideoEpisode(parentId,Number(row.number),patch,row.id)
            }
          } catch(error){
            failed++
            console.error('Bulk edit item failed',row,error)
          }
        }
      }
      resetBulkEditor()
      notify(updated+' '+targetLabel.toLowerCase()+(updated===1?' updated.':'s updated.')+(failed?' '+failed+' failed.':''))
    } catch(err) {
      console.error('Bulk edit failed',err)
      notify(err.message||'Bulk edit failed.','error')
    } finally {
      setBulkBusy(false)
    }
  }

  const runBulkDelete = async () => {
    if(bulkBusy) return
    const selectedRows=targetRows.filter(row=>bulkSelectedIds.some(id=>String(id)===String(row.id)))
    if(!selectedRows.length) return notify('Select at least one '+targetLabel.toLowerCase()+'.','error')
    if(!window.confirm('Delete '+selectedRows.length+' selected '+targetPlural.toLowerCase()+'? This cannot be undone.')) return

    setBulkBusy(true)
    let deleted=0
    let failed=0
    try{
      if(manageTarget==='volume'){
        const book=books.find(x=>String(x.id)===String(parentId))
        if(!book) throw new Error('Parent book not found.')
        const chosen=new Set(selectedRows.map(row=>Number(row.volumeIndex)))
        const volumes=Array.isArray(book.volumes)?book.volumes:[]
        const nextVolumes=volumes.filter((_,index)=>!chosen.has(index)).map((volume,index)=>({...volume,number:index+1}))
        await onUpdateBook(book.id,{...book,volumes:nextVolumes})
        deleted=selectedRows.length
      } else {
        for(const row of selectedRows){
          try{
            if(manageTarget==='story'){
              if(!onDeleteStory) throw new Error('Story delete operation is unavailable.')
              await onDeleteStory(row.id)
            } else if(manageTarget==='episode'){
              if(!row.id) throw new Error('Missing episode database ID.')
              if(!onDeleteEpisode) throw new Error('Episode delete operation is unavailable.')
              await onDeleteEpisode(parentId,row.id)
            } else if(manageTarget==='book'){
              if(!onDeleteBook) throw new Error('Book delete operation is unavailable.')
              await onDeleteBook(row.id)
            } else if(manageTarget==='video-story'){
              if(!onDeleteVideo) throw new Error('Video story delete operation is unavailable.')
              await onDeleteVideo(row.id)
            } else if(manageTarget==='video-episode'){
              if(!onDeleteVideoEpisode) throw new Error('Video episode delete operation is unavailable.')
              if(!row.id) throw new Error('Video episode database ID is missing; deletion is unsafe.')
              await onDeleteVideoEpisode(parentId,row.number,row.id)
            }
            deleted++
          } catch(error){
            failed++
            console.error('Bulk delete item failed',row,error)
          }
        }
      }
      resetBulkEditor()
      resetList()
      notify(deleted+' deleted.'+(failed?' '+failed+' failed.':''))
    } catch(err) {
      console.error('Bulk delete failed',err)
      notify(err.message||'Bulk delete failed.','error')
    } finally {
      setBulkBusy(false)
    }
  }

  const toggleBulkRow = (row) => {
    setBulkSelectedIds((current)=>current.some(id=>String(id)===String(row.manageKey))
      ? current.filter(id=>String(id)!==String(row.manageKey))
      : [...current,row.manageKey])
  }

  const toggleBulkAll = () => {
    const pageKeys=targetPageRows.map(row=>String(row.manageKey))
    const allSelected=pageKeys.length>0 && pageKeys.every(key=>bulkSelectedIds.some(selectedKey=>String(selectedKey)===key))
    setBulkSelectedIds((current)=>{
      if(allSelected) return current.filter(id=>!pageKeys.includes(String(id)))
      return [...current,...targetPageRows.map(row=>row.manageKey).filter(key=>!current.some(existing=>String(existing)===String(key)))]
    })
  }

  const createSubmit=async(e)=>{
    e.preventDefault()
    try {
      if(createAction==='new-story') await onAddStory({title:title.trim(),genre:serializeGenreSelection(genre),language,cover:cover.trim(),description:description.trim(),status,episodes:[]})
      else if(createAction==='add-episode') await onAddEpisode(parentId,{number:Number(number),title:title.trim(),type:'audio',src:src.trim(),available:true,accessType,telegram_message_id:extractId(telegramUrl)||undefined})
      else if(createAction==='new-book') await onAddBook({title:title.trim(),author:author.trim(),description:description.trim(),type:bookType,category:genre[0]||'Other',language,cover:cover.trim(),file:file.trim(),filePath,accessType,status,volumes:[]})
      else if(createAction==='add-volume'){const b=books.find(x=>String(x.id)===String(parentId));if(!b)throw new Error('Select a book.');await onUpdateBook(b.id,{...b,volumes:[...(b.volumes||[]),{number:(b.volumes||[]).length+1,title:title.trim(),file:file.trim(),filePath,type:b.type||bookType}]})}
      else if(createAction==='new-video') await onAddVideo({title:title.trim(),category:genre[0]||'Action',language,cover:cover.trim(),status,accessType,episodes:[]})
      else if(createAction==='add-video-episode') await onAddVideoEpisode(parentId,{number:Number(number),title:title.trim(),type:'video',src:src.trim(),available:true,accessType,telegram_message_id:extractId(telegramUrl)||undefined})
      notify('Created successfully.'); clearForm()
    } catch(err){console.error(err);notify(err.message||'Create failed.','error')}
  }

  function clearForm(){setTitle('');setDescription('');setCover('');setFile('');setFilePath('');setAuthor('');setNumber('');setSrc('');setTelegramUrl('');setEdit(null);setSelectedId('')}
  function extractId(v){
    const raw=String(v||'').trim()
    if(/^\d+$/.test(raw)) return Number(raw)
    const m=raw.match(/\/(?:audio|video|document)\/message\/(\d+)(?:\/?$)|(?:t\.me\/)(?:c\/)?[^/]+\/(\d+)(?:\/?$)/i)
    return m ? Number(m[1] || m[2]) : null
  }

  const renderForm=(editing=false, type=category)=>{
    const episodeMode=(type==='audio'&&createAction==='add-episode')||(type==='videos'&&createAction==='add-video-episode')||manageTarget==='episode'||manageTarget==='video-episode'
    const book=type==='books'
    return <form className="admin-form admin-v2-form" onSubmit={editing?save:createSubmit}>
      {episodeMode && <label>Parent Story<select value={parentId} onChange={e=>{setParentId(e.target.value);setPage(1)}}><option value="">Select Story</option>{(type==='audio'?stories:videoStories).map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}
      {book && (createAction==='add-volume'||manageTarget==='volume') && <label>Parent Book<select value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">Select Book</option>{books.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}
      {episodeMode && <input type="number" min="1" placeholder="Episode number" value={number} onChange={e=>setNumber(e.target.value)}/>}
      <input required placeholder={episodeMode?'Episode title':book?'Book title':type==='videos'?'Video story title':'Story title'} value={title} onChange={e=>setTitle(e.target.value)}/>
      {!episodeMode && <><textarea placeholder="Description (optional)" value={description} onChange={e=>setDescription(e.target.value)}/><label>Language<select value={language} onChange={e=>setLanguage(e.target.value)}>{LANGUAGES.map(x=><option key={x}>{x}</option>)}</select></label><label>Genre / Category<select value={genre[0]||''} onChange={e=>setGenre([e.target.value])}>{(type==='audio'?GENRES:type==='books'?BOOK_GENRES:VIDEO_GENRES).map(x=><option key={x}>{x}</option>)}</select></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="draft">Draft</option></select></label></>}
      {book && <><input placeholder="Author (optional)" value={author} onChange={e=>setAuthor(e.target.value)}/><select value={bookType} onChange={e=>setBookType(e.target.value)}><option value="pdf">PDF</option><option value="epub">EPUB</option></select></>}
      {!episodeMode && <FileUploadField label={cover?'✓ Cover uploaded — replace':'Choose Cover Image'} kind="image" bucket="story-covers" folder={book?'books':type==='videos'?'video-stories':'stories'} value={cover} accept="image/*" onUploaded={u=>setCover(u)} onUploadingChange={setCoverUploading}/>}
      {(book || episodeMode) && <input placeholder={book?'File URL / Telegram document URL':'Audio/Video URL or Telegram message URL'} value={book?file:(telegramUrl||src)} onChange={e=>{const value=e.target.value;if(book)setFile(value);else{setTelegramUrl(value);setSrc(value)}}}/>}
      <Access value={accessType} onChange={setAccessType}/>
      <button className="admin-submit" disabled={coverUploading}>{editing?'✓ Save':'＋ Create'}</button>
      {editing && <button type="button" className="admin-cancel" onClick={()=>{setEdit(null);setSelectedId('')}}>Cancel</button>}
    </form>
  }

  return <div className="admin-v2">
    <section className="admin-section"><h2>{mode==='create'?'➕ Create Content':'🛠️ Manage Content'}</h2><p className="admin-v2-hint">{mode==='create'?'Create / add / import only. Editing stays in Manage.':'Edit existing content only; lists are paginated and details are opened one item at a time.'}</p><CategoryCards value={category} onChange={onCat}/></section>
    {mode==='create' ? <section className="admin-section"><ActionCards items={actionItems} value={createAction} onChange={x=>{setCreateAction(x);clearForm()}}/>
      {createAction==='telegram'?<TelegramImport category={category} stories={stories} books={books} videoStories={videoStories} onAddEpisode={onAddEpisode} onUpdateBook={onUpdateBook} onAddVideoEpisode={onAddVideoEpisode} toast={notify}/>:createAction==='other'?<div className="admin-v2-empty">Other existing creation options remain available through the existing workflows; no existing backend was replaced.</div>:renderForm(false,category)}</section>
    : <section className="admin-section">
      <ActionCards items={manageItems} value={manageAction} onChange={setManageActionAndReset} className="admin-v2-manage-actions"/>
      <div className="admin-v2-manage-subhead">
        <div>
          <strong>Choose what to manage</strong>
          <small>{manageAction==='edit'?'Open an item and edit it.':manageAction==='delete'?'Choose one item to delete.':manageAction==='bulk-edit'?'Select multiple items and apply the same supported fields.':'Select multiple items for one confirmation and delete them together.'}</small>
        </div>
        <label>Page size<select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);setBulkSelectedIds([])}}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
      </div>
      <ActionCards items={manageTargetItems} value={manageTarget} onChange={setManageTargetAndReset} className="admin-v2-target-actions"/>

      {(manageTarget==='episode'||manageTarget==='video-episode') && <label className="admin-v2-parent-field">
        Parent Story<select value={parentId} onChange={e=>{setParentId(e.target.value);resetList();setBulkSelectedIds([])}}><option value="">Select Story</option>{(category==='audio'?stories:videoStories).map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select>
      </label>}
      {manageTarget==='volume' && <label className="admin-v2-parent-field">
        Parent Book<select value={parentId} onChange={e=>{setParentId(e.target.value);resetList();setBulkSelectedIds([])}}><option value="">Select Book</option>{books.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select>
      </label>}

      {(manageTarget==='story'||manageTarget==='book'||manageTarget==='video-story'||parentId) && <div className="admin-v2-manage-toolbar">
        <input aria-label={targetLabel+' search'} placeholder={'Search '+targetPlural+'…'} value={search} onChange={e=>onSearch(e.target.value)}/>
        {(manageAction==='bulk-edit'||manageAction==='bulk-delete') && <button type="button" className="admin-v2-select-all" onClick={toggleBulkAll} disabled={bulkBusy||!targetPageRows.length}>{bulkSelectedIds.length && targetPageRows.every(row=>bulkSelectedIds.some(id=>String(id)===String(row.id))) ? 'Clear Page' : 'Select Page'}</button>}
      </div>}

      {!!targetRows.length && (manageAction==='bulk-edit'||manageAction==='bulk-delete') && <div className="admin-v2-selection-summary">
        <strong>{bulkSelectedIds.length} selected</strong><span>on the current Manage selection</span>
      </div>}

      {!!targetRows.length && (manageAction==='bulk-edit'||manageAction==='bulk-delete')
        ? <div className="admin-v2-list">{targetPageRows.map(row=><label key={row.manageKey} className={'admin-v2-selection-row '+(bulkSelectedIds.some(id=>String(id)===String(row.manageKey))?'selected':'')}>
            <input type="checkbox" checked={bulkSelectedIds.some(id=>String(id)===String(row.manageKey))} onChange={()=>toggleBulkRow(row)}/>
            <span><strong>{manageTarget==='episode'||manageTarget==='video-episode' ? '#'+row.number+' · ' : manageTarget==='volume' ? 'Volume '+(Number(row.volumeIndex)+1)+' · ' : ''}{row.title||'Untitled'}</strong><small>{manageTarget==='episode'||manageTarget==='video-episode' ? resolveAccessType(row).join(', ') : manageTarget==='book' ? ((row.category||'')+' · '+resolveAccessType(row).join(', ')) : manageTarget==='video-story' ? ((row.category||'')+' · '+resolveAccessType(row).join(', ')) : (row.language||'')}</small></span>
          </label>)}</div>
        : targetRows.length && manageAction!=='bulk-edit' && manageAction!=='bulk-delete'
          ? <div className="admin-v2-list">{targetPageRows.map(row=><button type="button" key={row.manageKey} className={'admin-v2-list-row '+(String(selectedId)===String(row.manageKey)?'active':'')} onClick={()=>selectManageRow(row)}>
              <span><strong>{manageTarget==='episode'||manageTarget==='video-episode' ? '#'+row.number+' · ' : manageTarget==='volume' ? 'Volume '+(Number(row.volumeIndex)+1)+' · ' : ''}{row.title||'Untitled'}</strong><small>{manageTarget==='episode'||manageTarget==='video-episode' ? resolveAccessType(row).join(', ') : manageTarget==='book' ? ((row.category||'')+' · '+resolveAccessType(row).join(', ')) : manageTarget==='video-story' ? ((row.category||'')+' · '+resolveAccessType(row).join(', ')) : (row.language||'')}</small></span><span>›</span>
            </button>)}</div>
        : (manageTarget==='episode'||manageTarget==='video-episode'||manageTarget==='volume') && !parentId ? <div className="admin-v2-empty">Select the parent {manageTarget==='volume'?'book':'story'} first.</div>
        : <div className="admin-v2-empty">No matching {targetPlural.toLowerCase()} found.</div>}

      {targetRows.length>0 && <div className="admin-v2-pagination"><button type="button" disabled={page<=1} onClick={()=>setPage(page-1)}>‹ Previous</button><span>{page} / {targetPages}</span><button type="button" disabled={page>=targetPages} onClick={()=>setPage(page+1)}>Next ›</button></div>}

      {manageAction==='edit' && edit && renderForm(true,manageTarget==='volume'?'books':category)}

      {manageAction==='delete' && selectedTarget && <div className="admin-v2-danger-panel">
        <div><strong>Delete {targetLabel}</strong><span>{selectedTarget.title||'Untitled'}{manageTarget==='episode'||manageTarget==='video-episode'?' · #'+selectedTarget.number:''}</span></div>
        <button type="button" className="admin-v2-danger-btn" onClick={deleteSingle}>🗑️ Delete {targetLabel}</button>
      </div>}

      {(manageAction==='bulk-edit'||manageAction==='bulk-delete') && bulkSelectedIds.length>0 && <div className="admin-v2-bulk-panel">
        {manageAction==='bulk-edit' ? <>
          <div className="admin-v2-bulk-panel-head"><strong>🧩 Bulk Edit — {bulkSelectedIds.length} selected</strong><small>Only the checked fields will be changed.</small></div>
          {manageTarget!=='volume' && <label className="admin-v2-bulk-check"><input type="checkbox" checked={bulkEditApplyTitlePrefix} onChange={e=>setBulkEditApplyTitlePrefix(e.target.checked)}/> Title prefix</label>}
          {bulkEditApplyTitlePrefix && manageTarget!=='volume' && <input placeholder="Prefix to add before each current title" value={bulkEditTitlePrefix} onChange={e=>setBulkEditTitlePrefix(e.target.value)}/>}
          {manageTarget!=='volume' && <label className="admin-v2-bulk-check"><input type="checkbox" checked={bulkEditApplyAccess} onChange={e=>setBulkEditApplyAccess(e.target.checked)}/> Access Types</label>}
          {bulkEditApplyAccess && manageTarget!=='volume' && <Access value={bulkEditAccessType} onChange={setBulkEditAccessType}/>}
          {(manageTarget==='story'||manageTarget==='book'||manageTarget==='video-story') && <label className="admin-v2-bulk-check"><input type="checkbox" checked={bulkEditApplyStatus} onChange={e=>setBulkEditApplyStatus(e.target.checked)}/> Status</label>}
          {bulkEditApplyStatus && (manageTarget==='story'||manageTarget==='book'||manageTarget==='video-story') && <select value={bulkEditStatus} onChange={e=>setBulkEditStatus(e.target.value)}><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="draft">Draft</option></select>}
          {(manageTarget==='story'||manageTarget==='book'||manageTarget==='video-story') && <label className="admin-v2-bulk-check"><input type="checkbox" checked={bulkEditApplyLanguage} onChange={e=>setBulkEditApplyLanguage(e.target.checked)}/> Language</label>}
          {bulkEditApplyLanguage && (manageTarget==='story'||manageTarget==='book'||manageTarget==='video-story') && <select value={bulkEditLanguage} onChange={e=>setBulkEditLanguage(e.target.value)}>{LANGUAGES.map(x=><option key={x}>{x}</option>)}</select>}
          {(manageTarget==='story'||manageTarget==='book'||manageTarget==='video-story') && <label className="admin-v2-bulk-check"><input type="checkbox" checked={bulkEditApplyCategory} onChange={e=>setBulkEditApplyCategory(e.target.checked)}/> {manageTarget==='story'?'Genre':'Category'}</label>}
          {bulkEditApplyCategory && manageTarget==='story' && <select value={bulkEditCategory} onChange={e=>setBulkEditCategory(e.target.value)}>{GENRES.map(x=><option key={x}>{x}</option>)}</select>}
          {bulkEditApplyCategory && manageTarget==='book' && <select value={bulkEditCategory} onChange={e=>setBulkEditCategory(e.target.value)}>{BOOK_GENRES.map(x=><option key={x}>{x}</option>)}</select>}
          {bulkEditApplyCategory && manageTarget==='video-story' && <select value={bulkEditCategory} onChange={e=>setBulkEditCategory(e.target.value)}>{VIDEO_GENRES.map(x=><option key={x}>{x}</option>)}</select>}
          {(manageTarget==='episode'||manageTarget==='video-episode') && <label className="admin-v2-bulk-check"><input type="checkbox" checked={bulkEditApplyAvailable} onChange={e=>setBulkEditApplyAvailable(e.target.checked)}/> Availability</label>}
          {bulkEditApplyAvailable && (manageTarget==='episode'||manageTarget==='video-episode') && <select value={bulkEditAvailable?'true':'false'} onChange={e=>setBulkEditAvailable(e.target.value==='true')}><option value="true">Available</option><option value="false">Unavailable</option></select>}
          <div className="admin-v2-bulk-actions"><button type="button" className="admin-submit" disabled={bulkBusy} onClick={runBulkEdit}>{bulkBusy?'⏳ Applying…':'✓ Apply Bulk Edit'}</button><button type="button" className="admin-cancel" disabled={bulkBusy} onClick={()=>setBulkSelectedIds([])}>Clear Selection</button></div>
        </> : <>
          <div className="admin-v2-bulk-panel-head"><strong>⚠️ Bulk Delete — {bulkSelectedIds.length} selected</strong><small>One confirmation; each item is deleted only after its own database operation succeeds.</small></div>
          <button type="button" className="admin-v2-danger-btn" disabled={bulkBusy} onClick={runBulkDelete}>{bulkBusy?'⏳ Deleting…':'🗑️ Delete '+bulkSelectedIds.length+' Selected'}</button>
        </>}
      </div>}

      <div className="admin-v2-progress" aria-live="polite">Manage target: {targetLabel} · {targetRows.length} total · {bulkSelectedIds.length} selected</div>
    </section>}
    </div>
  </div>
}
