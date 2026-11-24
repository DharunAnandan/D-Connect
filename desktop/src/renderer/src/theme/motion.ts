import type { Transition, Variants } from 'framer-motion'

export const spring: Transition = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }
export const softSpring: Transition = { type: 'spring', stiffness: 200, damping: 26 }
export const bouncy: Transition = { type: 'spring', stiffness: 500, damping: 22 }
export const ease = [0.2, 0.8, 0.2, 1] as const

export const page: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { ...softSpring, staggerChildren: 0.03 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease } }
}

export const list: Variants = {
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } }
}
export const item: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }
}
