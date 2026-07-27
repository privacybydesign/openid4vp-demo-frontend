// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RevocationPanel from "./RevocationPanel"
import type { CredentialRow } from "./revocation"

// Only the three functions that talk to the issuer and the status list agent are
// stubbed; entryFor, patchRow and REVOCABLE_CREDENTIAL stay real.
const network = vi.hoisted(() => ({
  listRevocableCredentials: vi.fn(),
  readRevoked: vi.fn(),
  setRevoked: vi.fn(),
}))

vi.mock("./revocation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./revocation")>()),
  ...network,
}))

function credential(uuid: string, index: number): CredentialRow {
  return {
    uuid,
    holder: `did:example:${uuid}`,
    credentialType: "StatusListCredentialSdJwt",
    issuanceDate: "2026-07-27T10:00:00.000Z",
    claims: null,
    statuslists: [
      {
        credentialStatus: { idx: index, uri: "https://statuslist.example.org/statuslist/1" },
        index,
        list: 1,
        type: "StatusList2021Entry",
        uri: "https://statuslist.example.org/statuslist/api/index",
      },
    ],
  }
}

function uuidOfRowContaining(element: Element): string | null {
  const row = element.closest("tr")
  // Second column is the credential uuid, carried in full on the cell's title.
  return row?.querySelectorAll("td")[1]?.getAttribute("title") ?? null
}

function buttonsByLabel(container: HTMLElement, label: string): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")].filter(
    (button): button is HTMLButtonElement => button.textContent === label
  )
}

describe("RevocationPanel row identity", () => {
  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    // React's act() refuses to run outside a test environment without this.
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    network.readRevoked.mockResolvedValue(false)
    network.setRevoked.mockResolvedValue("REVOKED")
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  // The listing is newest-first, so a credential issued between the first load
  // and a refresh prepends and shifts every row down one. With index keys React
  // reconciles the rows by position: the button the user is focused on keeps its
  // DOM node but ends up in the next credential's row, and pressing Enter after
  // the refresh settles revokes a credential they were never on.
  it("keeps focus on its own credential when a refresh prepends a new row", async () => {
    network.listRevocableCredentials
      .mockResolvedValueOnce([credential("uuid-2", 2), credential("uuid-1", 1)])
      .mockResolvedValueOnce([
        credential("uuid-3", 3),
        credential("uuid-2", 2),
        credential("uuid-1", 1),
      ])

    await act(async () => root.render(<RevocationPanel />))

    const focused = buttonsByLabel(container, "Revoke")[0]
    expect(uuidOfRowContaining(focused)).toBe("uuid-2")
    focused.focus()

    await act(async () => {
      buttonsByLabel(container, "Refresh")[0].click()
    })

    expect(buttonsByLabel(container, "Revoke")).toHaveLength(3)
    // The node the browser holds on to must have travelled with its credential.
    expect(uuidOfRowContaining(focused)).toBe("uuid-2")
    expect(document.activeElement).toBe(focused)

    await act(async () => focused.click())
    expect(network.setRevoked).toHaveBeenCalledWith("uuid-2", true)
  })

  it("still renders rows the issuer left without a uuid", async () => {
    network.listRevocableCredentials.mockResolvedValueOnce([
      credential("", 1),
      credential("", 2),
    ])

    await act(async () => root.render(<RevocationPanel />))

    expect(buttonsByLabel(container, "Revoke")).toHaveLength(2)
  })
})
