import QRCodeComponent from "./QrCodeComponent"

interface IssuerSessionPollerProps {
  walletLink: string
  txCode?: string
  onCancel: () => void
}

export default function IssuerSessionPoller({ walletLink, txCode, onCancel }: IssuerSessionPollerProps) {
  const copyTxCode = async () => {
    if (!txCode) return
    try {
      await navigator.clipboard.writeText(txCode)
    } catch (err) {
      console.error("Failed to copy tx_code", err)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 mt-4">
      <p className="text-sm text-[#484747]">Scan the QR code with the Yivi app or tap the button below.</p>
      <div className="flex flex-col gap-3 bg-white p-4 rounded-lg shadow-sm border border-[#CFE4EF]">
        <QRCodeComponent text={walletLink} />

        {txCode && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-[#484747]">Enter this code in your wallet:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-[#F5FAFC] border border-[#CFE4EF] rounded-md font-mono text-xl tracking-widest text-[#00508a] text-center">
                {txCode}
              </code>
              <button
                className="btn-secondary px-3 py-2 text-sm"
                onClick={copyTxCode}
                title="Copy code to clipboard"
              >
                Copy
              </button>
            </div>
          </div>
        )}

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
