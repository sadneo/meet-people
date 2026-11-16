import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { profilePhotoLimit, type ProfileGalleryState } from '../../shared/profile-photo'
import { usePhotoGallery, usePhotoSlot } from '../features/account/usePhotoGallery'
import { photoChangedEvent } from '../features/account/useProfilePhoto'
import { useCurrent } from './current'
import { ActionButton, ErrorMessage, Icon, Modal, PersonPhoto, ResourceState } from './common'
import { MediaImage } from './loading/MediaImage'
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
  moved: boolean; target: number | null;
}

function GalleryThumbnail({ token, owner, revision, position }: {
  token: string; owner: string; revision: number; position: number
}) {
  const slot = usePhotoSlot(token, owner, revision, position)
  return <div className="gallery-thumbnail">
    {slot.data?.url && !slot.isError
      ? <MediaImage src={slot.data.url} alt={`Photo ${position}`}/>
      : <span role="status">{slot.isError ? 'Photo unavailable' : 'Loading…'}</span>}
  </div>
}

export function PhotoGalleryEditor({ close }: { close: () => void }) {
  const { session } = useCurrent()
  const owner = session.user.id, token = session.access_token
  const { query, client } = usePhotoGallery(owner)
  const cache = useQueryClient()
  const [selection, setSelection] = useState<{ file: File; url: string } | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [reconcile, setReconcile] = useState(false)
  const [error, setError] = useState('')
  const [dragPreview, setDragPreview] = useState<PhotoDrag | null>(null)
  const drag = useRef<PhotoDrag | null>(null)
  const grid = useRef<HTMLOListElement>(null)
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
      if (change.action === 'move') setAnnouncement(`Photo moved to position ${change.toPosition}.`)
      setRemoving(null)
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

  function startDrag(event: PointerEvent<HTMLButtonElement>, position: number) {
    if (disabled || !state || !event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const image = event.currentTarget.closest('li')?.querySelector('img')?.src
    drag.current = {
      id:event.pointerId, position, revision:state.revision, x:event.clientX, y:event.clientY,
      image, moved:false, target:position,
    }
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start || start.id !== event.pointerId) return
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return
    const current = { ...start, moved:true, x:event.clientX, y:event.clientY, target: dropTarget(event.clientX,event.clientY) }
    drag.current = current
    setDragPreview(current)
  }

  function cancelDrag() {
    drag.current = null
    setDragPreview(null)
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const started = drag.current
    if (!started || started.id !== event.pointerId) return
    const toPosition = dropTarget(event.clientX,event.clientY)
    cancelDrag()
    if (started.moved && started.revision === state?.revision && toPosition && toPosition !== started.position)
      void edit({ action:'move', position:started.position, toPosition })
  }

  // Touch dragging owns the gesture on the handle. Scroll the sheet at its
  // edges so the bottom row can still be reached on shorter phones.
  const isDragging = dragPreview !== null
  useEffect(() => {
    if (!isDragging) return
    let frame: number
    const sheet = grid.current?.closest('dialog')
    function scroll() {
      const pointer = drag.current
      if (!pointer || !sheet) return
      const { top, bottom } = sheet.getBoundingClientRect()
      const y = pointer.y
      const direction = y >= top && y < top + 56 ? -1 : y <= bottom && y > bottom - 56 ? 1 : 0
      if (direction) {
        const before = sheet.scrollTop
        sheet.scrollTop += direction * 8
        if (before !== sheet.scrollTop) setDragPreview({ ...pointer, target: dropTarget(pointer.x, pointer.y) })
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
      setRemoving(null)
      setSelection(null)
    }
  }

  return <Modal title="Profile photos" className="photo-gallery-modal" close={() => { if (!lock.current) close() }}>
    <p className="photo-gallery-note">Add up to four photos. The first is your profile photo and appears first in Friends and Dating.</p>
    <span className="sr-only" role="status">{announcement}</span>
    <ResourceState loading={query.isPending} error={query.isError ? 'Your photos couldn’t be loaded.' : ''} reload={() => void reload()}/>
    {state && <>
      <div className="photo-gallery-count" role="status">{state.count} of {profilePhotoLimit} photos</div>
      {state.count > 1 && <p className="photo-gallery-reorder-note">
        Drag a handle to reorder your photos.
        <span id={dragInstructions} className="sr-only"> Use the arrow keys on a handle to move its photo.</span>
      </p>}
      <ol ref={grid} className="photo-gallery-grid">
        {Array.from({ length: state.count }, (_, index) => {
          const position = index+1
          return <li key={position} data-gallery-position={position}
            className={dragPreview?.position === position ? 'drag-source' : dragPreview?.target === position ? 'drop-target' : undefined}>
            <GalleryThumbnail token={token} owner={owner} revision={state.revision} position={position}/>
            <div className="photo-gallery-position">{position === 1 ? 'Profile photo' : `Photo ${position}`}</div>
            <div className="photo-gallery-controls">
              {state.count > 1 && <button type="button" className="btn light photo-drag-handle" disabled={disabled}
                aria-label={`Reorder photo ${position}`} aria-describedby={dragInstructions}
                onPointerDown={event => startDrag(event,position)} onPointerMove={moveDrag} onPointerUp={finishDrag}
                onLostPointerCapture={cancelDrag}
                onKeyDown={event => {
                  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
                  event.preventDefault()
                  const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
                  const toPosition = position + delta
                  if (toPosition >= 1 && toPosition <= state.count) void edit({ action:'move', position, toPosition })
                }}>
                <Icon name="DragHandle"/>
              </button>}
              <button type="button" aria-label={`Remove photo ${position}`} title="Remove photo" className="btn light" disabled={disabled} onClick={() => { setRemoving(position); setSelection(null) }}><Icon name="Skip"/></button>
            </div>
          </li>
        })}
      </ol>
      {dragPreview?.image && <img src={dragPreview.image} alt="" className="photo-gallery-drag-preview"
        style={{ left:dragPreview.x, top:dragPreview.y }} draggable={false}/>}
      {removing !== null && <div className="photo-gallery-confirm">
        <p>Remove {removing === 1 ? 'your current profile photo' : `photo ${removing}`}?</p>
        <ActionButton secondary disabled={busy} onClick={() => setRemoving(null)}>Cancel</ActionButton>
        <ActionButton disabled={disabled} onClick={() => void edit({action:'remove',position:removing})}>Remove photo</ActionButton>
      </div>}
      {selection && <div className="photo-gallery-selection">
        <img src={selection.url} alt="New photo preview"/>
        <div>
          <ActionButton disabled={disabled || state.count >= profilePhotoLimit} onClick={() => void edit({action:'append',file:selection.file})}>{busy ? 'Uploading…' : 'Upload photo'}</ActionButton>
          <ActionButton secondary disabled={busy} onClick={() => setSelection(null)}>Cancel</ActionButton>
        </div>
      </div>}
      {!selection && removing === null && state.count < profilePhotoLimit && <ActionButton disabled={disabled} onClick={() => input.current?.click()}>Add photo</ActionButton>}
      <input hidden aria-label="Choose a gallery photo" ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) select(file)
      }}/>
    </>}
    <ErrorMessage>{error}</ErrorMessage>
    {reconcile && <ActionButton secondary disabled={query.isFetching} onClick={() => void reload()}>Reload photos</ActionButton>}
  </Modal>
}
