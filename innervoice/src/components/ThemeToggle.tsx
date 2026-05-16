import { useTheme } from '../ThemeContext'
import { MoonStar, SunMedium } from 'lucide-react'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggle}
      className="rounded-full border border-border bg-elevated p-2 text-text-secondary transition-all hover:border-red-500/60 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {theme === 'dark' ? <SunMedium size={18} /> : <MoonStar size={18} />}
    </button>
  )
}
