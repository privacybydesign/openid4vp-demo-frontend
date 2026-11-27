import type { ReactNode } from "react"
import JsonEditor from "./JsonEditor"
import Modal from "./Modal"

interface RequestDialogProps {
  open: boolean
  title: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  // Extra buttons next to Close, such as reset or open in the playground.
  actions?: ReactNode
}

// A request shown (almost) full screen, highlighted and editable in one.
export default function RequestDialog({ open, title, value, onChange, onClose, actions }: RequestDialogProps) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="request-dialog-title" className="w-[96vw] h-[94vh] max-w-none max-h-none bg-[#F7F5F3]">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 py-3 bg-white border-b border-[#CFE4EF]">
          <h2 id="request-dialog-title" className="text-lg font-bold text-[#484747] m-0">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {actions}
            <button type="button" className="btn-secondary py-1.5 px-4 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-4">
          <div className="h-full [&>div]:h-full">
            <JsonEditor value={value} onChange={onChange} minHeight="100%" />
          </div>
        </div>
      </div>
    </Modal>
  )
}
