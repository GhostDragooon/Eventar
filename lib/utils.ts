import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale in app/globals.css (`--text-*`). tailwind-merge only knows Tailwind's own sizes, so it read
// `text-label-md` as a text COLOUR and dropped a real colour class next to it (or the reverse). Registering
// the names as sizes keeps both. Keep this list in step with the `--text-<name>` tokens there.
const TYPE_SCALE = [
  "display",
  "headline-lg",
  "headline-md",
  "headline-sm",
  "title-lg",
  "body-lg",
  "body-md",
  "body-sm",
  "label-md",
  "label-sm",
]

const twMerge = extendTailwindMerge({
  extend: { theme: { text: TYPE_SCALE } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
