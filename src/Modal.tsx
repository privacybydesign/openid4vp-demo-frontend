import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

interface ModalProps {
  open: boolean
  // Called when the person closes it: Escape, or a button that calls it.
  onClose: () => void
  labelledBy: string
  className?: string
  children: ReactNode
}

// A native modal <dialog>: Escape closes it, focus stays inside, and the page
// behind is inert. The open state lives with the caller.
export default function Modal({ open, onClose, labelledBy, className = "", children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={labelledBy}
      className={`m-auto p-0 rounded-lg border border-[#CFE4EF] backdrop:bg-black/40 ${className}`}
    >
      {open && children}
    </dialog>
  )
}
