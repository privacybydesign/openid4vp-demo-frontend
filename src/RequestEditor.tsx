import { useEffect, useRef } from "react"
import { EditorView, basicSetup } from "codemirror"
import { json } from "@codemirror/lang-json"
import { catppuccinLatte } from "@catppuccin/codemirror"
import { EditorState } from "@codemirror/state"
import type { Preset, TabId } from "./tabs"
import compactJson from "./compactJson"

interface SubMode {
  id: string
  label: string
}

interface RequestEditorProps {
  activeTab: TabId
  defaultValue: string
  presets?: Preset[]
  subModes?: SubMode[]
  activeSubMode?: string
  onSubModeChange?: (id: string) => void
  onChange: (value: string) => void
  onStart: () => void
}

export default function RequestEditor({
  activeTab,
  defaultValue,
  presets,
  subModes,
  activeSubMode,
  onSubModeChange,
  onChange,
  onStart,
}: RequestEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

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
  }, [activeTab, activeSubMode])

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
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button className="btn-primary" onClick={onStart}>
          Start Session
        </button>
        {subModes && (
          <div className="flex items-center gap-4" role="radiogroup">
            {subModes.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-[15px] text-[#484747] cursor-pointer select-none">
                <input
                  type="radio"
                  name="sub-mode"
                  value={m.id}
                  checked={m.id === activeSubMode}
                  onChange={() => onSubModeChange?.(m.id)}
                  className="accent-[#00508a]"
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        )}
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
