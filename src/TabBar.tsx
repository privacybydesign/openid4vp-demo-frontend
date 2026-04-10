import type { Verifier, VerifierTab } from "./verifiers"

interface TabBarProps {
  verifiers: Verifier[]
  activeTab: VerifierTab
  onSwitch: (tab: VerifierTab) => void
}

export default function TabBar({ verifiers, activeTab, onSwitch }: TabBarProps) {
  return (
    <div className="flex w-full border-b border-[#CFE4EF] mb-5">
      {verifiers.map((v) => (
        <button
          key={v.tab}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors bg-transparent rounded-none ${
            activeTab === v.tab
              ? "border-[#E12747] text-[#E12747]"
              : "border-transparent text-[#484747] hover:text-[#E12747]"
          }`}
          onClick={() => onSwitch(v.tab)}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
