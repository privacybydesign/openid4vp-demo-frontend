import type { TabGroup, TabGroupId, TabId } from "./tabs"

interface TabBarProps {
  groups: TabGroup[]
  activeTab: TabId
  onSwitchGroup: (group: TabGroupId) => void
  onSwitch: (tab: TabId) => void
}

export default function TabBar({ groups, activeTab, onSwitchGroup, onSwitch }: TabBarProps) {
  const activeGroup = groups.find((g) => g.tabs.some((t) => t.tab === activeTab))!

  return (
    <div className="w-full shrink-0 mb-5">
      <div className="flex border-b border-[#CFE4EF] overflow-x-auto whitespace-nowrap">
        {groups.map((g) => (
          <button
            key={g.id}
            className={`shrink-0 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors bg-transparent rounded-none ${
              activeGroup.id === g.id
                ? "border-[#E12747] text-[#E12747]"
                : "border-transparent text-[#484747] hover:text-[#E12747]"
            }`}
            onClick={() => onSwitchGroup(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div
        className="flex gap-2 pt-3 overflow-x-auto whitespace-nowrap"
        role="tablist"
        aria-label={activeGroup.label}
      >
        {activeGroup.tabs.map((t) => (
          <button
            key={t.tab}
            role="tab"
            aria-selected={activeTab === t.tab}
            className={`shrink-0 px-4 py-1.5 rounded-full border text-sm font-semibold transition-colors ${
              activeTab === t.tab
                ? "border-[#E12747] bg-[#E12747] text-white"
                : "border-[#CFE4EF] bg-white text-[#484747] hover:text-[#E12747] hover:border-[#E12747]"
            }`}
            onClick={() => onSwitch(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
