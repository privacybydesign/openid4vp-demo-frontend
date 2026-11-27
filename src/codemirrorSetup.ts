import { basicSetup, EditorView } from "codemirror"
import { json } from "@codemirror/lang-json"
import { catppuccinLatte } from "@catppuccin/codemirror"
import { EditorState, type Extension } from "@codemirror/state"

// The one look every piece of JSON in this tool shares, whether it can be edited
// (RequestEditor, the DC API request) or only read (JsonView). Kept in one place
// so an editor and a viewer showing the same request never drift apart.
const jsonLook: Extension = [
  json(),
  catppuccinLatte,
  EditorView.lineWrapping,
  EditorView.theme({
    "&": { fontSize: "14px" },
    ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  }),
]

export function jsonEditorExtensions(onChange: (value: string) => void): Extension {
  return [
    basicSetup,
    jsonLook,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString())
    }),
  ]
}

// Highlighting and folding without the editing affordances: no cursor line, no
// autocompletion, nothing typed lands in the document.
export function jsonViewerExtensions(): Extension {
  return [
    basicSetup,
    jsonLook,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.theme({
      ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
    }),
  ]
}
