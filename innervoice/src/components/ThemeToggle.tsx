import { useTheme } from '../ThemeContext'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggle}
      className="rounded-full border border-border p-2 text-text-secondary transition-colors hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
    >
      {theme === 'dark' ? 'Sun' : 'Moon'}
    </button>
  )
}
