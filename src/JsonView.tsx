import { useEffect, useRef, useState } from "react"
import { EditorView } from "codemirror"
import { EditorState } from "@codemirror/state"
import { jsonViewerExtensions } from "./codemirrorSetup"
import compactJson from "./compactJson"

interface JsonViewProps {
  // An object is laid out with compactJson, the same as a request loaded into the
  // editor; a string is shown exactly as given, so a request the operator typed
  // keeps its formatting.
  value: unknown
  maxHeight?: string
  label?: string
}

function asText(value: unknown): string {
  if (typeof value === "string") {
    // Pretty-print a compact JSON string, leave anything else (or invalid JSON)
    // alone: showing the bytes is better than hiding a malformed payload.
    try {
      return value.includes("\n") ? value : compactJson(JSON.parse(value))
    } catch {
      return value
    }
  }
  return compactJson(value)
}

// The only way this tool shows raw JSON. Read-only CodeMirror with the editor's
// own highlighting, so a request looks the same whether it can be edited or not.
// ESLint rejects `JSON.stringify` inside JSX to keep it that way.
export default function JsonView({ value, maxHeight, label }: JsonViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const text = asText(value)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({ doc: "", extensions: jsonViewerExtensions() }),
      parent: hostRef.current!,
    })
    viewRef.current = view
    return () => view.destroy()
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === text) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  }, [text])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("Failed to copy JSON", err)
    }
  }

  return (
    <div className="relative rounded-lg border border-[#CFE4EF] bg-white overflow-hidden">
      <button
        type="button"
        onClick={copy}
        className="absolute top-1.5 right-1.5 z-10 text-xs font-semibold px-2 py-1 rounded border border-[#CFE4EF] bg-white text-[#484747] hover:bg-[#F5FAFC]"
        aria-label={label ? `Copy ${label}` : "Copy JSON"}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <div ref={hostRef} className="overflow-auto" style={maxHeight ? { maxHeight } : undefined} />
    </div>
  )
}
