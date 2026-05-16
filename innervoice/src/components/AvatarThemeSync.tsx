import { useEffect } from 'react'
import { useAuth } from '../AuthContext'
import { applyAvatarTheme, clearAvatarTheme, extractPaletteFromDataUrl } from '../lib/avatarPalette'
import { useTheme } from '../ThemeContext'

/** Applies profile-photo palette to CSS variables when enabled. */
export function AvatarThemeSync() {
  const { user, updateProfile } = useAuth()
  const { theme } = useTheme()

  useEffect(() => {
    if (!user?.themeFromAvatar || !user.avatarUrl) {
      clearAvatarTheme()
      return
    }

    if (user.avatarTheme) {
      applyAvatarTheme(user.avatarTheme, theme)
      return () => clearAvatarTheme()
    }

    let cancelled = false
    void extractPaletteFromDataUrl(user.avatarUrl).then((palette) => {
      if (cancelled) return
      applyAvatarTheme(palette, theme)
      void updateProfile({
        name: user.name,
        themeFromAvatar: true,
        avatarTheme: palette,
      })
    })

    return () => {
      cancelled = true
      clearAvatarTheme()
    }
  }, [theme, updateProfile, user])

  return null
}
