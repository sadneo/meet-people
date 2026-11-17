import { useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNative } from '../platform/native'

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

type HapticKind = 'light' | 'medium' | 'success' | 'warning'

// Native-only, best effort. Browsers get no vibration so desktop and web stay quiet.
export function haptic(kind: HapticKind = 'light') {
  if (!isNative()) return
  const run = kind === 'success' || kind === 'warning'
    ? Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning })
    : Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light })
  void run.catch(() => undefined)
}

export type Toast = { id: number; message: string; tone: 'default' | 'error' }
export const toastEvent = 'pebble:toast'
let nextToast = 1

// Confirms a completed action only. Errors that need a decision stay inline.
export function toast(message: string, tone: Toast['tone'] = 'default') {
  window.dispatchEvent(new CustomEvent<Toast>(toastEvent, { detail: { id: nextToast++, message, tone } }))
}

// A short horizontal shake draws the eye to a failed submit without moving focus.
export function useShakeOnError(target: { current: HTMLElement | null }, error: string | null | undefined) {
  useEffect(() => {
    const element = target.current
    if (!error || !element || prefersReducedMotion() || typeof element.animate !== 'function') return
    haptic('warning')
    element.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
      { duration: 380, easing: 'ease-in-out' },
    )
  }, [target, error])
}
