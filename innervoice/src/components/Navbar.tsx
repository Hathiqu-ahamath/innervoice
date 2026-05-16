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
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:py-2 ${
        active
          ? 'border-accent/60 bg-accent-soft/90 text-text-primary shadow-[0_0_18px_var(--color-accent-soft)]'
          : 'border-border/80 bg-elevated/90 text-text-secondary hover:border-accent/60 hover:text-text-primary hover:shadow-[0_0_14px_var(--color-accent-soft)]'
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
    <nav className="glass-panel sticky top-2 z-30 mb-2 rounded-3xl border border-border/80 px-3 py-2.5 shadow-[0_10px_30px_rgb(0_0_0_/_0.22)] sm:mb-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:flex-1">
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
          <div className="glow-accent flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-gradient-to-br from-accent to-accent-hover text-white">
            <AudioLines size={16} />
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] uppercase tracking-[0.28em] text-text-tertiary">InnerVoice</p>
          <p className="text-xs text-text-secondary">Future-self companion</p>
        </div>
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => go('recording')}
            className={`hidden items-center gap-1 rounded-full border px-3 py-1 text-xs transition sm:inline-flex ${
              step === 'recording' || step === 'cloning'
                ? 'border-accent/60 bg-accent-soft/90 text-text-primary'
                : 'border-border/80 bg-elevated/90 text-text-secondary hover:border-accent/60 hover:text-text-primary'
            }`}
          >
            <Mic2 size={12} />
            Voice Train
          </button>
        )}
        <div className="ml-auto sm:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated/90 text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      <div className="mt-2 hidden w-full items-center gap-1.5 overflow-visible sm:mt-0 sm:ml-3 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
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
            <NavButton label="Profile" icon={<User size={14} />} onClick={openProfile} />
            <NavButton
              label="Chat"
              icon={<MessageCircle size={14} />}
              onClick={() => go('chat')}
              active={step === 'chat'}
              disabled={!user?.voiceId}
            />
            {hasHistory && (
              <NavButton label="History" icon={<Clock size={14} />} onClick={openHistory} />
            )}
            <NavButton
              label="Live"
              icon={<Radio size={14} />}
              onClick={() => go('live')}
              active={step === 'live'}
              disabled={!user?.voiceId}
            />
            <NavButton label="Log out" icon={<LogOut size={14} />} onClick={logOut} />
          </>
        )}
        <ThemeToggle />
      </div>

      {mobileMenuOpen && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border/80 pt-3 sm:hidden">
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
              <NavButton label="Profile" icon={<User size={14} />} onClick={openProfile} />
              <NavButton
                label="Chat"
                icon={<MessageCircle size={14} />}
                onClick={() => go('chat')}
                active={step === 'chat'}
                disabled={!user?.voiceId}
              />
              {hasHistory && <NavButton label="History" icon={<Clock size={14} />} onClick={openHistory} />}
              <NavButton
                label="Live"
                icon={<Radio size={14} />}
                onClick={() => go('live')}
                active={step === 'live'}
                disabled={!user?.voiceId}
              />
              <NavButton label="Log out" icon={<LogOut size={14} />} onClick={logOut} />
              <NavButton
                label="Voice Train"
                icon={<Mic2 size={14} />}
                onClick={() => go('recording')}
                active={step === 'recording' || step === 'cloning'}
              />
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
