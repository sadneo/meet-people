import { useEffect, useRef } from 'react'
import { loadGardenArt } from './art'

// A single Garden item drawn from the shared pixel-art sheet.
export function ArtPreview({ id, size = 64 }: { id: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let active = true
    void loadGardenArt().then(art => { if (active && ref.current) art.preview(ref.current.getContext('2d')!, id) }).catch(() => {})
    return () => { active = false }
  }, [id])
  return <canvas ref={ref} width={64} height={64} style={size === 64 ? undefined : { width: size, height: size }} aria-hidden="true" />
}
