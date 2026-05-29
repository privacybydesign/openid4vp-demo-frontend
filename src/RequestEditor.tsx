import { useEffect, useRef } from "react"
import { EditorView, basicSetup } from "codemirror"
import { json } from "@codemirror/lang-json"
import { catppuccinLatte } from "@catppuccin/codemirror"
import { EditorState } from "@codemirror/state"
import type { Preset, TabId } from "./tabs"
import type { LinkForm } from "./walletLink"
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
  showLinkForm: boolean
  linkForm: LinkForm
  onLinkFormChange: (form: LinkForm) => void
  onChange: (value: string) => void
  onStart: () => void
}

const linkFormOptions: { id: LinkForm; label: string }[] = [
  { id: "scheme", label: "Custom scheme" },
  { id: "universal", label: "Universal link" },
]

export default function RequestEditor({
  activeTab,
  defaultValue,
  presets,
  subModes,
  activeSubMode,
  onSubModeChange,
  showLinkForm,
  linkForm,
  onLinkFormChange,
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
    <div className="flex-1 w-full flex flex-row gap-4 overflow-hidden">
      <div className="flex flex-col gap-4 w-64 shrink-0">
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
        <button className="btn-primary" onClick={onStart}>
          Start Session
        </button>
        {subModes && (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Mode">
            <span className="text-[15px] font-semibold text-[#484747] select-none">Mode</span>
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
        {showLinkForm && (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Link form">
            <span className="text-[15px] font-semibold text-[#484747] select-none">Link form</span>
            {linkFormOptions.map((o) => (
              <label key={o.id} className="flex items-center gap-1.5 text-[15px] text-[#484747] cursor-pointer select-none">
                <input
                  type="radio"
                  name="link-form"
                  value={o.id}
                  checked={o.id === linkForm}
                  onChange={() => onLinkFormChange(o.id)}
                  className="accent-[#00508a]"
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div
        ref={editorRef}
        className="flex-1 overflow-auto rounded-lg border border-[#CFE4EF] bg-white"
      />
    </div>
  )
}
