import QRCodeComponent from "./QrCodeComponent"

interface SessionPollerProps {
  walletLink: string
  onCancel: () => void
}

export default function SessionPoller({ walletLink, onCancel }: SessionPollerProps) {
  return (
    <div>
      <button onClick={() => (window.location.href = walletLink)}>Open Yivi</button>
      <QRCodeComponent text={walletLink} />
      <button className="m-5" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
