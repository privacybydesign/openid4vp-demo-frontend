import QRCodeComponent from "./QrCodeComponent"

interface SessionPollerProps {
  walletLink: string
  onCancel: () => void
}

export default function SessionPoller({ walletLink, onCancel }: SessionPollerProps) {
  return (
    <div className="flex flex-col items-center gap-6 mt-4">
      <p className="text-sm text-[#484747]">Scan the QR code with the Yivi app or tap the button below.</p>
      <div className="flex flex-col gap-3 bg-white p-4 rounded-lg shadow-sm border border-[#CFE4EF]">
        <QRCodeComponent text={walletLink} />
        <button className="btn-primary w-full" onClick={() => (window.location.href = walletLink)}>
          Open Yivi
        </button>
        <button className="btn-secondary w-full" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
