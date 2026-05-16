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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
    <nav className="glass-panel mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        {isAuthenticated && user ? (
          <button
            type="button"
            onClick={onOpenProfile}
            className="rounded-full transition hover:scale-105"
            aria-label="Open profile"
          >
            <ProfileAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
          </button>
        ) : (
          <div className="glow-accent flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-hover text-white">
            <AudioLines size={16} />
          </div>
        )}
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-[0.25em] text-text-tertiary">InnerVoice</p>
          {isAuthenticated && user ? (
            <p className="text-xs font-medium text-text-primary">{user.name}</p>
          ) : (
            <p className="text-xs text-text-secondary">Future-self companion</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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
