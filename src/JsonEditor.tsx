import { useEffect, useRef } from "react"
import { EditorView } from "codemirror"
import { EditorState } from "@codemirror/state"
import { jsonEditorExtensions } from "./codemirrorSetup"

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  minHeight?: string
}

// A controlled JSON editor: a new `value` from outside rewrites the text while the
// editor stays mounted. Used where the text can change underneath the operator
// (the DC API request, a scenario's request when an option changes).
export default function JsonEditor({ value, onChange, minHeight = "16rem" }: JsonEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({ extensions: jsonEditorExtensions((v) => onChangeRef.current(v)) }),
      parent: hostRef.current!,
    })
    viewRef.current = view
    return () => view.destroy()
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  return (
    <div
      ref={hostRef}
      className="overflow-auto rounded-lg border border-[#CFE4EF] bg-white"
      style={{ minHeight }}
    />
  )
}
