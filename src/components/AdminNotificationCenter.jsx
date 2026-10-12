import { useMemo, useState } from 'react'

export default function AdminNotificationCenter({ stories = [] }) {
  const [kind, setKind] = useState('promotion')
  const [targetType, setTargetType] = useState('all')
  const [storyId, setStoryId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [targetUrl, setTargetUrl] = useState('/')
  const [icon, setIcon] = useState('/icon-192.png')
  const [result, setResult] = useState('')

  const selectedStory = useMemo(() => stories.find((story) => String(story?.id) === String(storyId)), [stories, storyId])

  const send = () => {
    setResult('Web Push delivery is not available yet. Subscriptions and preferences remain saved; no notification was sent.')
  }

  return (
    <div className="admin-settings-card admin-settings-wide web-push-admin-card">
      <div className="admin-settings-card-head">
        <div><small>WEB PUSH</small><h3>🔔 Notification Center</h3></div>
        <span>📢</span>
      </div>
      <p className="admin-settings-note">Delivery is not available yet in the Cloudflare Pages runtime. Existing subscriptions and notification preferences remain saved; this control cannot send notifications.</p>
      <div className="admin-settings-form-grid">
        <label>Notification Type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="promotion">Promotion</option>
            <option value="announcement">Announcement</option>
            <option value="new_story">New Story</option>
            <option value="new_episode">New Episode</option>
          </select>
        </label>
        <label>Targeting
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="all">All notification-enabled users</option>
            <option value="story_library">Users with a story in Library</option>
            <option value="story_followers">Users who viewed/listened to a story</option>
            <option value="inactive_30d">Users inactive for 30+ days</option>
          </select>
        </label>
        {targetType !== 'all' && targetType !== 'inactive_30d' && (
          <label>Story
            <select value={storyId} onChange={(e) => setStoryId(e.target.value)}>
              <option value="">Select story</option>
              {stories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
            </select>
          </label>
        )}
        <label>Target URL
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="/?hj_story=123" />
        </label>
        <label>Icon
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="/icon-192.png" />
        </label>
        <label>Title
          <input maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="🔔 HJ GROUPS" />
        </label>
        <label className="admin-settings-field-wide">Message
          <textarea maxLength={500} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="New stories are waiting for you…" />
        </label>
      </div>
      {selectedStory && <small className="admin-settings-note">Selected story: {selectedStory.title}</small>}
      {result && <div className="admin-settings-save-status saved">{result}</div>}
      <button type="button" className="admin-submit" onClick={send} disabled>Delivery not available yet</button>
    </div>
  )
}
