import React from 'react'
import { handleCoverImageError, resolveCoverImage } from '../lib/coverAssets.js'

function CoverImage({
  src,
  coverPath = '',
  alt = '',
  className,
  style,
  width,
  height,
  sizes = '(max-width: 600px) 42vw, 240px',
  eager = false,
  loading,
  onClick,
  ...rest
}) {
  const resolved = resolveCoverImage(src, coverPath)
  return (
    <img
      {...rest}
      src={resolved.src}
      srcSet={resolved.srcSet || undefined}
      alt={alt}
      className={className}
      style={style}
      width={width || resolved.width}
      height={height || resolved.height}
      sizes={sizes}
      loading={loading || (eager ? 'eager' : 'lazy')}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      onClick={onClick}
      onError={(event) => handleCoverImageError(event, resolved.fallbackSrc)}
    />
  )
}

export default CoverImage
