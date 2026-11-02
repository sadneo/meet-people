import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { MediaImage } from '../../ui/loading/MediaImage'

// Same atlas/crops and low-resolution canvases as the supplied landing demo.
const items = [
  { id: 'tree', name: 'Trees', x: 57, y: 34, frame: [35, 310, 230, 235], size: 40 },
  { id: 'wildflowers', name: 'Flowers', x: 22, y: 66, frame: [285, 570, 225, 200], size: 40 },
  { id: 'bench', name: 'Cozy spots', x: 49, y: 80, frame: [515, 570, 225, 200], size: 48 },
  { id: 'pebble', name: 'Pebbles', x: 35, y: 49, frame: [300, 1020, 200, 185], size: 32 },
] as const
let atlas: Promise<HTMLImageElement> | undefined
function loadAtlas() {
  return atlas ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Preview artwork unavailable'))
    image.src = '/pebble/garden-sprites-v1.png'
  }).catch(error => { atlas = undefined; throw error })
}
function Sprite({ item }: { item: typeof items[number] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    void loadAtlas().then(image => {
      if (!live || !canvas.current) return
      const context = canvas.current.getContext('2d')
      if (!context) return
      const [x, y, width, height] = item.frame, scale = image.naturalWidth / 1280
      const ratio = Math.min(item.size / width, item.size / height), w = Math.round(width * ratio), h = Math.round(height * ratio)
      context.imageSmoothingEnabled = false
      context.clearRect(0, 0, item.size, item.size)
      context.drawImage(image, x * scale, y * scale, width * scale, height * scale, Math.floor((item.size - w) / 2), Math.floor((item.size - h) / 2), w, h)
    }).catch(() => { /* Optional visual preview: text controls remain usable without the atlas. */ })
    return () => { live = false }
  }, [item])
  return <span className="landing-sprite" aria-hidden="true"><canvas ref={canvas} width={item.size} height={item.size}/></span>
}

export function GardenPreview() {
  // Marketing-only, ephemeral state. Never read/write account Garden storage or APIs.
  const [selected, setSelected] = useState<number | null>(null)
  const item = selected === null ? null : items[selected]
  return <section className="landing-community">
    <div className="landing-garden-art">
      <div className="landing-build-scene" id="landing-build-scene" role="img" aria-label={`A customizable pixel Garden${item ? `, with ${item.name.toLowerCase()} added` : ''}`}>
        <MediaImage src="/garden/marketing-garden.png" alt="" width="1498" height="1050" loading="lazy"/>
        {item && <span key={item.id} className="landing-placement" style={{ left: `${item.x}%`, top: `${item.y}%` } as CSSProperties} aria-hidden="true"><Sprite item={item}/></span>}
      </div>
    </div>
    <div className="landing-community-copy">
      <h2>Grow your garden</h2>
      <p>Add trees, cozy corners, and friendly Pebbles. Make every little detail yours.</p>
      <div className="landing-build-tray" role="group" aria-label="Try decorating the Garden preview">
        {items.map((value, index) => <button key={value.id} type="button" aria-pressed={selected === index} aria-controls="landing-build-scene" aria-label={`${selected === index ? 'Remove' : 'Add'} ${value.name.toLowerCase()} ${selected === index ? 'from' : 'to'} Garden preview`} onClick={() => setSelected(previous => previous === index ? null : index)}>
          <Sprite item={value}/><span>{value.name}</span><span className="landing-build-indicator" aria-hidden="true">{selected === index ? '✓' : '+'}</span>
        </button>)}
      </div>
      <span className="sr-only" role="status">{item ? `${item.name} added to the Garden preview.` : 'No added decorations in the Garden preview.'}</span>
    </div>
  </section>
}
