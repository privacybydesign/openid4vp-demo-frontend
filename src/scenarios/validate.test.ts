import { describe, expect, it } from "vitest"
import { validateScenarios } from "./validate"
import { SCENARIOS } from "./index"
import type { FormatChoice } from "./types"

describe("scenarios", () => {
  it("cover every case of the wallet prototype", () => {
    expect(SCENARIOS).toHaveLength(44)
  })

  it("hang together", () => {
    expect(validateScenarios()).toEqual([])
  })
})

describe("the checks themselves", () => {
  const hotel = SCENARIOS.find((s) => s.id === "hotel")!
  const stress = SCENARIOS.find((s) => s.id === "stress")!

  it("catch an IRMA attribute the card never issues", () => {
    const broken = { ...hotel, irma: { ...hotel.irma!, request: { disclose: [[["irma-demo.sidn-pbdf.email.emial"]]] } } }
    expect(validateScenarios([broken])).toEqual([
      "hotel: IRMA request asks for irma-demo.sidn-pbdf.email.emial, which the email card never issues",
    ])
  })

  it("catch a credential set naming a missing query", () => {
    const broken = {
      ...hotel,
      dcql: { ...hotel.dcql!, query: () => ({ credentials: [], credential_sets: [{ options: [["nope"]] }] }) },
    }
    expect(validateScenarios([broken])).toContain('hotel: credential_sets names "nope", which is not a query')
  })

  it("catch a Veramo claim the card never carries, in either format", () => {
    const broken = {
      ...stress,
      dcql: {
        ...stress.dcql!,
        query: (f: FormatChoice) => {
          const q = stress.dcql!.query(f) as { credentials: { claims: { path: unknown[] }[] }[] }
          q.credentials[0].claims[0].path = f.email === "vcdm" ? ["credentialSubject", "mail"] : ["mail"]
          return q
        },
      },
    }
    const problems = validateScenarios([broken])
    expect(problems.filter((p) => p.includes('"mail"'))).toHaveLength(2)
  })

  it("catch a variant without a reason when it is missing", () => {
    expect(validateScenarios([{ ...hotel, irma: undefined }])).toContain(
      "hotel: needs either an IRMA variant or a reason it has none"
    )
  })
})
