import { useRef, useState } from 'react'
import { uploadFileToBucket, validateFile } from '../lib/storageUpload'

function FileUploadField({
  label,
  kind, // 'image' | 'audio' | 'video' | 'pdf' | 'epub'
  bucket,
  folder,
  value,
  onUploaded, // (url, path) => void
  onUploadingChange, // (bool) => void
  accept,
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  const handleChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')

    const validationError = validateFile(file, kind)
    if (validationError) {
      setError(validationError)
      event.target.value = ''
      return
    }

    setUploading(true)
    onUploadingChange?.(true)
    setFileName(file.name)

    try {
      const { url, path } = await uploadFileToBucket(bucket, folder, file)
      onUploaded(url, path)
    } catch (err) {
      setError(err?.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
      event.target.value = ''
    }
  }

  return (
    <div className="file-upload-field">
      <button
        type="button"
        className="file-upload-button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? 'Uploading…' : label}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      {uploading && (
        <div className="file-upload-status">
          <span className="file-upload-spinner" />
          Uploading{fileName ? `: ${fileName}` : '…'}
        </div>
      )}

      {!uploading && fileName && !error && (
        <div className="file-upload-status success">✓ Uploaded: {fileName}</div>
      )}

      {error && <div className="file-upload-status error">{error}</div>}

      {!uploading && kind === 'image' && value && (
        <img src={value} alt="preview" className="file-upload-preview" style={{ width: '120px', height: '160px', objectFit: 'cover', display: 'block', marginTop: '10px', borderRadius: '4px' }} />
      )}

      {!uploading && kind === 'audio' && value && (
        <audio controls src={value} className="file-upload-preview-audio" />
      )}

      {!uploading && kind === 'video' && value && (
        <video controls src={value} className="file-upload-preview-video" />
      )}

      {!uploading && (kind === 'pdf' || kind === 'epub') && value && !fileName && (
        <div className="file-upload-status">Current file on record</div>
      )}
    </div>
  )
}

export default FileUploadField