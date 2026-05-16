import { getInitials } from '../lib/initials'

interface Props {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-14 w-14 text-lg',
  lg: 'h-20 w-20 text-xl',
}

export function ProfileAvatar({ name, avatarUrl, size = 'md', className = '' }: Props) {
  const dim = sizeClasses[size]

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${dim} shrink-0 rounded-full border-2 border-accent/30 object-cover ${className}`}
      />
    )
  }

  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full border-2 border-accent/25 bg-gradient-to-br from-accent to-accent-hover font-bold text-white ${className}`}
    >
      {getInitials(name)}
    </div>
  )
}
