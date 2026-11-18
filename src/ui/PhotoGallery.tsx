import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type PointerEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { profilePhotoLimit, type ProfileGalleryState } from '../../shared/profile-photo'
import { usePhotoCaptions, usePhotoGallery, usePhotoSlot } from '../features/account/usePhotoGallery'
import { contactDetailsHint, photoCaptionLimit } from '../../shared/profile-prompts'
import { toast } from './feedback'
import { photoChangedEvent } from '../features/account/useProfilePhoto'
import { useCurrent } from './current'
import { ActionButton, ErrorMessage, Modal, PersonPhoto, ResourceState } from './common'
import { MediaImage } from './loading/MediaImage'
import { haptic } from './feedback'
import './photo-gallery.css'

export function DiscoverPhotos({ id, name, revision, fallback, active }: {
  id: string; name: string; revision?: number; fallback: string | null; active: boolean
}) {
  const token = useCurrent().session.access_token
  // Check metadata for the visible card only. The primary portrait still uses
  // the existing avatar cache and works with legacy single-photo accounts.
  const { query } = usePhotoGallery(id, active && (revision === undefined || revision > 0))
  const gallery = query.isError ? undefined : query.data
  return <DiscoverPhotoViewer key={`${gallery?.revision ?? revision ?? 'unknown'}:${gallery?.count ?? 1}`}
    owner={id} name={name} token={token} gallery={gallery} revision={revision} fallback={fallback} active={active}/>
}

function DiscoverPhotoViewer({ owner, name, token, gallery, revision, fallback, active }: {
  owner: string; name: string; token: string; gallery?: ProfileGalleryState;
  revision?: number; fallback: string | null; active: boolean
}) {
  const [position, setPosition] = useState(1)
  const count = gallery?.count ?? 1
  const slot = usePhotoSlot(token, owner, gallery?.revision ?? 0, position, active && position > 1)
  const captions = usePhotoCaptions(owner, gallery?.revision ?? revision, active)
  const caption = captions.data?.captions[position - 1] ?? null
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null)
  const instructions = useId()
  function step(delta: number) {
    setPosition(before => Math.max(1, Math.min(count, before + delta)))
  }

  return <div className="discovery-photo-viewer" data-swipe={count > 1 || undefined}
    role={count > 1 ? 'group' : undefined} aria-label={count > 1 ? `${name}’s photos` : undefined}
    aria-describedby={count > 1 ? instructions : undefined} tabIndex={count > 1 ? 0 : undefined}
    onDragStart={event => event.preventDefault()}
    onPointerDown={event => {
      if (count < 2 || !event.isPrimary || event.button !== 0) return
      swipe.current = { id:event.pointerId, x:event.clientX, y:event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerUp={event => {
      const start = swipe.current
      if (!start || start.id !== event.pointerId) return
      swipe.current = null
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.25) step(dx < 0 ? 1 : -1)
    }}
    onLostPointerCapture={() => { swipe.current = null }}
    onKeyDown={event => {
      if (count < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }}>
    {position === 1
      ? <PersonPhoto id={owner} name={name} revision={gallery?.revision ?? revision} fallback={fallback} large/>
      : slot.data?.url && !slot.isError
        ? <MediaImage src={slot.data.url} className="portrait large-avatar" alt={`${name}, photo ${position}`}/>
        : <div className="discovery-photo-status" role="status">{slot.isError ? 'Photo unavailable' : 'Loading photo…'}</div>}
    {caption && <p className={`photo-caption ${count > 1 ? 'below-progress' : ''}`} key={`${position}:${caption}`}>{caption}</p>}
    {count > 1 && <>
      <div className="discover-photo-progress" aria-label={`Photo ${position} of ${count}`} aria-live="polite">
        <span className="sr-only">{`Photo ${position} of ${count}`}</span>
        {Array.from({ length: count }, (_, i) => <span key={i} aria-hidden="true" className={i+1 === position ? 'current' : ''}/>)}
      </div>
      <span className="sr-only" id={instructions}>Swipe or use the left and right arrow keys to change photos.</span>
    </>}
  </div>
}

type PhotoDrag = {
  id: number; position: number; revision: number; x: number; y: number; image?: string;
  active: boolean; target: number | null;
}

function GalleryPhoto({ token, owner, revision, position, thumbnail }: {
  token: string; owner: string; revision: number; position: number; thumbnail?: ButtonHTMLAttributes<HTMLButtonElement>
}) {
  const slot = usePhotoSlot(token, owner, revision, position)
  if (!slot.data?.url || slot.isError) return <div className={thumbnail ? 'gallery-thumbnail' : 'gallery-full-photo'}>
    <span role="status">{slot.isError ? 'Photo unavailable' : 'Loading…'}</span>
  </div>
  const image = <MediaImage src={slot.data.url} alt={`Photo ${position}`} draggable={false}/>
  return thumbnail
    ? <button type="button" className="gallery-thumbnail" aria-label={`Preview photo ${position}`}
        aria-haspopup="dialog" {...thumbnail}>{image}{position === 1 && <span className="gallery-main-badge" aria-hidden="true">Main</span>}</button>
    : <div className="gallery-full-photo">{image}</div>
}

export function PhotoGalleryEditor({ close }: { close: () => void }) {
  const busy = useRef(false)
  return <Modal title="Profile photos" className="photo-gallery-modal" close={() => { if (!busy.current) close() }}>
    <PhotoGalleryPanel busyRef={busy}/>
  </Modal>
}

// The same photo manager, used in the dialog and directly on the Profile page.
export function PhotoGalleryPanel({ inline = false, busyRef }: { inline?: boolean; busyRef?: { current: boolean } }) {
  const { session } = useCurrent()
  const owner = session.user.id, token = session.access_token
  const { query, client } = usePhotoGallery(owner)
  const cache = useQueryClient()
  const [selection, setSelection] = useState<{ file: File; url: string } | null>(null)
  const [preview, setPreview] = useState<{ position: number; revision: number } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reconcile, setReconcile] = useState(false)
  const [error, setError] = useState('')
  const [dragPreview, setDragPreview] = useState<PhotoDrag | null>(null)
  const drag = useRef<PhotoDrag | null>(null)
  const grid = useRef<HTMLOListElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const suppressTap = useRef(false)
  const [announcement, setAnnouncement] = useState('')
  const dragInstructions = useId()
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  const url = selection?.url
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const state = query.data
  const disabled = busy || reconcile || !state || query.isError || query.isFetching

  function select(file: File) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG or WebP photo up to 5 MB.')
      return
    }
    setError('')
    setSelection({ file, url: URL.createObjectURL(file) })
  }

  async function edit(change: { action: 'append'; file: File } | { action: 'move'; position: number; toPosition: number } | { action: 'remove'; position: number }) {
    if (!client || !state || disabled || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const next = change.action === 'append'
        ? await client.append(change.file, state.revision)
        : await client.editGallery({ ...change, expectedRevision: state.revision, requestId: crypto.randomUUID() })
      const count = state.count + (change.action === 'append' ? 1 : change.action === 'remove' ? -1 : 0)
      if (next.revision !== state.revision+1 || next.count !== count) throw new Error('Photo change could not be confirmed.')
      cache.setQueryData(['profile-photo', owner, 'gallery'], next)
      window.dispatchEvent(new CustomEvent(photoChangedEvent, {detail:owner}))
      if (change.action === 'append') setSelection(null)
      if (change.action === 'move') {
        setAnnouncement(`Photo moved to position ${change.toPosition}.`)
        setPreview(null)
      }
      if (change.action === 'remove') setPreview(null)
      setRemoving(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Photo change could not be confirmed.')
      setReconcile(true)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function dropTarget(x: number, y: number) {
    const tile = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-gallery-position]')
    return tile && grid.current?.contains(tile) ? Number(tile.dataset.galleryPosition) : null
  }

  function startHold(event: PointerEvent<HTMLButtonElement>, position: number) {
    if (!event.isPrimary || event.button !== 0) return
    suppressTap.current = false
    if (disabled || !state || state.count < 2) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      id:event.pointerId, position, revision:state.revision, x:event.clientX, y:event.clientY,
      image:event.currentTarget.querySelector('img')?.src, active:false, target:position,
    }
    holdTimer.current = setTimeout(() => {
      const pressed = drag.current
      if (!pressed) return
      suppressTap.current = true
      const active = { ...pressed, active:true }
      drag.current = active
      setDragPreview(active)
      haptic('light')
    }, 600)
  }

  function cancelDrag() {
    clearTimeout(holdTimer.current)
    drag.current = null
    setDragPreview(null)
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const pressed = drag.current
    if (!pressed || pressed.id !== event.pointerId) return
    if (!pressed.active) {
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 8) {
        suppressTap.current = true
        cancelDrag()
      }
      return
    }
    const current = { ...pressed, x:event.clientX, y:event.clientY, target: dropTarget(event.clientX,event.clientY) }
    drag.current = current
    setDragPreview(current)
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const pressed = drag.current
    if (!pressed || pressed.id !== event.pointerId) return
    const toPosition = dropTarget(event.clientX,event.clientY)
    cancelDrag()
    if (pressed.active && pressed.revision === state?.revision && toPosition && toPosition !== pressed.position)
      void edit({ action:'move', position:pressed.position, toPosition })
  }

  // Let a normal touch scroll. Only a held tile takes over the gesture.
  useEffect(() => {
    const element = panel.current
    function keepDragOnPhoto(event: TouchEvent) {
      if (drag.current?.active && event.cancelable) event.preventDefault()
    }
    element?.addEventListener('touchmove', keepDragOnPhoto, { passive:false })
    return () => {
      element?.removeEventListener('touchmove', keepDragOnPhoto)
      clearTimeout(holdTimer.current)
    }
  }, [])

  // Scroll at the edges so the offscreen row is reachable while holding a photo.
  const isDragging = dragPreview !== null
  useEffect(() => {
    if (!isDragging) return
    let frame: number
    const sheet = grid.current?.closest('dialog')
    const scroller = sheet ?? document.scrollingElement
    function scroll() {
      const pointer = drag.current
      if (!pointer || !scroller) return
      const { top, bottom } = sheet?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight - 76 }
      const y = pointer.y
      const direction = y >= top && y < top + 56 ? -1 : y <= bottom && y > bottom - 56 ? 1 : 0
      if (direction) {
        const before = scroller.scrollTop
        scroller.scrollBy({top: direction * 8, behavior: 'instant'})
        if (before !== scroller.scrollTop) setDragPreview({ ...pointer, target: dropTarget(pointer.x, pointer.y) })
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(frame)
  }, [isDragging])

  async function reload() {
    const result = await query.refetch()
    if (result.isSuccess) {
      setReconcile(false)
      setError('')
      setPreview(null)
      setRemoving(false)
      setSelection(null)
    }
  }

  useEffect(() => { if (busyRef) busyRef.current = busy })
  const addPhoto = !selection && !removing && state && state.count < profilePhotoLimit
    ? <ActionButton secondary={inline} disabled={disabled} onClick={() => input.current?.click()}>Add photo</ActionButton>
    : null
  return <div ref={panel} className={`photo-gallery-panel ${inline ? 'photo-gallery-inline' : ''}`}>
    {!inline && <p className="photo-gallery-note">Add up to four photos. The first is your profile photo and appears first in Friends and Dating.</p>}
    <span className="sr-only" role="status">{announcement}</span>
    <ResourceState loading={query.isPending} error={query.isError ? 'Your photos couldn’t be loaded.' : ''} reload={() => void reload()}/>
    {state && <>
      <div className="photo-gallery-toolbar">
        <div className="photo-gallery-count" role="status">{state.count} of {profilePhotoLimit} photos</div>
        {inline && addPhoto}
      </div>
      {state.count > 0 && <p className="photo-gallery-reorder-note">
        Tap a photo to preview.{state.count > 1 && ' Hold and drag to reorder.'}
        {state.count > 1 && <span id={dragInstructions} className="sr-only"> Use the arrow keys on a photo to move it.</span>}
      </p>}
      {state.count > 0 && <ol ref={grid} className="photo-gallery-grid">
        {Array.from({ length: state.count }, (_, index) => {
          const position = index+1
          return <li key={position} data-gallery-position={position}
            className={dragPreview?.position === position ? 'drag-source' : dragPreview?.target === position ? 'drop-target' : undefined}>
            <GalleryPhoto token={token} owner={owner} revision={state.revision} position={position} thumbnail={{
              'aria-describedby':state.count > 1 ? dragInstructions : undefined,
              onClick: event => {
                if (event.detail !== 0 && suppressTap.current) return
                setRemoving(false)
                setPreview({ position, revision:state.revision })
              },
              onPointerDown: event => startHold(event,position),
              onPointerMove: moveDrag,
              onPointerUp: finishDrag,
              onPointerCancel: cancelDrag,
              onLostPointerCapture: cancelDrag,
              onContextMenu: event => event.preventDefault(),
              onKeyDown: event => {
                if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
                event.preventDefault()
                const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
                const toPosition = position + delta
                if (toPosition >= 1 && toPosition <= state.count) void edit({ action:'move', position, toPosition })
              },
            }}/>
          </li>
        })}
      </ol>}
      {dragPreview?.image && <img src={dragPreview.image} alt="" className="photo-gallery-drag-preview"
        style={{ left:dragPreview.x, top:dragPreview.y }} draggable={false}/>}
      {selection && <div className="photo-gallery-selection">
        <img src={selection.url} alt="New photo preview"/>
        <div>
          <ActionButton disabled={disabled || state.count >= profilePhotoLimit} onClick={() => void edit({action:'append',file:selection.file})}>{busy ? 'Uploading…' : 'Upload photo'}</ActionButton>
          <ActionButton secondary disabled={busy} onClick={() => setSelection(null)}>Cancel</ActionButton>
        </div>
      </div>}
      {!inline && addPhoto}
      <input hidden aria-label="Choose a gallery photo" ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) select(file)
      }}/>
    </>}
    {!preview && <ErrorMessage>{error}</ErrorMessage>}
    {reconcile && !preview && <ActionButton secondary disabled={query.isFetching} onClick={() => void reload()}>Reload photos</ActionButton>}
    {preview && <Modal variant="sheet" className="photo-preview-modal"
      title={preview.position === 1 ? 'Profile photo' : `Photo ${preview.position}`}
      close={() => { if (!lock.current) { setPreview(null); setRemoving(false) } }}>
      {state?.revision === preview.revision
        ? <GalleryPhoto token={token} owner={owner} revision={preview.revision} position={preview.position}/>
        : <p role="status">Your photos changed. Reload to see the current order.</p>}
      {state?.revision === preview.revision && <div className="photo-preview-actions">
        {removing ? <>
          <p role="status">{preview.position === 1 ? 'Remove your current profile photo?' : `Remove photo ${preview.position}?`}</p>
          <ActionButton disabled={disabled} onClick={() => void edit({ action:'remove', position:preview.position })}>
            {busy ? 'Removing…' : 'Confirm removal'}
          </ActionButton>
          <ActionButton secondary disabled={busy} onClick={() => setRemoving(false)}>Cancel</ActionButton>
        </> : <>
          {preview.position !== 1 &&
            <ActionButton disabled={disabled} onClick={() => void edit({ action:'move', position:preview.position, toPosition:1 })}>
              {busy ? 'Saving…' : 'Make profile photo'}
            </ActionButton>}
          <ActionButton secondary disabled={disabled} onClick={() => setRemoving(true)}>Remove photo</ActionButton>
        </>}
      </div>}
      {state?.revision === preview.revision && !removing &&
        <PhotoCaptionEditor key={`${preview.revision}:${preview.position}`} owner={owner} revision={preview.revision} position={preview.position} disabled={disabled}/>}
      <ErrorMessage>{error}</ErrorMessage>
      {(reconcile || query.isError || state?.revision !== preview.revision) &&
        <ActionButton secondary disabled={query.isFetching || busy} onClick={() => void reload()}>Reload photos</ActionButton>}
    </Modal>}
  </div>
}

// Optional caption for one photo. It stays with the photo when photos move.
function PhotoCaptionEditor({ owner, revision, position, disabled }: { owner: string; revision: number; position: number; disabled: boolean }) {
  const { client } = usePhotoGallery(owner, false)
  const cache = useQueryClient()
  const captions = usePhotoCaptions(owner, revision)
  const saved = captions.data?.captions[position - 1] ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const value = draft ?? saved
  const hint = contactDetailsHint(value)
  const changed = draft !== null && draft.trim() !== saved
  const canSave = !disabled && !saving && !captions.isPending && !captions.isError && changed
  async function save() {
    if (!client || !canSave) return
    setSaving(true)
    setError('')
    try {
      const next = await client.saveCaption({ expectedRevision: revision, position, caption: value.trim() })
      cache.setQueryData(['profile-photo', owner, 'captions', revision], next)
      setDraft(null)
      haptic('success')
      toast(value.trim() ? 'Caption saved' : 'Caption removed')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Caption could not be saved.')
    } finally { setSaving(false) }
  }
  return <div className="photo-caption-editor">
    <label htmlFor={`photo-caption-${position}`}>Caption <span>(optional)</span></label>
    <div className="photo-caption-row">
      <input id={`photo-caption-${position}`} maxLength={photoCaptionLimit} placeholder="Add a short caption" value={value}
        disabled={disabled || saving || captions.isPending || captions.isError} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save() } }}/>
      <ActionButton disabled={!canSave} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</ActionButton>
    </div>
    <div className="photo-caption-meta"><span>{hint}</span><span>{value.length}/{photoCaptionLimit}</span></div>
    {captions.isError && <p className="account-note">Captions couldn’t be loaded.</p>}
    <ErrorMessage>{error}</ErrorMessage>
  </div>
}
