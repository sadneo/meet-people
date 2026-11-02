import { useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'
import './skeletons.css'

/** Load/decode only this image. Neither page data nor unrelated images are gated. */
export function MediaImage({ src, className = '', fallback, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fallback?: string }) {
  // A source-keyed child prevents late events/decodes from revealing a different image.
  return <ImageSource key={src} src={src} className={className} fallback={fallback} {...props}/>
}
function ImageSource({ src, className, fallback, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fallback?: string }) {
  const image = useRef<HTMLImageElement>(null), alive = useRef(true)
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false)
  const finish = useCallback(async () => {
    const element = image.current
    if (!element?.naturalWidth) return
    try { if (element.decode) await element.decode() } catch { /* A loaded image may still be displayable. */ }
    if (alive.current && element === image.current) setReady(true)
  }, [])
  useEffect(() => {
    alive.current = true
    if (image.current?.complete) void finish()
    return () => { alive.current = false }
  }, [finish])
  return <img {...props} ref={image} src={failed && fallback ? fallback : src} className={`${className ?? ''} media-placeholder${!ready && !failed ? ' media-pending' : ''}`} data-media-pending={!ready && !failed || undefined} onLoad={event => { void finish(); props.onLoad?.(event) }} onError={event => { setFailed(true); setReady(true); props.onError?.(event) }}/>
}
