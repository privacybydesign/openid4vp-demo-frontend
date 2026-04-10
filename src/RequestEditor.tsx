import { Editor } from "@monaco-editor/react"
import type { Preset, VerifierTab } from "./verifiers"

interface RequestEditorProps {
  activeTab: VerifierTab
  defaultValue: string
  presets?: Preset[]
  onChange: (value: string) => void
  onStart: () => void
}

export default function RequestEditor({ activeTab, defaultValue, presets, onChange, onStart }: RequestEditorProps) {
  const selectPreset = (index: number) => {
    const json = JSON.stringify(presets![index].request, null, 4)
    onChange(json)
  }

  return (
    <div className="h-full w-full flex items-center flex-col">
      <div className="flex items-center gap-3 m-5">
        {presets && (
          <select
            className="border border-gray-300 rounded px-3 py-1.5"
            onChange={(e) => selectPreset(Number(e.target.value))}
            defaultValue=""
          >
            <option value="" disabled>
              Load preset...
            </option>
            {presets.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        <button onClick={onStart}>Start Session</button>
      </div>
      <Editor
        key={activeTab + defaultValue}
        height="100%"
        width="100%"
        defaultLanguage="json"
        defaultValue={defaultValue}
        theme="vs-dark"
        onChange={(value) => onChange(value ?? "")}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          formatOnPaste: true,
          formatOnType: true,
        }}
      />
    </div>
  )
}
