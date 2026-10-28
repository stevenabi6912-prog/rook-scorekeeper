import { useEffect, useState } from 'react'

/*
 * Light, dark, or whatever the phone is set to. Stored per phone; applied as
 * data-theme on <html>, which the stylesheet reads. Light is the default: it
 * is the look the family picked, and a phone set to dark can still choose it.
 */

export type Theme = 'light' | 'dark' | 'auto'

const KEY = 'rook.theme'
const BAR_LIGHT = '#1b3a5c'
const BAR_DARK = '#122236'

export const THEME_LABELS: Record<Theme, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' }

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'auto' ? v : 'light'
  } catch {
    return 'light'
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
}

/** Whether the screen ends up dark for this choice on a phone whose own setting is `systemDark`. */
export function isDark(theme: Theme, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'auto' && systemDark)
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(theme, systemDark) ? BAR_DARK : BAR_LIGHT)
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'auto' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])
  return [
    theme,
    (next) => {
      saveTheme(next)
      setTheme(next)
    },
  ]
}
