import type { ReactNode } from 'react'
import { AudioLines, Clock, LogOut, MessageCircle, Mic2, User, UserPlus } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { ProfileAvatar } from './ProfileAvatar'
import { ThemeToggle } from './ThemeToggle'
import type { AppStep } from '../types'

interface Props {
  step: AppStep
  hasHistory: boolean
  onNavigate: (step: AppStep) => void
  onOpenHistory: () => void
  onOpenProfile: () => void
}

function NavButton({
  label,
  active = false,
  icon,
  onClick,
  disabled = false,
}: {
  label: string
  active?: boolean
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:py-1.5 ${
        active
          ? 'border-accent/50 bg-accent-soft text-text-primary shadow-[0_0_14px_var(--color-accent-soft)]'
          : 'border-border bg-elevated text-text-secondary hover:border-accent/60 hover:text-text-primary'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function Navbar({ step, hasHistory, onNavigate, onOpenHistory, onOpenProfile }: Props) {
  const { user, isAuthenticated, logout } = useAuth()

  return (
    <nav className="glass-panel sticky top-2 z-30 mb-3 flex flex-col gap-3 rounded-2xl border border-border px-3 py-2.5 shadow-sm sm:static sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:shadow-none">
      <div className="flex min-w-0 items-center gap-2">
        {isAuthenticated && user ? (
          <button
            type="button"
            onClick={onOpenProfile}
            className="shrink-0 rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            aria-label="Open profile"
          >
            <ProfileAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
          </button>
        ) : (
          <div className="glow-accent flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-hover text-white">
            <AudioLines size={16} />
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] uppercase tracking-[0.25em] text-text-tertiary">InnerVoice</p>
          {isAuthenticated && user ? (
            <p className="truncate text-xs font-medium text-text-primary">{user.name}</p>
          ) : (
            <p className="text-xs text-text-secondary">Future-self companion</p>
          )}
        </div>
      </div>

      <div className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:w-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 sm:pb-0">
        {!isAuthenticated && (
          <NavButton
            label="Register"
            icon={<UserPlus size={14} />}
            onClick={() => onNavigate('auth')}
            active={step === 'auth'}
          />
        )}
        {isAuthenticated && (
          <>
            <NavButton
              label="Voice Train"
              icon={<Mic2 size={14} />}
              onClick={() => onNavigate('recording')}
              active={step === 'recording' || step === 'cloning'}
            />
            <NavButton
              label="Chat"
              icon={<MessageCircle size={14} />}
              onClick={() => onNavigate('chat')}
              active={step === 'chat'}
              disabled={!user?.voiceId}
            />
            {hasHistory && (
              <NavButton label="History" icon={<Clock size={14} />} onClick={onOpenHistory} />
            )}
            <NavButton label="Profile" icon={<User size={14} />} onClick={onOpenProfile} />
            <NavButton label="Log out" icon={<LogOut size={14} />} onClick={logout} />
          </>
        )}
        <ThemeToggle />
      </div>
    </nav>
  )
}
