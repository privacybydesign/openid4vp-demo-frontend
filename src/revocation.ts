// Revocation against the Veramo issuer and the status list agent.
//
// Listing comes from the issuer, but the current revocation state does NOT:
// Issuer.listCredentials omits the `status` column from its SELECT, so the
// listing cannot say whether a credential is revoked. Each row's bit is read
// straight from the status list agent instead.
import { ISSUER_BASE, ISSUER_TOKEN, PRE_AUTH_ISSUER_NAME, issuerAuthHeaders } from "./veramoIssuer"

// The only credential type test-issuer.json declares a `statusLists` block for,
// and therefore the only type that gets a status list entry at issuance.
export const REVOCABLE_CREDENTIAL = "StatusListCredentialSdJwt"

// One reserved bit, as the status list agent returned it at issuance and the
// issuer persisted it onto the credential.
export interface StatusListEntry {
  // `uri` is the list URL (".../statuslist/1"); `idx` mirrors `index`.
  credentialStatus: { idx: number; uri: string }
  index: number
  list: number
  type: string
  purpose?: string
  // The *reserve* endpoint the issuer called (".../statuslist/api/index"),
  // added by the issuer, not the agent. Not the list URL.
  uri: string
}

// An issuance record: what the issuer remembers about a credential it issued.
// Not the credential itself, which only ever exists in the holder's wallet.
export interface CredentialRow {
  uuid: string
  holder: string
  credentialType: string
  issuanceDate: string
  claims: Record<string, unknown> | null
  statuslists: StatusListEntry[] | null
}

export type RevocationState = "REVOKED" | "UNREVOKED" | "WAS_REVOKED" | "WAS_UNREVOKED"

// listCredentials uses getRawMany(), which bypasses TypeORM's `simple-json`
// transformer, so `claims` and `statuslists` arrive as JSON strings rather than
// objects. Tolerate both, in case that is ever fixed upstream.
function parseJsonColumn<T>(value: unknown): T | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string") return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function normaliseRow(raw: Record<string, unknown>): CredentialRow {
  const statuslists = parseJsonColumn<StatusListEntry | StatusListEntry[]>(raw.statuslists)
  return {
    uuid: String(raw.uuid ?? ""),
    holder: String(raw.holder ?? ""),
    credentialType: String(raw.credentialType ?? ""),
    issuanceDate: String(raw.issuanceDate ?? ""),
    claims: parseJsonColumn<Record<string, unknown>>(raw.claims),
    statuslists: statuslists === null ? null : Array.isArray(statuslists) ? statuslists : [statuslists],
  }
}

// The status list entry a row is revoked through, or null when the credential
// type had no `statusLists` block configured at issuance time.
export function entryFor(row: CredentialRow): StatusListEntry | null {
  const entry = row.statuslists?.[0]
  if (!entry?.credentialStatus?.uri) return null
  return entry
}

// Derived per row rather than configured: the list URL is burned into the
// credential at issuance and gates its future revocation, so anything the
// frontend held separately could drift out of sync with what was issued.
//
//   "https://statuslist.<host>/statuslist/1"
//     -> "https://statuslist.<host>/statuslist/api/status/1/73124"
//
// A trailing slash on the stored URL is tolerated: without that, a
// ".../statuslist/1/" would keep its separator and produce a doubled slash.
export function statusUrlFor(entry: StatusListEntry): string {
  const listBase = entry.credentialStatus.uri.replace(/\/+\d+\/*$/, "")
  return `${listBase}/api/status/${entry.list}/${entry.index}`
}

// Applies a patch to the row for `uuid`. Keyed on the uuid rather than on the
// position, because a toggle that finishes after a refresh would otherwise
// write its result onto whichever credential now sits at that index: load()
// replaces the list wholesale, and one newly issued credential shifts every
// index by one. The uuid column is nullable, so a row without one still falls
// back to the position it was rendered at, which also keeps two empty-uuid
// rows from updating together.
export function patchRow<T extends { uuid: string }>(
  rows: T[],
  index: number,
  uuid: string,
  patch: Partial<T>
): T[] {
  return rows.map((row, i) =>
    (uuid ? row.uuid === uuid : i === index) ? { ...row, ...patch } : row
  )
}

export async function listRevocableCredentials(): Promise<CredentialRow[]> {
  const response = await fetch(`${ISSUER_BASE}/${PRE_AUTH_ISSUER_NAME}/api/list-credentials`, {
    method: "POST",
    headers: issuerAuthHeaders(),
    body: JSON.stringify({ credential: REVOCABLE_CREDENTIAL }),
  })
  if (!response.ok) {
    throw new Error(`Failed to list credentials (HTTP ${response.status})`)
  }
  const rows = await response.json()
  if (!Array.isArray(rows)) {
    throw new Error("Credential listing did not return an array")
  }
  // The issuer orders by id ascending; show the most recently issued first.
  return rows.map(normaliseRow).reverse()
}

// Reads the bit itself. The list config grants the issuer admin token access to
// this list's admin API, which is why the same token works here.
export async function readRevoked(entry: StatusListEntry): Promise<boolean> {
  const response = await fetch(statusUrlFor(entry), {
    headers: { Authorization: `Bearer ${ISSUER_TOKEN}` },
  })
  if (!response.ok) {
    throw new Error(`Failed to read status (HTTP ${response.status})`)
  }
  const { status } = await response.json()
  // bitSize is 1 for this list, so the agent answers with a boolean.
  return status === true || status === 1
}

export async function setRevoked(uuid: string, revoked: boolean): Promise<RevocationState> {
  const response = await fetch(`${ISSUER_BASE}/${PRE_AUTH_ISSUER_NAME}/api/revoke-credential`, {
    method: "POST",
    headers: issuerAuthHeaders(),
    // Any value other than the literal "revoke" unrevokes.
    body: JSON.stringify({ uuid, state: revoked ? "revoke" : "unrevoke" }),
  })
  if (!response.ok) {
    throw new Error(`Revocation request failed (HTTP ${response.status})`)
  }
  const { status } = await response.json()
  // UNKNOWN is a failure the issuer reports with HTTP 200: it swallows any
  // exception from the status list agent, and returns the same value when the
  // credential's stored list URL no longer matches the configured one. The bit
  // did not move.
  if (status === "UNKNOWN") {
    throw new Error(
      "The issuer could not reach the status list agent (UNKNOWN) — the credential is unchanged."
    )
  }
  return status as RevocationState
}
