import { Editor } from "@monaco-editor/react"
import type { VerifierTab } from "./verifiers"

interface RequestEditorProps {
  activeTab: VerifierTab
  defaultValue: string
  onChange: (value: string) => void
  onStart: () => void
}

export default function RequestEditor({ activeTab, defaultValue, onChange, onStart }: RequestEditorProps) {
  return (
    <div className="h-full w-full flex items-center flex-col">
      <button className="m-5" onClick={onStart}>
        Start Session
      </button>
      <Editor
        key={activeTab}
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
