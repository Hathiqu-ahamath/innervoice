import { useState, type ReactNode } from 'react'
import { AudioLines, Clock, LogOut, Menu, MessageCircle, Mic2, Radio, User, UserPlus, X } from 'lucide-react'
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
      <span>{label}</span>
    </button>
  )
}

export function Navbar({ step, hasHistory, onNavigate, onOpenHistory, onOpenProfile }: Props) {
  const { user, isAuthenticated, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const go = (next: AppStep) => {
    onNavigate(next)
    setMobileMenuOpen(false)
  }

  const openHistory = () => {
    onOpenHistory()
    setMobileMenuOpen(false)
  }

  const openProfile = () => {
    onOpenProfile()
    setMobileMenuOpen(false)
  }

  const logOut = () => {
    logout()
    setMobileMenuOpen(false)
  }

  return (
    <nav className="glass-panel sticky top-2 z-30 mb-3 rounded-2xl border border-border px-3 py-2.5 shadow-sm sm:mb-4">
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
        <div className="ml-auto sm:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      <div className="mt-2 hidden w-full items-center gap-1.5 overflow-visible sm:flex sm:flex-wrap sm:justify-end">
        {!isAuthenticated && (
          <NavButton
            label="Register"
            icon={<UserPlus size={14} />}
            onClick={() => go('auth')}
            active={step === 'auth'}
          />
        )}
        {isAuthenticated && (
          <>
            <NavButton
              label="Voice Train"
              icon={<Mic2 size={14} />}
              onClick={() => go('recording')}
              active={step === 'recording' || step === 'cloning'}
            />
            <NavButton
              label="Chat"
              icon={<MessageCircle size={14} />}
              onClick={() => go('chat')}
              active={step === 'chat'}
              disabled={!user?.voiceId}
            />
            <NavButton
              label="Live"
              icon={<Radio size={14} />}
              onClick={() => go('live')}
              active={step === 'live'}
              disabled={!user?.voiceId}
            />
            {hasHistory && (
              <NavButton label="History" icon={<Clock size={14} />} onClick={openHistory} />
            )}
            <NavButton label="Profile" icon={<User size={14} />} onClick={openProfile} />
            <NavButton label="Log out" icon={<LogOut size={14} />} onClick={logOut} />
          </>
        )}
        <ThemeToggle />
      </div>

      {mobileMenuOpen && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:hidden">
          {!isAuthenticated && (
            <NavButton
              label="Register"
              icon={<UserPlus size={14} />}
              onClick={() => go('auth')}
              active={step === 'auth'}
            />
          )}
          {isAuthenticated && (
            <>
              <NavButton
                label="Voice Train"
                icon={<Mic2 size={14} />}
                onClick={() => go('recording')}
                active={step === 'recording' || step === 'cloning'}
              />
              <NavButton
                label="Chat"
                icon={<MessageCircle size={14} />}
                onClick={() => go('chat')}
                active={step === 'chat'}
                disabled={!user?.voiceId}
              />
              <NavButton
                label="Live"
                icon={<Radio size={14} />}
                onClick={() => go('live')}
                active={step === 'live'}
                disabled={!user?.voiceId}
              />
              {hasHistory && <NavButton label="History" icon={<Clock size={14} />} onClick={openHistory} />}
              <NavButton label="Profile" icon={<User size={14} />} onClick={openProfile} />
              <NavButton label="Log out" icon={<LogOut size={14} />} onClick={logOut} />
            </>
          )}
          <div className="pt-1">
            <ThemeToggle />
          </div>
        </div>
      )}
    </nav>
  )
}
