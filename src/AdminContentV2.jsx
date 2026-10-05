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

function ActionCards({ items, value, onChange }) {
  return <div className="admin-v2-action-grid">{items.map(([id,label]) =>
    <button key={id} type="button" className={'admin-v2-card '+(value===id?'active':'')} onClick={() => onChange(id)}>{label}</button>
  )}</div>
}

function ListPicker({ rows, selectedId, onSelect, search, onSearch, page, totalPages, onPage, label }) {
  return <div className="admin-v2-picker">
    <input aria-label={label+' search'} placeholder={'Search '+label+'…'} value={search} onChange={e=>onSearch(e.target.value)} />
    <div className="admin-v2-list">
      {rows.map(row => <button type="button" key={row.id} className={'admin-v2-list-row '+(String(selectedId)===String(row.id)?'active':'')} onClick={()=>onSelect(row.id)}>
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
export default function AdminContentV2({mode, stories, books, videoStories, adminStoryIds, adminBookIds, adminVideoIds, onAddStory, onUpdateStory, onAddEpisode, onUpdateEpisode, onAddBook, onUpdateBook, onAddVideo, onUpdateVideo, onAddVideoEpisode, onUpdateVideoEpisode, toast}) {
  const [category,setCategory]=useState('audio')
  const [createAction,setCreateAction]=useState('new-story')
  const [manageAction,setManageAction]=useState('story-edit')
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(50)
  const [selectedId,setSelectedId]=useState('')
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
  const onCat=(c)=>{
    setCategory(c)
    resetList()
    setParentId('')
    setSearch('')
    setCreateAction(c==='audio'?'new-story':c==='books'?'new-book':'new-video')
    setManageAction(c==='audio'?'story-edit':c==='books'?'book-edit':'video-story-edit')
  }
  const onSearch=(v)=>{setSearch(v);setPage(1);setSelectedId('');setEdit(null)}

  const actionItems = category==='audio' ? [['new-story','🆕 New Story'],['add-episode','➕ Add Episode'],['telegram','📲 Bulk Telegram Import'],['other','⚙️ Other Existing Audio Creation Options']]
    : category==='books' ? [['new-book','🆕 New Book'],['add-volume','➕ Add Volume'],['telegram','📲 Bulk Telegram Import'],['other','⚙️ Other Existing Book Creation Options']]
    : [['new-video','🆕 New Video Story'],['add-video-episode','➕ Add Video Episode'],['telegram','📲 Bulk Telegram Import'],['other','⚙️ Other Existing Video Creation Options']]
  const manageItems = category==='audio' ? [['story-edit','📚 Story Edit'],['episode-edit','🎧 Episode Edit']] : category==='books' ? [['book-edit','📕 Book Edit'],['volume-edit','📖 Volume Edit']] : [['video-story-edit','🎬 Video Story Edit'],['video-episode-edit','🎞️ Video Episode Edit']]

  const sourceRows = useMemo(()=>{
    const rows = category==='audio'?stories:category==='books'?books:videoStories
    const q=search.trim().toLowerCase()
    return rows.filter(x=>!q||String(x.title||'').toLowerCase().includes(q)).filter(x=>{
      if(category==='audio') return adminStoryIds.includes(x.id)
      if(category==='books') return adminBookIds.includes(x.id)
      return adminVideoIds.includes(x.id)
    })
  },[category,search,stories,books,videoStories,adminStoryIds,adminBookIds,adminVideoIds])
  const pages=Math.max(1,Math.ceil(sourceRows.length/pageSize))
  const pageRows=sourceRows.slice((page-1)*pageSize,page*pageSize)

  const episodeRows=useMemo(()=>{
    const story=stories.find(x=>String(x.id)===String(parentId)); const rows=story?.episodes||[]; const q=search.trim().toLowerCase()
    return rows.filter(e=>!q||String(e.title||'').toLowerCase().includes(q)||String(e.number).includes(q))
  },[stories,parentId,search])
  const episodePages=Math.max(1,Math.ceil(episodeRows.length/pageSize))
  const episodePageRows=episodeRows.slice((page-1)*pageSize,page*pageSize)

  const selectDetail=(id, rows=sourceRows)=>{
    setSelectedId(id)
    const item=rows.find(x=>String(x.id)===String(id))
    if(!item) return
    setEdit(item); setTitle(item.title||''); setDescription(item.description||''); setCover(item.cover||''); setLanguage(item.language||'Tamil')
    setGenre(normalizeGenreSelection(item.genre,['Fantasy'])); setStatus(normalizeContentStatus(item.status)); setAccessType(resolveAccessType(item))
    setAuthor(item.author||''); setBookType(item.type||'pdf'); setFile(item.file||''); setFilePath(item.filePath||'')
  }

  const save = async (e)=>{
    e.preventDefault()
    try {
      if(category==='audio' && manageAction==='story-edit') await onUpdateStory(selectedId,{title:title.trim(),genre:serializeGenreSelection(genre),language,cover:cover.trim(),description:description.trim(),status})
      else if(category==='audio' && manageAction==='episode-edit') {
        const rawMediaUrl = String(telegramUrl || '').trim()
        const messageId = extractId(rawMediaUrl) || (!rawMediaUrl ? Number(edit.telegram_message_id) || null : null)
        const nextSrc = messageId ? STREAMING_SERVER_URL + '/audio/message/' + encodeURIComponent(messageId) : src.trim()
        await onUpdateEpisode(parentId,Number(edit.number),{number:Number(number),title:title.trim(),type:'audio',src:nextSrc,available:true,accessType,telegram_message_id:messageId || undefined},edit.id)
      }
      else if(category==='books' && manageAction==='book-edit') await onUpdateBook(selectedId,{...edit,title:title.trim(),author:author.trim(),description:description.trim(),type:bookType,language,cover:cover.trim(),file:file.trim(),filePath,accessType,status})
      else if(category==='books' && manageAction==='volume-edit') {
        const b=books.find(x=>String(x.id)===String(parentId)); const vols=Array.isArray(b?.volumes)?b.volumes:[]; const idx=vols.findIndex((_,i)=>String(i)===String(selectedId)); if(idx<0) throw new Error('Volume not found.')
        const next=vols.map((v,i)=>i===idx?{...v,title:title.trim(),file:file.trim(),filePath,type:b.type||bookType}:v); await onUpdateBook(b.id,{...b,volumes:next})
      } else if(category==='videos' && manageAction==='video-story-edit') await onUpdateVideo(selectedId,{title:title.trim(),category:genre[0]||'Action',language,cover:cover.trim(),status,accessType})
      else if(category==='videos' && manageAction==='video-episode-edit') {
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
    const episodeMode=(type==='audio'&&createAction==='add-episode')||(type==='videos'&&createAction==='add-video-episode')||(type==='audio'&&manageAction==='episode-edit')||(type==='videos'&&manageAction==='video-episode-edit')
    const book=type==='books'
    return <form className="admin-form admin-v2-form" onSubmit={editing?save:createSubmit}>
      {episodeMode && <label>Parent Story<select value={parentId} onChange={e=>{setParentId(e.target.value);setPage(1)}}><option value="">Select Story</option>{(type==='audio'?stories:videoStories).map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}
      {book && (createAction==='add-volume'||manageAction==='volume-edit') && <label>Parent Book<select value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">Select Book</option>{books.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}
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
    : <section className="admin-section"><ActionCards items={manageItems} value={manageAction} onChange={x=>{setManageAction(x);resetList();setParentId('')}}/>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}>
        <label style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:13}}>Page size
          <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select>
        </label>
      </div>
      {manageAction==='episode-edit'||manageAction==='video-episode-edit'?<><label>Parent Story<select value={parentId} onChange={e=>{setParentId(e.target.value);resetList()}}><option value="">Select Story</option>{(category==='audio'?stories:videoStories).map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>{parentId&&<><input aria-label="Episode search" placeholder="Search Episode…" value={search} onChange={e=>onSearch(e.target.value)}/><div className="admin-v2-list">{episodePageRows.map(e=><button type="button" key={e.id||e.number} className={'admin-v2-list-row '+(String(selectedId)===String(e.id||e.number)?'active':'')} onClick={()=>{setSelectedId(e.id||e.number);setEdit(e);setTitle(e.title||'');setNumber(String(e.number));setSrc(e.src||'');setTelegramUrl(e.telegram_message_id?String(e.telegram_message_id):'');setAccessType(resolveAccessType(e))}}><span><strong>#{e.number} · {e.title}</strong><small>{resolveAccessType(e).join(', ')}</small></span><span>›</span></button>)}</div><div className="admin-v2-pagination"><button type="button" disabled={page<=1} onClick={()=>setPage(page-1)}>‹ Previous</button><span>{page} / {episodePages}</span><button type="button" disabled={page>=episodePages} onClick={()=>setPage(page+1)}>Next ›</button></div>{edit&&renderForm(true,category)}</>}</> : (manageAction==='volume-edit'?<><ListPicker rows={books} selectedId={parentId} onSelect={id=>{setParentId(id);setSearch('');setPage(1)}} search={search} onSearch={onSearch} page={page} totalPages={Math.max(1,Math.ceil(books.length/pageSize))} onPage={setPage} label="Books"/>{parentId&&<div className="admin-v2-list">{(books.find(x=>String(x.id)===String(parentId))?.volumes||[]).map((v,i)=><button type="button" className="admin-v2-list-row" key={i} onClick={()=>{setSelectedId(String(i));setEdit(v);setTitle(v.title||'');setFile(v.file||'');setFilePath(v.filePath||'')}}><span><strong>Volume {i+1} · {v.title}</strong></span><span>›</span></button>)}</div>}{edit&&renderForm(true,'books')}</>:
      <><ListPicker rows={pageRows} selectedId={selectedId} onSelect={id=>selectDetail(id)} search={search} onSearch={onSearch} page={page} totalPages={pages} onPage={setPage} label={category==='audio'?(manageAction==='story-edit'?'Stories':'Stories'):category==='books'?'Books':'Video Stories'}/>{edit&&renderForm(true,category)}</>)}
    </section>}
  </div>
}
