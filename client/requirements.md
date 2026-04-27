## Packages
framer-motion | Page transitions and complex wizard animations
recharts | Dashboard analytics visualization
date-fns | Date formatting for offers and logs
clsx | Conditional class merging
tailwind-merge | Class merging for components

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  display: ["var(--font-display)"],
  body: ["var(--font-sans)"],
  mono: ["var(--font-mono)"],
}
Authentication is handled via Replit Auth (use-auth.ts)
Word generation endpoint returns a blob (needs window.URL.createObjectURL)
