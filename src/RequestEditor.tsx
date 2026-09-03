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
  linkForm: LinkForm
  onLinkFormChange: (form: LinkForm) => void
  onChange: (value: string) => void
  onStart: () => void
}

// A run of adjacent presets sharing a `group` becomes one <optgroup>; presets
// with no group stay bare options. Authored order is preserved and the original
// index is kept as the option value, because that is what selectPreset indexes —
// so same-group presets have to be adjacent in the list, which is how they read
// anyway.
interface PresetChunk {
  group?: string
  items: { preset: Preset; index: number }[]
}

function chunkPresets(presets: Preset[]): PresetChunk[] {
  const chunks: PresetChunk[] = []
  presets.forEach((preset, index) => {
    const last = chunks[chunks.length - 1]
    if (last && last.group === preset.group) {
      last.items.push({ preset, index })
    } else {
      chunks.push({ group: preset.group, items: [{ preset, index }] })
    }
  })
  return chunks
}

// On the IRMA verifier tab the default form runs the session through the yivi
// popup instead of showing a scheme link. The IRMA issuer tab does not: it always
// shows the link, so its scheme option is named like everyone else's.
function linkFormOptions(activeTab: TabId): { id: LinkForm; label: string }[] {
  return [
    { id: "scheme", label: activeTab === "irma-verifier" ? "Yivi popup" : "Custom scheme" },
    { id: "universal", label: "Universal link" },
    { id: "universal-staging", label: "Universal link (staging)" },
  ]
}

export default function RequestEditor({
  activeTab,
  defaultValue,
  presets,
  subModes,
  activeSubMode,
  onSubModeChange,
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
          EditorView.lineWrapping,
          EditorView.theme({
            "&": { fontSize: "14px" },
            ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
          }),
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
    <div className="flex-1 w-full flex flex-col md:flex-row gap-4 md:overflow-hidden">
      <div className="flex flex-col gap-4 w-full md:w-64 md:shrink-0">
        {presets && (
          <select
            className="border border-[#CFE4EF] rounded-md px-4 py-[0.65rem] text-[16px] font-semibold text-[#484747] bg-white focus:outline-none focus:border-[#00508a]"
            onChange={(e) => selectPreset(Number(e.target.value))}
            defaultValue=""
          >
            <option value="" disabled>
              Load preset...
            </option>
            {chunkPresets(presets).map((chunk, ci) =>
              chunk.group ? (
                <optgroup key={ci} label={chunk.group}>
                  {chunk.items.map(({ preset, index }) => (
                    <option key={index} value={index}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                chunk.items.map(({ preset, index }) => (
                  <option key={index} value={index}>
                    {preset.label}
                  </option>
                ))
              )
            )}
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
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Link form">
          <span className="text-[15px] font-semibold text-[#484747] select-none">Link form</span>
          {linkFormOptions(activeTab).map((o) => (
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
      </div>
      <div
        ref={editorRef}
        className="flex-1 w-full min-h-[60vh] md:min-h-0 overflow-auto rounded-lg border border-[#CFE4EF] bg-white"
      />
    </div>
  )
}
