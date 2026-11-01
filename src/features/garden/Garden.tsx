import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useGarden } from './state'
import { buildSections, isLandscapeUpgrade, purchaseRefund, upgrades, type UpgradeId, type Community } from './economy'
import { constrainPlacement, defaultPlacements, type MovableId, type Position } from './community-placement'
import { CurrencyIcon, GardenIcon as Icon } from './icons'
import { geodeRocks, isGeode } from './geodes'
import { landscapeNames, loadGardenArt, type GardenArt } from './art'
import { drawGardenSky, gardenProjection } from './sky'
import { Link } from 'react-router'
import { Modal } from '../../ui/common'
import './garden.css'

function ArtPreview({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { let active=true; void loadGardenArt().then(art => { if(active && ref.current) art.preview(ref.current.getContext('2d')!,id) }).catch(() => {}); return () => { active=false } }, [id])
  return <canvas ref={ref} width={64} height={64} aria-hidden="true" />
}

export function Garden() {
  const { state, dispatch } = useGarden(), community = state.community
  const [art,setArt]=useState<GardenArt|null>(null), [error,setError]=useState('')
  const [selected,setSelected]=useState<MovableId|null>(null), [preview,setPreview]=useState<{ id: MovableId; point: Position }|null>(null)
  const [camera,setCamera]=useState({x:0,y:0,zoom:1}), [paused,setPaused]=useState(false)
  const [undo,setUndo]=useState<Community[]>([])
  const remember=()=>setUndo(history=>[...history.slice(-19),structuredClone(community)])
  const storeRock=(id:UpgradeId)=>{remember();dispatch({type:'remove-garden-item',id})}
  const [announcement,setAnnouncement]=useState(''), [reveal,setReveal]=useState<string|null>(null)
  const [tab,setTab]=useState<'build'|'activity'>('build'), [inventoryOpen,setInventoryOpen]=useState(false), [friendIsland,setFriendIsland]=useState(false)
  const canvas=useRef<HTMLCanvasElement>(null), drawer=useRef<HTMLDialogElement>(null), reset=useRef<HTMLDialogElement>(null), revealDialog=useRef<HTMLDialogElement>(null)
  const trigger=useRef<HTMLButtonElement>(null)
  const islandArt=useRef<HTMLImageElement|null>(null)
  const islandTargets=useRef<HTMLDivElement>(null)
  const inventoryGesture=useRef<number|null>(null)
  const projection=useRef({scale:1,x:0,y:0})
  const drag=useRef<{pointer:number; id:MovableId|null; start:Position; origin:Position; point:Position}|null>(null)
  const pointers=useRef(new Map<number,Position>()), pinch=useRef<{distance:number;zoom:number}|null>(null)
  useEffect(()=>{let active=true;void loadGardenArt().then(value=>{if(active)setArt(value)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
  useEffect(()=>{const image=new Image();image.src='/pebble/square-garden-cutout.png';islandArt.current=image},[])
  useEffect(()=>{
    const element=canvas.current; if(!element || !art)return
    let frame=0,last=0; const motion=window.matchMedia('(prefers-reduced-motion: reduce)')
    const draw=(time:number)=>{
      frame=requestAnimationFrame(draw); if(time-last<32)return; last=time
      const rect=element.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2)
      const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio)
      if(element.width!==w||element.height!==h){element.width=w;element.height=h}
      const ctx=element.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=false
      const t=paused||motion.matches?0:time/1000
      drawGardenSky(ctx,rect.width,rect.height,ratio,t,camera,islandArt.current)
      const islandLocations=[[.17,.22],[.81,.29],[.54,.15]]
      islandTargets.current?.querySelectorAll<HTMLElement>('button').forEach((target,i)=>{
        target.style.left=`${Math.round(islandLocations[i][0]*rect.width-camera.x*.13)}px`
        target.style.top=`${Math.round(islandLocations[i][1]*rect.height-camera.y*.08+Math.sin(t*.55+i*2)*3)}px`
      })
      const {scale,x,y}=gardenProjection(rect.width,rect.height,camera)
      projection.current={scale,x,y};ctx.setTransform(scale*ratio,0,0,scale*ratio,Math.round(x*ratio),Math.round(y*ratio))
      art.base(ctx)
      for(const id of community.owned.filter(isLandscapeUpgrade)) if(id!=='tree-cluster') art.layer(ctx,landscapeNames[id],t)
      if(community.owned.includes('river'))art.river(ctx,t)
      const items: {id:MovableId; x:number;y:number;width:number}[] = ['pebble' as const,...community.owned.filter(id=>!isLandscapeUpgrade(id))].map(id=>{
        const [x,y,width]=defaultPlacements[id as MovableId]
        const point=preview?.id===id?preview.point:community.positions?.[id as MovableId]??(id==='pebble'?{x:724,y:610}:{x,y})
        return {id:id as MovableId,...point,width}
      })
      const layers=[...items.map(item=>({depth:item.y,item,tree:''})),...(community.owned.includes('tree-cluster')?art.trees.map(tree=>({depth:tree.depth,item:null,tree:tree.id})):[])].sort((a,b)=>a.depth-b.depth)
      for(const layer of layers){
        if(layer.tree){art.layer(ctx,layer.tree,t);continue}
        const item=layer.item!; art.sprite(ctx,item.id,item.x,item.y,item.width,t)
        if(item.id===selected){ctx.save();ctx.strokeStyle='#9d503d';ctx.lineWidth=3/scale;ctx.setLineDash([6/scale,4/scale]);ctx.strokeRect(item.x-item.width/2-5,item.y-item.width-5,item.width+10,item.width+10);ctx.restore()}
        if(item.id==='lanterns'&&t){ctx.save();ctx.globalAlpha=.08+.05*Math.sin(t);ctx.fillStyle='#ffd977';ctx.beginPath();ctx.arc(item.x,item.y-55,20,0,Math.PI*2);ctx.fill();ctx.restore()}
      }
    };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame)
  },[art,camera,community,paused,preview,selected])
  const point=(e:PointerEvent<HTMLCanvasElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-rect.left-projection.current.x)/projection.current.scale,y:(e.clientY-rect.top-projection.current.y)/projection.current.scale}}
  const open=(view:'build'|'activity')=>{setTab(view);setInventoryOpen(true);drawer.current?.showModal()}
  const close=()=>{drawer.current?.close();setInventoryOpen(false);trigger.current?.focus({preventScroll:true})}
  const buy=(id:UpgradeId)=>{remember();dispatch({type:'build',id});setAnnouncement(`${upgrades.find(x=>x.id===id)?.name} added.`);close();if(!isLandscapeUpgrade(id)){setSelected(id as MovableId);canvas.current?.focus({preventScroll:true})}}
  const openGeode=()=>{
    const remaining=geodeRocks.filter(rock=>!community.geodeUnlocks?.includes(rock.id));if(community.balance<300||!remaining.length)return
    const random=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296,rock=remaining[Math.floor(random*remaining.length)]
    setUndo([]);dispatch({type:'open-geode',random});setReveal(rock.id);drawer.current?.close();setInventoryOpen(false);revealDialog.current?.showModal();setAnnouncement(`${rock.name} unlocked.`)
  }
  const endDrag=(e:PointerEvent<HTMLCanvasElement>,cancel=false)=>{
    pointers.current.delete(e.pointerId);if(pointers.current.size<2)pinch.current=null
    const current=drag.current;if(current?.pointer!==e.pointerId)return
    if(current.id&&!cancel){remember();dispatch({type:'move-community-item',id:current.id,position:current.point})}
    drag.current=null;setPreview(null)
  }
  const unlocked=community.geodeUnlocks??[],revealed=geodeRocks.find(rock=>rock.id===reveal)
  return <section className="garden-workspace integrated-sky-garden" aria-label="Pebble Garden">
    <header className="garden-heading"><h1 className="garden-wordmark" aria-label="Your Garden"><img src="/pebble/pebble-wordmark.svg" width="216" height="96" alt=""/></h1><button className="garden-balance" onClick={()=>open('build')} aria-label={`Build with ${community.balance} Pebbles`}><CurrencyIcon/><strong>{community.balance.toLocaleString()}</strong></button></header>
    {error&&<p className="garden-load" role="alert">{error}</p>}{!art&&!error&&<p className="garden-load" role="status">Growing your Garden…</p>}
    <canvas ref={canvas} className="garden-canvas" tabIndex={0} aria-label="Garden. Drag a decoration to move it; drag empty space to pan. Arrow keys move the selected item, plus and minus zoom, Escape cancels a drag." onPointerDown={e=>{
      if(e.button!==0)return;e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId)
      pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
      if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:camera.zoom};drag.current=null;setPreview(null);return}
      const p=point(e),ids:MovableId[]=['pebble',...community.owned.filter(id=>!isLandscapeUpgrade(id)) as MovableId[]]
      const hit=ids.map(id=>{const [x,y,width]=defaultPlacements[id];const pos=community.positions?.[id]??(id==='pebble'?{x:724,y:610}:{x,y});return{id,...pos,width}}).sort((a,b)=>b.y-a.y).find(item=>p.x>=item.x-item.width/2-12&&p.x<=item.x+item.width/2+12&&p.y>=item.y-item.width-12&&p.y<=item.y+12)
      setSelected(hit?.id??null);drag.current={pointer:e.pointerId,id:hit?.id??null,start:hit?p:{x:e.clientX,y:e.clientY},origin:hit?{x:hit.x,y:hit.y}:{x:camera.x,y:camera.y},point:hit?{x:hit.x,y:hit.y}:p}
    }} onPointerMove={e=>{
      if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
      if(pinch.current&&pointers.current.size===2){const[a,b]=[...pointers.current.values()];setCamera(c=>({...c,zoom:Math.max(.7,Math.min(2.5,pinch.current!.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.current!.distance)))}));return}
      const d=drag.current;if(!d||d.pointer!==e.pointerId)return
      if(d.id){const p=point(e);d.point=constrainPlacement({x:d.origin.x+p.x-d.start.x,y:d.origin.y+p.y-d.start.y},d.id);setPreview({id:d.id,point:d.point})}
      else setCamera(c=>({...c,x:Math.max(-500,Math.min(500,d.origin.x+e.clientX-d.start.x)),y:Math.max(-300,Math.min(300,d.origin.y+e.clientY-d.start.y))}))
    }} onPointerUp={e=>endDrag(e)} onPointerCancel={e=>endDrag(e,true)} onKeyDown={e=>{
      if(e.key==='Escape'){drag.current=null;setPreview(null);setSelected(null);return}
      if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();setCamera(c=>({...c,zoom:Math.max(.7,Math.min(2.5,c.zoom+(e.key==='-'?-.1:.1)))}));return}
      if(selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const[x,y]=defaultPlacements[selected],p=community.positions?.[selected]??(selected==='pebble'?{x:724,y:610}:{x,y});remember();dispatch({type:'move-community-item',id:selected,position:{x:p.x+(e.key==='ArrowLeft'?-12:e.key==='ArrowRight'?12:0),y:p.y+(e.key==='ArrowUp'?-12:e.key==='ArrowDown'?12:0)}})}
    }}/>
    <div ref={islandTargets} className="garden-friend-islands" aria-label="Illustrative friend islands">{[0,1,2].map(i=><button key={i} className={`garden-friend-island island-${i}`} aria-label="An island for a future friend" onClick={()=>setFriendIsland(true)}/>)}</div>
    {friendIsland&&<Modal title="Room for a new friend" close={()=>setFriendIsland(false)}><img className="garden-friend-preview" src="/pebble/square-garden-cutout.png" alt="Illustrative pixel garden"/><p>A little island is waiting. Meet someone new and grow your worlds together.</p><p className="mini muted">An illustration, not another person's private Garden.</p><Link className="btn" to="/matchmaking?mode=friends">Discover people</Link></Modal>}
    {selected&&<div className="garden-selection" role="group" aria-label="Selected Garden item"><span>{selected==='pebble'?'Your Pebble':upgrades.find(item=>item.id===selected)?.name}</span>{selected!=='pebble'&&<button onClick={()=>{remember();dispatch({type:'remove-garden-item',id:selected as UpgradeId});setSelected(null)}}>{isGeode(selected)?'Return to inventory':'Remove & refund'}</button>}<button aria-label="Deselect item" onClick={()=>setSelected(null)}>×</button></div>}
    <div className="garden-bottom"><button className="garden-activity" onClick={()=>open('activity')}><Icon name="history"/><span>Your collection<small>{unlocked.length} of 4 geode rocks</small></span></button></div>
    <div className="garden-inventory-dock"><button ref={trigger} className="garden-build" onClick={()=>open('build')} aria-label="Open Garden inventory" aria-expanded={inventoryOpen} aria-controls="garden-inventory-panel" onPointerDown={e=>{inventoryGesture.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(inventoryGesture.current!==null&&inventoryGesture.current-e.clientY>25){inventoryGesture.current=null;open('build')}}} onPointerUp={()=>{inventoryGesture.current=null}} onPointerCancel={()=>{inventoryGesture.current=null}}><span className="garden-inventory-handle"/><Icon name="build"/></button></div>
    <p className="garden-sr-only" role="status">{announcement}</p>
    <dialog ref={drawer} id="garden-inventory-panel" className="garden-drawer" aria-labelledby="garden-drawer-title" onCancel={e=>{e.preventDefault();close()}}>
      <span className="garden-inventory-handle" aria-hidden="true"/>
      <header><h2 id="garden-drawer-title">{tab==='build'?'Your garden':'Your collection'}</h2><button aria-label="Close Garden inventory" onClick={close}><Icon name="close"/></button></header>
      <div className="garden-build-meta"><span><CurrencyIcon/> {community.balance.toLocaleString()} Pebbles available</span><button onClick={()=>{close();canvas.current?.focus({preventScroll:true})}}>Arrange garden ↗</button></div>
      <div className="garden-drawer-body">

        {tab==='activity'?<><p>Your Garden is saved on this device for this account. Purchases and geode unlocks are not synced to the server.</p><div className="garden-collection">{geodeRocks.map(rock=><article key={rock.id}><ArtPreview id={rock.id}/><strong>{rock.name}</strong><small>{unlocked.includes(rock.id)?'Collected':'Not collected yet'}</small></article>)}</div><p>Weekly activity and shared friend islands need a connected activity service.</p><button className="btn" onClick={()=>setTab('build')}>Open Build</button></>:<>
          <section><h3>Mystery Geodes <small>{unlocked.length} / 4 collected</small></h3><article className="garden-shop-item"><img src="/garden/geodes/mystery-geode.svg" width="64" height="64" alt=""/><div><strong>Mystery Geode</strong><small>300 Pebbles · No duplicates</small></div><button disabled={unlocked.length===4||community.balance<300} onClick={openGeode}>{unlocked.length===4?'Complete':'Open'}</button></article><p className="garden-hint">One new rock inside. Yours to keep through Garden resets.</p>{geodeRocks.map(rock=><article className="garden-shop-item" key={rock.id}><ArtPreview id={rock.id}/><div><strong>{rock.name}</strong><small>{rock.mood} · {unlocked.includes(rock.id)?community.owned.includes(rock.id)?'In Garden':'Owned':'Locked'}</small></div>{unlocked.includes(rock.id)&&<button onClick={()=>community.owned.includes(rock.id)?storeRock(rock.id):buy(rock.id)}>{community.owned.includes(rock.id)?'Store':'Place'}</button>}</article>)}</section>
          {buildSections.map(section=><section key={section.name}><h3>{section.name}</h3>{section.items.map(item=><article className="garden-shop-item" key={item.id}><ArtPreview id={item.id}/><div><strong>{item.name}</strong><small>{item.cost} Pebbles{isLandscapeUpgrade(item.id)?' · Fixed landscape':''}</small></div><button disabled={community.owned.includes(item.id)||community.balance<item.cost} onClick={()=>buy(item.id)}>{community.owned.includes(item.id)?'Owned':'Build'}</button></article>)}</section>)}
        <div className="garden-tools"><button aria-label="Undo Garden change" disabled={!undo.length} onClick={()=>{const previous=undo.at(-1);if(previous){dispatch({type:'restore-garden',community:previous});setUndo(history=>history.slice(0,-1));setSelected(null);setAnnouncement('Garden change undone.')}}}><Icon name="back"/><span>Undo</span></button><button title="Reset view" aria-label="Reset Garden view" onClick={()=>{setCamera({x:0,y:0,zoom:1});close()}}><Icon name="refresh"/><span>Reset view</span></button><button aria-label={paused?'Resume Garden motion':'Pause Garden motion'} aria-pressed={paused} onClick={()=>setPaused(x=>!x)}>{paused?'Resume motion':'Pause motion'}</button></div>
          <details><summary>Arrange with keyboard</summary><p>Select an item, then use the arrow keys on the Garden.</p>{['pebble',...community.owned.filter(id=>!isLandscapeUpgrade(id))].map(id=><button key={id} onClick={()=>{setSelected(id as MovableId);close();canvas.current?.focus()}}>Move {id}</button>)}</details>
        </>}
      </div><footer><small>Saved on this device · No server sync</small><button disabled={!community.owned.length&&!Object.keys(community.positions??{}).length} onClick={()=>reset.current?.showModal()}>Reset Garden</button></footer>
    </dialog>
    <dialog ref={reset} className="garden-confirm" aria-labelledby="garden-reset-title"><h2 id="garden-reset-title">Start with a little space?</h2><p>Remove placed items and refund {purchaseRefund(community)} Pebbles. Geode rocks return to inventory for free. Their unlocks stay collected.</p><div><button autoFocus onClick={()=>reset.current?.close()}>Cancel</button><button onClick={()=>{remember();dispatch({type:'reset-purchases'});setSelected(null);setCamera({x:0,y:0,zoom:1});reset.current?.close();setAnnouncement('Garden reset. Geode collection kept.')}}>Reset Garden</button></div></dialog>
    <dialog ref={revealDialog} className="garden-reveal" aria-labelledby="garden-reveal-title" onClose={()=>{setReveal(null);open('build')}}>{revealed&&<><p>A little discovery</p><ArtPreview id={revealed.id}/><h2 id="garden-reveal-title">{revealed.name}</h2><p>{revealed.description}</p><button className="btn" onClick={()=>revealDialog.current?.close()}>Keep in inventory</button></>}</dialog>
  </section>
}
