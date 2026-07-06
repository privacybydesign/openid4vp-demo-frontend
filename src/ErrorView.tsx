interface ErrorViewProps {
  message: string
  onReset: () => void
}

export default function ErrorView({ message, onReset }: ErrorViewProps) {
  return (
    <div className="flex flex-col items-center gap-6 mt-4 w-full max-w-md mx-auto">
      <div
        role="alert"
        className="bg-[#d0021b] text-white px-4 py-3 rounded-md text-sm font-semibold w-full"
      >
        Something went wrong
      </div>
      <p className="text-[#484747] text-sm break-words w-full text-center">{message}</p>
      <button className="btn-secondary w-full" onClick={onReset}>
        Go back
      </button>
    </div>
  )
}
