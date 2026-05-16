import { motion } from 'framer-motion'

export function CloningView() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="flex min-h-[260px] flex-col items-center justify-center gap-4"
    >
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-accent/30 border-t-accent shadow-[0_0_24px_var(--color-accent-soft)]" />
      <p className="text-lg font-semibold text-text-primary">Creating your future voice...</p>
      <p className="text-sm text-text-secondary">This will only take a moment</p>
    </motion.div>
  )
}
