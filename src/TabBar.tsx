import type { Verifier, VerifierTab } from "./verifiers"

interface TabBarProps {
  verifiers: Verifier[]
  activeTab: VerifierTab
  onSwitch: (tab: VerifierTab) => void
}

export default function TabBar({ verifiers, activeTab, onSwitch }: TabBarProps) {
  return (
    <div className="flex border-b border-gray-300 mt-4 mb-4">
      {verifiers.map((v) => (
        <button
          key={v.tab}
          className={`px-6 py-2 font-medium ${
            activeTab === v.tab
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => onSwitch(v.tab)}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
