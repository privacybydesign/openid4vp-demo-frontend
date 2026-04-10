const MAX_LINE_WIDTH = 80
const INDENT = "    "

function inlineJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    return "[" + value.map(inlineJson).join(", ") + "]"
  }
  const entries = Object.entries(value)
  if (entries.length === 0) return "{}"
  return "{ " + entries.map(([k, v]) => JSON.stringify(k) + ": " + inlineJson(v)).join(", ") + " }"
}

export default function compactJson(value: unknown, indent = 0): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  const currentIndent = INDENT.repeat(indent)
  const inline = inlineJson(value)
  if (currentIndent.length + inline.length <= MAX_LINE_WIDTH) {
    return inline
  }

  const childIndent = INDENT.repeat(indent + 1)

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    const items = value.map((v) => childIndent + compactJson(v, indent + 1))
    return "[\n" + items.join(",\n") + "\n" + currentIndent + "]"
  }

  const entries = Object.entries(value)
  if (entries.length === 0) return "{}"
  const items = entries.map(
    ([k, v]) => childIndent + JSON.stringify(k) + ": " + compactJson(v, indent + 1)
  )
  return "{\n" + items.join(",\n") + "\n" + currentIndent + "}"
}
