import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useGarden } from './state'
import { EarnPebbles } from './EarnPebbles'
import { hasGardenReward } from '../../../shared/garden'
import './earning.css'
import { buildSections, isLandscapeUpgrade, purchaseRefund, upgrades, type UpgradeId, type Community } from './economy'
import { constrainPlacement, defaultPlacements, type MovableId, type Position, gardenItemDepth } from './community-placement'
import { CurrencyIcon, GardenIcon as Icon } from './icons'
import { geodeRocks, isGeode } from './geodes'
import { landscapeNames, loadGardenArt, type GardenArt } from './art'
import { drawGardenSky, gardenProjection } from './sky'
import { Link } from 'react-router'
import { Modal } from '../../ui/common'
import './garden.css'
import { WeeklyActivity } from './WeeklyActivity'
import { recordGardenDay, type GardenSnapshot } from './history'
import { PageSkeleton } from '../../ui/loading/PageSkeleton'
import type { GardenAction } from './reducer'

function ArtPreview({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { let active=true; void loadGardenArt().then(art => { if(active && ref.current) art.preview(ref.current.getContext('2d')!,id) }).catch(() => {}); return () => { active=false } }, [id])
  return <canvas ref={ref} width={64} height={64} aria-hidden="true" />
}

export function Garden() {
  const { owner, state, dispatch:dispatchGarden, refresh, earn, available } = useGarden(), community = state.community
  const [art,setArt]=useState<GardenArt|null>(null), [error,setError]=useState('')
  const [sceneReady,setSceneReady]=useState(false), [artAttempt,setArtAttempt]=useState(0)
  const [selected,setSelected]=useState<MovableId|null>(null), [preview,setPreview]=useState<{ owner: string; id: MovableId; point: Position }|null>(null)
  const [camera,setCamera]=useState({x:0,y:0,zoom:1})
  const [activityOpen,setActivityOpen]=useState(false), [historyPreview,setHistoryPreview]=useState<{day:string;snapshot:GardenSnapshot}|null>(null)
  const shownCommunity = historyPreview?.snapshot ?? community
  const activityPanel=useRef<HTMLDivElement>(null), activityTrigger=useRef<HTMLButtonElement>(null)
  const [undo,setUndo]=useState<Community[]>([])
  const [earningOpen,setEarningOpen]=useState(false)
  const dispatch=async(action:GardenAction)=>{
    const result=await dispatchGarden(action)
    if(!result.cancelled&&result.after.preview&&result.before.community!==result.after.community&&action.type!=='restore-garden'&&action.type!=='open-geode')setUndo(history=>[...history.slice(-19),structuredClone(result.before.community)])
    return result
  }
  const storeRock=async(id:UpgradeId)=>{await dispatch({type:'remove-garden-item',id})}
  const [announcement,setAnnouncement]=useState(''), [reveal,setReveal]=useState<string|null>(null)
  const [inventoryOpen,setInventoryOpen]=useState(false), [friendIsland,setFriendIsland]=useState(false)
  const canvas=useRef<HTMLCanvasElement>(null), drawer=useRef<HTMLDialogElement>(null), reset=useRef<HTMLDialogElement>(null), revealDialog=useRef<HTMLDialogElement>(null)
  const trigger=useRef<HTMLButtonElement>(null)
  const islandArt=useRef<HTMLImageElement|null>(null)
  const islandTargets=useRef<HTMLDivElement>(null)
  const inventoryGesture=useRef<number|null>(null)
  const dismissedPointer=useRef<globalThis.PointerEvent|null>(null)
  const projection=useRef({scale:1,x:0,y:0})
  const drag=useRef<{pointer:number; id:MovableId|null; start:Position; origin:Position; point:Position}|null>(null)
  const pointers=useRef(new Map<number,Position>()), pinch=useRef<{distance:number;zoom:number}|null>(null)
  useEffect(()=>{let active=true;void loadGardenArt().then(value=>{if(active)setArt(value)}).catch(()=>{if(active)setError('Garden artwork could not load. Retry to try again.')});return()=>{active=false}},[artAttempt])
  useEffect(()=>{const image=new Image();image.src='/pebble/square-garden-cutout.png';islandArt.current=image},[])
  useEffect(()=>{
    const element=canvas.current; if(!element || !art)return
    let frame=0,last=0,painted=false; const motion=window.matchMedia('(prefers-reduced-motion: reduce)')
    const draw=(time:number)=>{
      frame=requestAnimationFrame(draw); if(time-last<32)return; last=time
      try {
      const rect=element.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2)
      if(rect.width<=0||rect.height<=0)return
      const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio)
      if(element.width!==w||element.height!==h){element.width=w;element.height=h}
      const ctx=element.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=false
      const t=motion.matches?0:time/1000
      const viewCamera=activityOpen?{x:0,y:0,zoom:1}:camera
      drawGardenSky(ctx,rect.width,rect.height,ratio,t,viewCamera,islandArt.current)
      const islandLocations=[[.17,.22],[.81,.29],[.54,.15]]
      islandTargets.current?.querySelectorAll<HTMLElement>('button').forEach((target,i)=>{
        target.style.left=`${Math.round(islandLocations[i][0]*rect.width-viewCamera.x*.13)}px`
        target.style.top=`${Math.round(islandLocations[i][1]*rect.height-viewCamera.y*.08+Math.sin(t*.55+i*2)*3)}px`
      })
      const historyInset=activityOpen?rect.bottom-(activityPanel.current?.getBoundingClientRect().top??rect.bottom-220)+20:0
      const {scale,x,y}=gardenProjection(rect.width,rect.height,viewCamera,historyInset)
      projection.current={scale,x,y};ctx.setTransform(scale*ratio,0,0,scale*ratio,Math.round(x*ratio),Math.round(y*ratio))
      art.base(ctx)
      for(const id of shownCommunity.owned.filter(isLandscapeUpgrade)) if(id!=='tree-cluster') art.layer(ctx,landscapeNames[id],t)
      if(shownCommunity.owned.includes('river'))art.river(ctx,t)
      const items: {id:MovableId; x:number;y:number;width:number}[] = ['pebble' as const,...shownCommunity.owned.filter(id=>!isLandscapeUpgrade(id))].map(id=>{
        const [x,y,width]=defaultPlacements[id as MovableId]
        const point=!activityOpen&&preview?.owner===owner&&preview.id===id?preview.point:shownCommunity.positions?.[id as MovableId]??(id==='pebble'?{x:724,y:610}:{x,y})
        return {id:id as MovableId,...point,width}
      })
      const layers=[...items.map(item=>({depth:gardenItemDepth(item.id,item.y),item,tree:''})),...(shownCommunity.owned.includes('tree-cluster')?art.trees.map(tree=>({depth:tree.depth,item:null,tree:tree.id})):[])].sort((a,b)=>a.depth-b.depth)
      for(const layer of layers){
        if(layer.tree){art.layer(ctx,layer.tree,t);continue}
        const item=layer.item!; art.sprite(ctx,item.id,item.x,item.y,item.width,t)
        if(item.id==='lanterns'&&t){ctx.save();ctx.globalAlpha=.08+.05*Math.sin(t);ctx.fillStyle='#ffd977';ctx.beginPath();ctx.arc(item.x,item.y-55,20,0,Math.PI*2);ctx.fill();ctx.restore()}
      }
      if(!painted){painted=true;setSceneReady(true)}
      } catch { cancelAnimationFrame(frame);setError('Garden artwork could not be drawn. Retry to try again.') }
    };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame)
  },[art,camera,shownCommunity,activityOpen,preview,owner])
  const point=(e:PointerEvent<HTMLCanvasElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-rect.left-projection.current.x)/projection.current.scale,y:(e.clientY-rect.top-projection.current.y)/projection.current.scale}}
  const closeActivity=()=>{setActivityOpen(false);setHistoryPreview(null)}
  useEffect(()=>{
    if(!activityOpen)return
    const outside=(event:globalThis.PointerEvent)=>{if(!activityPanel.current?.contains(event.target as Node)){dismissedPointer.current=event;setActivityOpen(false);setHistoryPreview(null)}}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setActivityOpen(false);setHistoryPreview(null);requestAnimationFrame(()=>activityTrigger.current?.focus({preventScroll:true}))}}
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape)}
  },[activityOpen])
  const open=()=>{if(!sceneReady||error)return;closeActivity();setInventoryOpen(true);drawer.current?.showModal()}
  const close=()=>{drawer.current?.close();setInventoryOpen(false);trigger.current?.focus({preventScroll:true})}
  const buy=async(id:UpgradeId)=>{
    const result=await dispatch({type:'build',id}),name=upgrades.find(x=>x.id===id)?.name
    if(result.cancelled||result.before.community.owned.includes(id)||!result.after.community.owned.includes(id)){setAnnouncement(`${name} was not added. Your balance or inventory changed; check the updated garden.`);return}
    setAnnouncement(`${name} added.${result.saved?'':' Test preview only.'}`);close();if(!isLandscapeUpgrade(id)){setSelected(id as MovableId);canvas.current?.focus({preventScroll:true})}
  }
  const openGeode=async()=>{
    const result=await dispatch({type:'open-geode',random:crypto.getRandomValues(new Uint32Array(1))[0]/4294967296})
    if(result.cancelled)return
    const rock=geodeRocks.find(rock=>result.after.community.geodeUnlocks?.includes(rock.id)&&!result.before.community.geodeUnlocks?.includes(rock.id))
    if(!rock)return
    setUndo([]);setReveal(rock.id);drawer.current?.close();setInventoryOpen(false);revealDialog.current?.showModal();setAnnouncement(`${rock.name} unlocked.${result.saved?'':' Test preview only.'}`)
  }
  const endDrag=(e:PointerEvent<HTMLCanvasElement>,cancel=false)=>{
    pointers.current.delete(e.pointerId);if(pointers.current.size<2)pinch.current=null
    const current=drag.current;if(current?.pointer!==e.pointerId)return
    drag.current=null
    if(cancel || !current.id || (current.point.x===current.origin.x && current.point.y===current.origin.y)){
      setPreview(null)
      return
    }
    const drop = {owner, id:current.id, point:current.point}
    setPreview(drop)
    // Keep the drop visible through the pre-write refresh and the account write.
    // A late response must not clear a newer gesture.
    void dispatch({type:'move-community-item', id:drop.id, position:drop.point})
      .finally(()=>setPreview(visible=>visible===drop?null:visible))
  }
  const unlocked=community.geodeUnlocks??[],revealed=geodeRocks.find(rock=>rock.id===reveal)
  return <section className="garden-workspace integrated-sky-garden" aria-label="Pebble Garden">
    <header className="garden-heading"><h1 className="garden-wordmark" aria-label="Your Garden"><img src="/pebble/pebble-wordmark.svg" width="216" height="96" alt=""/></h1><button className="garden-balance" disabled={!sceneReady||!!error} onClick={()=>open()} aria-label={`Build with ${community.balance} Pebbles`}><CurrencyIcon/><strong>{community.balance.toLocaleString()}</strong></button></header>
    <button className="garden-earn-flag" aria-label="How to earn Pebbles" title="How to earn Pebbles" onClick={()=>{closeActivity();setEarningOpen(true);if(!state.preview)void refresh()}}><svg viewBox="0 0 36 44" aria-hidden="true"><path d="M3 2h30v39L18 33 3 41Z"/><path d="M18 11v10m0 6v1"/></svg>{!state.error&&!state.preview&&hasGardenReward(state.remote?.rewards)&&<span className="garden-reward-dot" role="status" aria-label="Reward available"/>}</button>
    {earningOpen&&<EarnPebbles rewards={state.remote?.rewards} disabled={!available||state.preview} claim={earn} error={state.error} refresh={()=>void refresh()} close={()=>setEarningOpen(false)}/>}
    {(state.error||state.preview)&&<div className="garden-account-notice"><p role={state.error?'alert':'status'}>{state.preview?'Test Garden preview — changes are not saved to your account.':state.error}</p><button disabled={state.pending} onClick={()=>{setUndo([]);void refresh()}}>{state.preview?'Return to saved Garden':'Refresh Garden'}</button></div>}
    {!state.storageAvailable&&!state.preview&&<p className="garden-storage-notice" role="alert">Your Garden is saved to your account. Weekly previews cannot be saved on this device.</p>}
    {state.pending&&<p className="garden-sr-only" role="status">Saving or loading your Garden…</p>}
    {error&&<div className="garden-load"><p role="alert">{error}</p><button type="button" className="btn light" onClick={()=>{setError('');setArt(null);setSceneReady(false);setArtAttempt(value=>value+1)}}>Retry Garden artwork</button></div>}
    {!sceneReady&&!error&&<PageSkeleton view="garden" label="Growing your Garden…"/>}
    <canvas ref={canvas} className="garden-canvas" style={{visibility:sceneReady&&!error?'visible':'hidden'}} data-history-day={historyPreview?.day??'present'} tabIndex={sceneReady&&!error?0:-1} aria-busy={!sceneReady} aria-label="Garden. Drag a decoration to move it; drag empty space to pan. Arrow keys move the selected item, plus and minus zoom, Escape cancels a drag." onPointerDown={e=>{
      if(!available||!sceneReady||error||activityOpen||e.nativeEvent===dismissedPointer.current||e.button!==0)return;e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId)
      pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
      if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:camera.zoom};drag.current=null;setPreview(null);return}
      const p=point(e),ids:MovableId[]=['pebble',...community.owned.filter(id=>!isLandscapeUpgrade(id)) as MovableId[]]
      const hit=ids.map(id=>{const [x,y,width]=defaultPlacements[id];const pos=community.positions?.[id]??(id==='pebble'?{x:724,y:610}:{x,y});return{id,...pos,width}}).sort((a,b)=>gardenItemDepth(b.id,b.y)-gardenItemDepth(a.id,a.y)).find(item=>p.x>=item.x-item.width/2-12&&p.x<=item.x+item.width/2+12&&p.y>=item.y-item.width*(item.id==='cave'?60/112:1)-12&&p.y<=item.y+12)
      setSelected(hit?.id??null);drag.current={pointer:e.pointerId,id:hit?.id??null,start:hit?p:{x:e.clientX,y:e.clientY},origin:hit?{x:hit.x,y:hit.y}:{x:camera.x,y:camera.y},point:hit?{x:hit.x,y:hit.y}:p}
    }} onPointerMove={e=>{
      if(!available||activityOpen)return;
      if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
      if(pinch.current&&pointers.current.size===2){const[a,b]=[...pointers.current.values()];setCamera(c=>({...c,zoom:Math.max(.7,Math.min(2.5,pinch.current!.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.current!.distance)))}));return}
      const d=drag.current;if(!d||d.pointer!==e.pointerId)return
      if(d.id){const p=point(e);d.point=constrainPlacement({x:d.origin.x+p.x-d.start.x,y:d.origin.y+p.y-d.start.y},d.id);setPreview({owner,id:d.id,point:d.point})}
      else setCamera(c=>({...c,x:Math.max(-500,Math.min(500,d.origin.x+e.clientX-d.start.x)),y:Math.max(-300,Math.min(300,d.origin.y+e.clientY-d.start.y))}))
    }} onPointerUp={e=>endDrag(e)} onPointerCancel={e=>endDrag(e,true)} onKeyDown={e=>{
      if(activityOpen||state.error||(!state.remote&&!state.preview))return;
      if(e.key==='Escape'){drag.current=null;setPreview(null);setSelected(null);return}
      if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();setCamera(c=>({...c,zoom:Math.max(.7,Math.min(2.5,c.zoom+(e.key==='-'?-.1:.1)))}));return}
      if(selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();void dispatch({type:'nudge-community-item',id:selected,delta:{x:e.key==='ArrowLeft'?-12:e.key==='ArrowRight'?12:0,y:e.key==='ArrowUp'?-12:e.key==='ArrowDown'?12:0}})}
    }}/>
    <div ref={islandTargets} className="garden-friend-islands" aria-label="Illustrative friend islands">{[0,1,2].map(i=><button disabled={!sceneReady||!!error} key={i} className={`garden-friend-island island-${i}`} aria-label="An island for a future friend" onClick={()=>setFriendIsland(true)}/>)}</div>
    {friendIsland&&<Modal title="Room for a new friend" close={()=>setFriendIsland(false)}><img className="garden-friend-preview" src="/pebble/square-garden-cutout.png" alt="Illustrative pixel garden"/><p>A little island is waiting. Meet someone new and grow your worlds together.</p><p className="mini muted">An illustration, not another person's private Garden.</p><Link className="btn" to="/matchmaking?mode=friends">Discover people</Link></Modal>}
    {selected&&!activityOpen&&<div className="garden-selection" role="group" aria-label="Selected Garden item"><span>{selected==='pebble'?'Your Pebble':upgrades.find(item=>item.id===selected)?.name}</span>{selected!=='pebble'&&<button disabled={!available} onClick={async()=>{if(!(await dispatch({type:'remove-garden-item',id:selected as UpgradeId})).cancelled)setSelected(null)}}>{isGeode(selected)?'Return to inventory':'Remove & refund'}</button>}<button aria-label="Deselect item" onClick={()=>setSelected(null)}><Icon name="close"/></button></div>}
    <div ref={activityPanel} className="garden-bottom">
      {activityOpen ? <WeeklyActivity owner={owner} community={community} preview={historyPreview?.day??null} onPreview={setHistoryPreview} close={()=>{closeActivity();requestAnimationFrame(()=>activityTrigger.current?.focus({preventScroll:true}))}}/> :
        <button ref={activityTrigger} disabled={!sceneReady||!!error} className="garden-activity" aria-label="Open weekly Garden activity" aria-expanded={false} onClick={()=>{if(state.storageAvailable&&!state.preview)recordGardenDay(owner,community);setSelected(null);setPreview(null);drag.current=null;pointers.current.clear();setActivityOpen(true)}}><Icon name="history"/><span>Weekly Activity</span></button>}
    </div>
    <div className="garden-inventory-dock"><button ref={trigger} disabled={!sceneReady||!!error} className="garden-build" onClick={()=>open()} aria-label="Open Garden inventory" aria-expanded={inventoryOpen} aria-controls="garden-inventory-panel" onPointerDown={e=>{inventoryGesture.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(inventoryGesture.current!==null&&inventoryGesture.current-e.clientY>25){inventoryGesture.current=null;open()}}} onPointerUp={()=>{inventoryGesture.current=null}} onPointerCancel={()=>{inventoryGesture.current=null}}><span className="garden-inventory-handle"/><Icon name="build"/></button></div>
    <p className="garden-sr-only" role="status">{announcement}</p>
    <dialog ref={drawer} id="garden-inventory-panel" className="garden-drawer" aria-labelledby="garden-drawer-title" onCancel={e=>{e.preventDefault();close()}}>
      <span className="garden-inventory-handle" aria-hidden="true"/>
      <header><h2 id="garden-drawer-title">Your garden</h2><button aria-label="Close Garden inventory" onClick={close}><Icon name="close"/></button></header>
      <div className="garden-build-meta"><span><CurrencyIcon/> {community.balance.toLocaleString()} Pebbles available</span><button onClick={()=>{close();canvas.current?.focus({preventScroll:true})}}>Arrange garden</button></div>
      <div className="garden-drawer-body">
        {state.error&&<div><p role="alert">{state.error}</p><button disabled={state.pending} onClick={()=>void refresh()}>Refresh Garden</button></div>}

        <details className="garden-build-section">
          <summary aria-label="Random Pebbles"><Icon name="random"/><span>Random Pebbles</span><small>{unlocked.length} / 4</small><Icon name="down"/></summary>
          <article className="garden-shop-item"><img src="/garden/geodes/mystery-geode.svg" width="64" height="64" alt="Cracked rock with a question mark"/><div><strong>Random pebble</strong><small>300 Pebbles · No duplicates</small></div><button disabled={!available||unlocked.length===4||community.balance<300} onClick={openGeode}>{unlocked.length===4?'Complete':'Open'}</button></article>
          <p className="garden-hint">One new friend inside. Yours to keep through Garden resets.</p>
          {geodeRocks.map(rock=><article className="garden-shop-item" key={rock.id}><ArtPreview id={rock.id}/><div><strong>{rock.name}</strong><small>{rock.mood} · {unlocked.includes(rock.id)?community.owned.includes(rock.id)?'In Garden':'Owned':'Locked'}</small></div>{unlocked.includes(rock.id)&&<button disabled={!available} onClick={()=>community.owned.includes(rock.id)?storeRock(rock.id):buy(rock.id)}>{community.owned.includes(rock.id)?'Store':'Place'}</button>}</article>)}
        </details>
        {buildSections.map(section=><details className="garden-build-section" key={section.name}>
          <summary aria-label={section.name}><Icon name={section.icon}/><span>{section.name}</span><small>{section.items.length}</small><Icon name="down"/></summary>
          {section.items.map(item=><article className="garden-shop-item" key={item.id}><ArtPreview id={item.id}/><div><strong>{item.name}</strong><small>{item.cost} Pebbles{isLandscapeUpgrade(item.id)?' · Fixed landscape':''}</small></div><button disabled={!available||community.owned.includes(item.id)||community.balance<item.cost} onClick={()=>buy(item.id)}>{community.owned.includes(item.id)?'Owned':'Build'}</button></article>)}
        </details>)}
        <details className="garden-keyboard-help"><summary>Arrange with keyboard</summary><p>Select an item, then use the arrow keys on the Garden.</p>{['pebble',...community.owned.filter(id=>!isLandscapeUpgrade(id))].map(id=><button key={id} onClick={()=>{setSelected(id as MovableId);close();canvas.current?.focus({preventScroll:true})}}>Move {id}</button>)}</details>
      </div><footer className="garden-build-footer">
        <div className="garden-tools">
          <button aria-label="Undo Garden change" disabled={!available||!(state.preview?undo.length:(state.remote?.canUndo&&state.undoRevision===state.remote.revision))} onClick={async()=>{const result=await dispatch({type:'restore-garden',community:undo.at(-1)??community});if(result.cancelled||result.before.community===result.after.community){setUndo([]);setAnnouncement('Garden changed. Nothing was undone.');return}setUndo(history=>history.slice(0,-1));setSelected(null);setAnnouncement('Garden change undone.')}}><Icon name="back"/><span>Undo</span></button>
          <button aria-label="Reset Garden view" onClick={()=>{setCamera({x:0,y:0,zoom:1});close()}}><Icon name="refresh"/><span>Reset view</span></button>
          <button disabled={!available||(!community.owned.length&&!Object.keys(community.positions??{}).length)} onClick={()=>reset.current?.showModal()}><Icon name="reset"/><span>Reset Garden</span></button>
        </div><small>{state.preview?'Test preview · Not saved':state.error?'Account save unconfirmed':state.pending?'Syncing…':state.remote?'Saved to your account':'Account Garden unavailable'}</small>
      </footer>
    </dialog>
    <dialog ref={reset} className="garden-confirm" aria-labelledby="garden-reset-title"><h2 id="garden-reset-title">Start with a little space?</h2><p>Remove placed items and refund {purchaseRefund(community)} Pebbles. Collected Pebbles return to inventory for free. Their unlocks stay collected.</p><div><button autoFocus onClick={()=>reset.current?.close()}>Cancel</button><button disabled={!available} onClick={async()=>{if((await dispatch({type:'reset-purchases'})).cancelled)return;setSelected(null);setCamera({x:0,y:0,zoom:1});reset.current?.close();setAnnouncement('Garden reset. Collected Pebbles kept.')}}>Reset Garden</button></div></dialog>
    <dialog ref={revealDialog} className="garden-reveal" aria-labelledby="garden-reveal-title" onClose={()=>{setReveal(null);open()}}>{revealed&&<><p>A little discovery</p><ArtPreview id={revealed.id}/><h2 id="garden-reveal-title">{revealed.name}</h2><p>{revealed.description}</p><button className="btn" onClick={()=>revealDialog.current?.close()}>Keep in inventory</button></>}</dialog>
  </section>
}
