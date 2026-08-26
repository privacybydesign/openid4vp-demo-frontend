interface IssuanceCompleteViewProps {
  credentialName: string
  // Whether the issuer actually told us the credential was collected. False for
  // issuers that keep no offer state, where the finish is the operator's word —
  // the view then says only what is known, which is that an offer was made.
  observed?: boolean
  onReset: () => void
}

export default function IssuanceCompleteView({ credentialName, observed = true, onReset }: IssuanceCompleteViewProps) {
  return (
    <div className="flex flex-col items-center gap-6 mt-4 w-full max-w-md mx-auto">
      <div className="bg-[#00973a] text-white px-4 py-3 rounded-md text-sm font-semibold w-full">
        {observed ? "Credential issued successfully" : "Offer handed to the wallet"}
      </div>
      {observed ? (
        <p className="text-[#484747] text-sm">
          <span className="font-semibold">{credentialName}</span> issued to wallet
        </p>
      ) : (
        <p className="text-[#484747] text-sm">
          <span className="font-semibold">{credentialName}</span> was offered. This issuer keeps no
          record of the offer, so the tool cannot confirm the wallet collected it.
        </p>
      )}
      <button className="btn-secondary w-full" onClick={onReset}>
        Go back
      </button>
    </div>
  )
}
