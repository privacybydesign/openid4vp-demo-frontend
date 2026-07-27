import { useCallback, useEffect, useState } from "react"
import {
  entryFor,
  listRevocableCredentials,
  patchRow,
  readRevoked,
  setRevoked,
  REVOCABLE_CREDENTIAL,
} from "./revocation"
import type { CredentialRow, StatusListEntry } from "./revocation"

interface Row {
  uuid: string
  holder: string
  issuanceDate: string
  entry: StatusListEntry | null
  // null when the bit could not be read, or when there is no entry to read.
  revoked: boolean | null
  error?: string
  busy?: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// HH:mm:ss is enough to tell apart credentials issued during one demo; the date
// is only worth the space once a row is from another day.
function formatIssued(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const time = date.toLocaleTimeString("nl-NL", { hour12: false })
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday ? time : `${date.toLocaleDateString("nl-NL")} ${time}`
}

function truncate(value: string, max = 22): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

async function loadRow(row: CredentialRow): Promise<Row> {
  const entry = entryFor(row)
  const base: Row = {
    uuid: row.uuid,
    holder: row.holder,
    issuanceDate: row.issuanceDate,
    entry,
    revoked: null,
  }
  if (!entry) return base
  try {
    return { ...base, revoked: await readRevoked(entry) }
  } catch (error) {
    return { ...base, error: errorText(error) }
  }
}

async function fetchRows(): Promise<Row[]> {
  const credentials = await listRevocableCredentials()
  return Promise.all(credentials.map(loadRow))
}

export default function RevocationPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // The state handoff is a .then callback rather than an await:
  // react-hooks/set-state-in-effect rejects every setState a mount effect can
  // reach by calling a function directly, whether or not it sits behind an
  // await. So load() itself sets nothing, `loading` starts at true for the
  // mount path, and refresh() below carries what the button needs to set
  // before the request goes out.
  const load = useCallback(
    () =>
      fetchRows()
        .then((next) => {
          setRows(next)
          setError("")
        })
        .catch((cause: unknown) => {
          setRows([])
          setError(errorText(cause))
        })
        .finally(() => setLoading(false)),
    []
  )

  const refresh = () => {
    setLoading(true)
    setError("")
    void load()
  }

  useEffect(() => {
    void load()
  }, [load])

  const updateRow = (uuid: string, index: number, patch: Partial<Row>) =>
    setRows((prev) => patchRow(prev, index, uuid, patch))

  const toggle = async (row: Row, index: number) => {
    if (!row.entry) return
    const revoke = !row.revoked
    updateRow(row.uuid, index, { busy: true, error: undefined })
    try {
      await setRevoked(row.uuid, revoke)
      // Re-read the bit rather than trusting the issuer's answer: it reports a
      // failed write as HTTP 200 UNKNOWN, and this also catches the case where
      // it claims REVOKED but the bit never moved.
      const actual = await readRevoked(row.entry)
      updateRow(row.uuid, index, {
        busy: false,
        revoked: actual,
        error:
          actual === revoke
            ? undefined
            : `The issuer reported success but the status list still says ${
                actual ? "revoked" : "not revoked"
              }.`,
      })
    } catch (error) {
      updateRow(row.uuid, index, { busy: false, error: errorText(error) })
    }
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-4 md:overflow-hidden">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <p className="text-sm text-[#484747] m-0">
          Credentials issued as <span className="font-semibold">{REVOCABLE_CREDENTIAL}</span>, newest
          first.
        </p>
        <button className="btn-secondary shrink-0" onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-[#d0021b] text-white px-4 py-3 rounded-md text-sm font-semibold w-full shrink-0"
        >
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-[#484747]">
          No credentials of this type have been issued yet. Issue one from the{" "}
          <span className="font-semibold">Veramo Issuer</span> tab using the “Status List Credential
          (revocable)” preset.
        </p>
      )}

      {rows.length > 0 && (
        <div className="w-full bg-white rounded-lg border border-[#CFE4EF] overflow-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#CFE4EF]">
                <th className="text-left px-4 py-3 font-semibold text-[#484747]">Issued</th>
                <th className="text-left px-4 py-3 font-semibold text-[#484747]">Credential</th>
                <th className="text-left px-4 py-3 font-semibold text-[#484747]">Holder</th>
                <th className="text-left px-4 py-3 font-semibold text-[#484747]">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-[#CFE4EF] last:border-b-0 align-top">
                  <td className="px-4 py-3 text-[#484747] whitespace-nowrap">
                    {formatIssued(row.issuanceDate)}
                  </td>
                  <td className="px-4 py-3 text-[#484747] font-mono text-xs" title={row.uuid}>
                    {row.uuid.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-[#484747] font-mono text-xs" title={row.holder}>
                    {truncate(row.holder)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusCell row={row} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.entry && (
                      <button
                        className="btn-secondary"
                        onClick={() => void toggle(row, index)}
                        disabled={row.busy || row.revoked === null}
                      >
                        {row.busy ? "Working…" : row.revoked ? "Unrevoke" : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// "Unknown" means the status list read failed, so it must not borrow the
// colour of "Not revoked": on this screen the safe-looking green would be
// claiming the opposite of what is known.
function statusClass(revoked: boolean | null): string {
  if (revoked === null) return "text-[var(--yivi-warning-text)]"
  return revoked ? "text-[#d0021b]" : "text-[var(--yivi-green-text)]"
}

function StatusCell({ row }: { row: Row }) {
  // No status list entry at all — the credential type had no `statusLists`
  // block configured when it was issued, so there is nothing to revoke.
  if (!row.entry) {
    return <span className="text-[var(--yivi-anthracite)]">— no status list</span>
  }
  return (
    <div className="flex flex-col gap-1">
      <span className={`${statusClass(row.revoked)} font-semibold`}>
        {row.revoked === null ? "Unknown" : row.revoked ? "Revoked" : "Not revoked"}
      </span>
      {row.error && (
        <span role="alert" className="text-[#d0021b] text-xs break-words">
          {row.error}
        </span>
      )}
    </div>
  )
}
