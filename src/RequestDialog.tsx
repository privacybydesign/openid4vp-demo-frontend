import { useEffect, useRef } from "react"
import JsonEditor from "./JsonEditor"

interface RequestDialogProps {
  open: boolean
  title: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
}

// A request shown (almost) full screen, highlighted and editable in one. A
// native modal <dialog>: Escape closes it, focus stays inside, and the page behind
// is inert.
export default function RequestDialog({ open, title, value, onChange, onClose }: RequestDialogProps) {
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
      aria-labelledby="request-dialog-title"
      className="m-auto w-[96vw] h-[94vh] max-w-none max-h-none p-0 rounded-lg border border-[#CFE4EF] bg-[#F7F5F3] backdrop:bg-black/40"
    >
      {open && (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-white border-b border-[#CFE4EF]">
            <h2 id="request-dialog-title" className="text-lg font-bold text-[#484747] m-0">
              {title}
            </h2>
            <button type="button" className="btn-secondary py-1.5 px-4 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4">
            <div className="h-full [&>div]:h-full">
              <JsonEditor value={value} onChange={onChange} minHeight="100%" />
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
