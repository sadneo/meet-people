import geometry from './art-data.json'
import { geodeRocks, isGeode } from './geodes'

type Crop = [number, number, number, number]
// Measured source crops and turf cleanup from the working prototype. No new artwork.
const crops: Record<string, Crop> = {
  pebble: [455,155,175,170], flowers: [715,140,325,220], bench: [1080,145,310,200],
  lanterns: [65,408,255,250], picnic: [370,425,325,235], bridge: [715,420,335,270],
  garden: [1070,410,335,265], cafe: [45,697,300,310], stage: [365,720,335,288],
  cottage: [695,705,330,300], hall: [1025,705,398,300], tree: [85,105,255,260],
  garnet: [7,179,528,463], sapphire: [561,179,500,463], emerald: [1093,176,518,466], citrine: [1646,172,518,470],
}
const rare = (id: string) => ['garnet','sapphire','emerald','citrine'].includes(id)
export const landscapeNames: Record<string,string> = { river:'river', 'tree-cluster':'tree', walkway:'walkway', 'flower-meadow':'meadow', shrubs:'shrub', 'rock-formation':'rock', 'grass-detail':'grass' }
export type GardenArt = Awaited<ReturnType<typeof createGardenArt>>
let shared: Promise<GardenArt> | undefined
export function loadGardenArt() { return shared ??= createGardenArt().catch(error => { shared = undefined; throw error }) }
async function createGardenArt() {
  const images: Record<string, HTMLImageElement> = {}
  const sources = {
    empty:'/garden/legacy-garden/village-empty.png', landscape:'/garden/legacy-garden/village-landscape.png',
    props:'/garden/legacy-garden/village-props.png', rare:'/garden/legacy-garden/expressive-pebbles.png',
    ...Object.fromEntries(geodeRocks.map(rock => [rock.id, `/garden/geodes/${rock.id}.png`])),
  }
  await Promise.all(Object.entries(sources).map(([id, src]) => new Promise<void>((resolve, reject) => {
    const image = new Image(); image.onload = () => { images[id] = image; resolve() }; image.onerror = () => reject(new Error('Garden artwork could not load. Refresh to try again.')); image.src = src
  })))
  const layers: Record<string, HTMLCanvasElement> = {}
  function canvas(width = 1448, height = 1086) {
    const el = document.createElement('canvas'); el.width = width; el.height = height
    const ctx = el.getContext('2d')!; ctx.imageSmoothingEnabled = false
    return { el, ctx }
  }
  for (const [id, region] of Object.entries(geometry.regions)) {
    const { el, ctx } = canvas(); ctx.clip(new Path2D(region.outline)); ctx.drawImage(images.landscape,0,0)
    const pixels = ctx.getImageData(0,0,1448,1086), p = pixels.data
    for (let i = 0; i < p.length; i += 4) {
      const [r,g,b] = [p[i],p[i+1],p[i+2]]
      if (g > r+6 && g > b+25 && (['river','walkway','rock'].includes(id) || g > 140 && r > 100)) p[i+3] = 0
    }
    ctx.putImageData(pixels,0,0); layers[id] = el
  }
  function propLayer(id: string, crop: Crop, x: number, y: number, width: number) {
    const { el, ctx } = canvas(), height = Math.round(width*crop[3]/crop[2])
    ctx.drawImage(images.props,...crop,Math.round(x-width/2),Math.round(y-height),width,height); layers[id] = el
  }
  propLayer('meadow', crops.flowers,449,665,239)
  const trees = [[795,358,215],[333,537,182],[1166,569,186],[512,795,144]]
  geometry.trees.forEach((tree,i) => { const [x,y,w] = trees[i]; propLayer(tree.id,crops.tree,x,y,w) })
  for (const rock of geodeRocks) {
    const image = images[rock.id], { ctx } = canvas(image.naturalWidth,image.naturalHeight)
    ctx.drawImage(image,0,0)
    const p = ctx.getImageData(0,0,image.naturalWidth,image.naturalHeight).data
    let left = image.naturalWidth, top = image.naturalHeight, right = 0, bottom = 0
    for (let y=0;y<image.naturalHeight;y++) for (let x=0;x<image.naturalWidth;x++) if (p[(y*image.naturalWidth+x)*4+3]>32) { left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y) }
    crops[rock.id] = [left,top,right-left+1,bottom-top+1]
  }
  const base = (ctx: CanvasRenderingContext2D) => {
    ctx.save(); ctx.clip(new Path2D('M0 0H1448V570H1364V660L716 1015 84 660V570H0Z')); ctx.drawImage(images.empty,0,0,1448,1086); ctx.restore()
  }
  const layer = (ctx: CanvasRenderingContext2D, id: string, t = 0) => {
    if (!layers[id]) return
    const breeze = t && (id.startsWith('tree-') || ['meadow','shrub','grass'].includes(id)) ? Math.floor(t/3 + id.length)%3-1 : 0
    ctx.drawImage(layers[id],breeze,0)
  }
  const sprite = (ctx: CanvasRenderingContext2D,id: string,x: number,y: number,width: number,t = 0) => {
    const crop = crops[id], image = images[isGeode(id) ? id : rare(id) ? 'rare' : 'props']; if (!crop || !image) return
    let w = Math.round(width), h = Math.round(w*crop[3]/crop[2])
    if (id === 'pebble' || rare(id) || isGeode(id)) {
      const period = id === 'sapphire' ? 14 : id === 'citrine' ? 9 : 11, cycle = ((t+id.length)%period)/period
      if(t && cycle>=.24 && cycle<.36){ w+=2; h-=2 } else if(t && cycle>=.36 && cycle<.48){ w-=2; h+=2 }
    }
    ctx.imageSmoothingEnabled=false; ctx.drawImage(image,...crop,Math.round(x-w/2),Math.round(y-h),w,h)
  }
  const river = (ctx: CanvasRenderingContext2D,t: number) => {
    ctx.save(); ctx.clip(new Path2D(geometry.regions.river.outline)); ctx.strokeStyle='#e5fff5'; ctx.globalAlpha=.65; ctx.lineWidth=6; ctx.setLineDash([18,78]); ctx.lineDashOffset=-Math.floor(t*27)
    ctx.stroke(new Path2D('M978 394 925 435 1008 482 980 535 1005 568 1060 620 1150 688 1136 726')); ctx.restore()
  }
  function preview(ctx: CanvasRenderingContext2D,id: string) {
    ctx.clearRect(0,0,64,64); ctx.imageSmoothingEnabled=false
    const key=landscapeNames[id]
    if (key) {
      const crop = key === 'tree' ? [687,139,215,220] : key === 'meadow' ? [329,503,239,162] : geometry.regions[key as keyof typeof geometry.regions].crop
      const [x,y,w,h]=crop, scale=Math.min(60/w,60/h), dw=Math.round(w*scale), dh=Math.round(h*scale)
      ctx.drawImage(layers[key==='tree'?'tree-back':key],x,y,w,h,Math.round((64-dw)/2),Math.round((64-dh)/2),dw,dh)
    } else if (crops[id]) sprite(ctx,id,32,62,Math.min(58,58*crops[id][2]/crops[id][3]))
  }
  return { base, layer, sprite, river, preview, trees: geometry.trees }
}
