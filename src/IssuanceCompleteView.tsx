interface IssuanceCompleteViewProps {
  credentialName: string
  onReset: () => void
}

export default function IssuanceCompleteView({ credentialName, onReset }: IssuanceCompleteViewProps) {
  return (
    <div className="flex flex-col items-center gap-6 mt-4 w-full max-w-md mx-auto">
      <div className="bg-[#00973a] text-white px-4 py-3 rounded-md text-sm font-semibold w-full">
        Credential issued successfully
      </div>
      <p className="text-[#484747] text-sm">
        <span className="font-semibold">{credentialName}</span> issued to wallet
      </p>
      <button className="btn-secondary w-full" onClick={onReset}>
        Go back
      </button>
    </div>
  )
}
