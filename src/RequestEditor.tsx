import { useEffect, useRef } from "react"
import { EditorView, basicSetup } from "codemirror"
import { json } from "@codemirror/lang-json"
import { catppuccinLatte } from "@catppuccin/codemirror"
import { EditorState } from "@codemirror/state"
import type { Preset, VerifierTab } from "./verifiers"
import compactJson from "./compactJson"

interface RequestEditorProps {
  activeTab: VerifierTab
  defaultValue: string
  presets?: Preset[]
  onChange: (value: string) => void
  onStart: () => void
}

export default function RequestEditor({ activeTab, defaultValue, presets, onChange, onStart }: RequestEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView>()

  useEffect(() => {
    if (!editorRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: defaultValue,
        extensions: [
          basicSetup,
          json(),
          catppuccinLatte,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: editorRef.current,
    })
    viewRef.current = view

    return () => view.destroy()
  }, [activeTab])

  const selectPreset = (index: number) => {
    const text = compactJson(presets![index].request)
    onChange(text)
    const view = viewRef.current
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      })
    }
  }

  return (
    <div className="flex-1 w-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-4">
        <button className="btn-primary" onClick={onStart}>
          Start Session
        </button>
        {presets && (
          <select
            className="border border-[#CFE4EF] rounded-md px-4 py-[0.65rem] text-[16px] font-semibold text-[#484747] bg-white focus:outline-none focus:border-[#00508a]"
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
      </div>
      <div
        ref={editorRef}
        className="flex-1 overflow-auto rounded-lg border border-[#CFE4EF] bg-white"
      />
    </div>
  )
}
