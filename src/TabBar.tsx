import type { TabConfig, TabId } from "./tabs"

interface TabBarProps {
  tabs: TabConfig[]
  activeTab: TabId
  onSwitch: (tab: TabId) => void
}

export default function TabBar({ tabs, activeTab, onSwitch }: TabBarProps) {
  return (
    <div className="flex w-full border-b border-[#CFE4EF] mb-5">
      {tabs.map((t) => (
        <button
          key={t.tab}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors bg-transparent rounded-none ${
            activeTab === t.tab
              ? "border-[#E12747] text-[#E12747]"
              : "border-transparent text-[#484747] hover:text-[#E12747]"
          }`}
          onClick={() => onSwitch(t.tab)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
