import { describe, expect, it } from "vitest"
import { patchRow, statusUrlFor } from "./revocation"
import type { StatusListEntry } from "./revocation"

function entry(uri: string, list = 1, index = 73124): StatusListEntry {
  return {
    credentialStatus: { idx: index, uri },
    index,
    list,
    type: "StatusList2021Entry",
    uri: "https://statuslist.example.org/statuslist/api/index",
  }
}

describe("statusUrlFor", () => {
  it("turns the list URL into the status URL for this entry", () => {
    expect(statusUrlFor(entry("https://statuslist.example.org/statuslist/1"))).toBe(
      "https://statuslist.example.org/statuslist/api/status/1/73124"
    )
  })

  it("tolerates a trailing slash on the list URL", () => {
    expect(statusUrlFor(entry("https://statuslist.example.org/statuslist/1/"))).toBe(
      "https://statuslist.example.org/statuslist/api/status/1/73124"
    )
  })

  it("keeps a multi-digit list number out of the base", () => {
    expect(statusUrlFor(entry("https://statuslist.example.org/statuslist/12", 12, 5))).toBe(
      "https://statuslist.example.org/statuslist/api/status/12/5"
    )
  })
})

describe("patchRow", () => {
  const rows = [
    { uuid: "aaa", revoked: false },
    { uuid: "bbb", revoked: false },
  ]

  it("patches the row carrying the uuid", () => {
    expect(patchRow(rows, 1, "bbb", { revoked: true })).toEqual([
      { uuid: "aaa", revoked: false },
      { uuid: "bbb", revoked: true },
    ])
  })

  // The reason patching is keyed on uuid: a refresh that picks up a newly
  // issued credential shifts every index by one, so a toggle finishing after
  // it would otherwise mark the wrong credential revoked.
  it("follows the credential after a refresh shifted the indexes", () => {
    const refreshed = [{ uuid: "ccc", revoked: false }, ...rows]
    expect(patchRow(refreshed, 1, "bbb", { revoked: true })).toEqual([
      { uuid: "ccc", revoked: false },
      { uuid: "aaa", revoked: false },
      { uuid: "bbb", revoked: true },
    ])
  })

  it("falls back to the index when the issuer left the uuid empty", () => {
    const nameless = [
      { uuid: "", revoked: false },
      { uuid: "", revoked: false },
    ]
    expect(patchRow(nameless, 1, "", { revoked: true })).toEqual([
      { uuid: "", revoked: false },
      { uuid: "", revoked: true },
    ])
  })

  it("leaves the other rows untouched", () => {
    const patched = patchRow(rows, 0, "aaa", { revoked: true })
    expect(patched[1]).toBe(rows[1])
  })
})
