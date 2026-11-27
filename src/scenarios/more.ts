import type { Scenario } from "./types"
import {
  card,
  during,
  wallet,
  ia,
  iv,
  icred,
  irmaDisclosure,
  irmaIssuance,
  pbdfQ,
  veramoQ,
  eudiPidQ,
  mdocQ,
  dcql,
  set,
} from "./build"
import { MAIL1, MAIL2, MAIL3, PASS1, PASS2 } from "./basics"

const NOT_ONE_OF = "IRMA can only ask for one exact value, not one of several."
const NO_NESTING = "IRMA attributes are flat strings: there is no nested data."
const PHOTO_IRMA = "The irma-demo passport type has no photo."

export const values: Scenario[] = [
  {
    id: "waarden",
    group: "values",
    title: "One of three countries",
    description: "The country must be NL, BE or LU, and over 18 must be Yes. The EU identity is not in the app yet.",
    prototypeFrame: "W1_Meerdere_waarden",
    wallet: wallet([card("email", MAIL1)], [during("EU identity", card("pid"))], ["pid"]),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "flagged",
      note: "Uses the Veramo EU identity, so the whole request stays on one verifier.",
      query: (f) =>
        dcql([
          veramoQ(
            "pid",
            "pid",
            [["address", "street_address"], ["address", "locality"], { path: ["address", "country"], values: ["NL", "BE", "LU"] }, { path: ["age_over_18"], values: [true] }],
            f
          ),
          veramoQ("email", "email", ["email"], f),
        ]),
    },
    unavailable: { irma: NOT_ONE_OF },
    expected: "A Dutch, Belgian or Luxembourgish address, over 18, and the email address.",
    lookFor: ["The allowed values are listed: “Country NL, BE or LU”", "The whole list shows on the first page of adding"],
  },
  {
    id: "waardenveel",
    group: "values",
    title: "One of seven provinces",
    description: "The province must be one of seven: too many to list in full.",
    prototypeFrame: "W1_Meerdere_waarden",
    wallet: wallet([], [during("Address", card("address"))], ["address"]),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "flagged",
      query: (f) =>
        dcql([
          veramoQ(
            "address",
            "address",
            ["postal_code", { path: ["province"], values: ["Gelderland", "Overijssel", "Flevoland", "Drenthe", "Utrecht", "Groningen", "Friesland"] }],
            f
          ),
        ]),
    },
    unavailable: { irma: NOT_ONE_OF },
    expected: "An address in one of the seven provinces.",
    lookFor: ["Three values are shown, then “and four more”", "All seven are on the first page of adding"],
  },
  {
    id: "waardentelt",
    group: "values",
    title: "Your card has another value",
    description: "The city must be one of three; the address in the app is in Utrecht.",
    prototypeFrame: "W1_Meerdere_waarden",
    wallet: wallet([card("address", { city: "Utrecht", municipality: "Utrecht" })], [during("An address in Rijnstad", card("address"))]),
    dcql: {
      source: "veramo",
      during: "drop",
      status: "flagged",
      note: "Stops at the mismatch: the address with the right value can't be added over OpenID4VCI.",
      query: (f) =>
        dcql([veramoQ("address", "address", [{ path: ["locality"], values: ["Rijnstad", "Havenstad", "Dijkdorp"] }], f)]),
    },
    unavailable: { irma: NOT_ONE_OF },
    expected: "An address in Rijnstad, Havenstad or Dijkdorp.",
    lookFor: ["The card in the app is shown with its value and why it doesn't count"],
  },
  {
    id: "waardenkeuze",
    group: "values",
    title: "Two of your three cards qualify",
    description: "Three EU identities in the app, from NL, BE and FR. The French one is not among the allowed values.",
    prototypeFrame: "W1_Meerdere_waarden",
    wallet: wallet([
      card("pid"),
      card("pid", { street: "Meir 40", postalCode: "2000", city: "Antwerpen", country: "BE", nationalities: "BE" }),
      card("pid", { street: "Rue de Rivoli 1", postalCode: "75001", city: "Paris", country: "FR", nationalities: "FR" }),
    ]),
    dcql: {
      source: "eudi",
      during: "upFront",
      status: "native",
      note: "The real EUDI PID, on the EUDI verifier.",
      query: () =>
        dcql([
          eudiPidQ("pid", [["address", "street_address"], ["address", "locality"], { path: ["address", "country"], values: ["NL", "BE", "LU"] }]),
        ]),
    },
    unavailable: { irma: NOT_ONE_OF },
    expected: "The Dutch or the Belgian EU identity.",
    lookFor: ["Only the cards that count are offered", "The French EU identity is not offered"],
  },
]

export const rich: Scenario[] = [
  {
    id: "genest",
    group: "rich",
    title: "Nested data",
    description: "An address with a country inside it, and a list of nationalities.",
    prototypeFrame: "G1_Geneste_gegevens",
    wallet: wallet([card("pid", { nationalities: "NL,BE" }), card("email", MAIL1)]),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      note: "Uses the Veramo EU identity, so the whole request stays on one verifier.",
      query: (f) =>
        dcql([veramoQ("pid", "pid", ["given_name", "family_name", "address", "nationalities"], f), veramoQ("email", "email", ["email"], f)]),
    },
    unavailable: { irma: NO_NESTING },
    expected: "Names, the whole address object and the list of nationalities.",
    lookFor: ["The address shows as a group, with its fields indented", "Nationalities show as a list"],
  },
  {
    id: "diepgenest",
    group: "rich",
    title: "Deeply nested data",
    description: "Faculties, with departments in them, with courses in those.",
    prototypeFrame: "G4_Genest_opties",
    wallet: wallet([card("study"), card("email", MAIL1), card("email", MAIL2)]),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      query: (f) => dcql([veramoQ("study", "study", ["name", "faculties"], f), veramoQ("email", "email", ["email"], f)]),
    },
    unavailable: { irma: NO_NESTING },
    expected: "The organisation's name and every faculty with its departments and courses.",
    lookFor: ["Lists inside lists stay readable", "Deep levels fold instead of running off screen"],
  },
  {
    id: "rijbewijs",
    group: "rich",
    title: "Licence categories",
    description: "The app's table of driving licence categories, with dates; an optional mobile number.",
    prototypeFrame: "G2_Eigen_weergaves",
    wallet: wallet([card("driving"), card("phone")]),
    irma: {
      status: "native",
      request: irmaDisclosure([
        [
          ia(
            "driving",
            "firstName",
            "lastName",
            "documentNumber",
            ...["AM", "B", "A"].flatMap((c) => [`category${c}`, `category${c}DateOfIssue`, `category${c}DateOfExpiry`])
          ),
        ],
        [[], ia("phone", "mobilenumber")],
      ]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      query: (f) =>
        dcql(
          [
            veramoQ("driving", "driving", ["given_name", "family_name", "document_number", "driving_privileges"], f),
            veramoQ("phone", "phone", ["phone_number"], f),
          ],
          [set([["driving"]]), set([["phone"]], false)]
        ),
    },
    unavailable: {},
    expected: "Names, document number and the categories AM, B and A with their dates.",
    lookFor: ["The categories show as the app's own table, not as raw values"],
  },
  {
    id: "rijbewijsstatus",
    group: "rich",
    title: "Licence categories, no dates",
    description: "Only whether you have category B and C.",
    prototypeFrame: "G2_Eigen_weergaves",
    wallet: wallet([card("driving", { categories: "B" })]),
    irma: { status: "native", request: irmaDisclosure([[ia("driving", "categoryB", "categoryC")]]) },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      query: (f) => dcql([veramoQ("driving", "driving", [{ path: ["driving_privileges", null, "vehicle_category_code"] }], f)]),
    },
    unavailable: {},
    expected: "B yes, C no.",
    lookFor: ["The table shows only the status column", "A category you don't have reads as “no”, not as empty"],
  },
  {
    id: "foto",
    group: "rich",
    title: "Share a photo",
    description: "A passport photo, with name and age.",
    prototypeFrame: "G3_Afbeeldingen",
    wallet: wallet([card("passport", PASS1)]),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      query: (f) => dcql([veramoQ("passport", "passport", ["portrait", "given_name", "family_name", "age_over_18"], f)]),
    },
    unavailable: { irma: PHOTO_IRMA },
    expected: "The portrait, names and over 18.",
    lookFor: ["The photo shows as an image, not as text"],
  },
  {
    id: "fotokeuze",
    group: "rich",
    title: "Choose between cards with a photo",
    description: "Two passports, or a driving licence with a signature, or an ID card; plus email.",
    prototypeFrame: "G3_Afbeeldingen",
    wallet: wallet(
      [card("passport", PASS1), card("passport", PASS2), card("driving", { signature: "yes" }), card("email", MAIL1)],
      [during("An ID card, if you want to choose it", card("idcard"))]
    ),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "flagged",
      query: (f) =>
        dcql(
          [
            veramoQ("passport", "passport", ["portrait", "family_name", "document_number"], f),
            veramoQ("driving", "driving", ["portrait", "signature", "family_name", "document_number"], f),
            veramoQ("idcard", "idcard", ["portrait", "family_name", "document_number"], f),
            veramoQ("email", "email", ["email"], f),
          ],
          [set([["passport"], ["driving"], ["idcard"]]), set([["email"]])]
        ),
    },
    unavailable: { irma: PHOTO_IRMA },
    expected: "One document with its portrait, and the email address.",
    lookFor: ["Each choice shows its photo, so the two passports can be told apart"],
  },
]

export const extras: Scenario[] = [
  {
    id: "alleenkaartje",
    group: "extras",
    title: "A card without attributes",
    description: "Only that you have the card, none of its values.",
    prototypeFrame: "D1_Dekking",
    wallet: wallet([card("study"), card("email", MAIL1)]),
    irma: {
      status: "check",
      note: "Study data has no irma-demo type, so a diploma stands in.",
      wallet: wallet([card("diploma"), card("email", MAIL1)]),
      request: irmaDisclosure([[[icred("diploma")]], [ia("email", "email")]]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      query: (f) => dcql([veramoQ("study", "study", [], f, { noClaims: true }), veramoQ("email", "email", ["email"], f)]),
    },
    unavailable: {},
    expected: "Proof that you have the card, and the email address.",
    lookFor: ["The card says “Only that you have this card”"],
  },
  {
    id: "tweesets",
    group: "extras",
    title: "One card for two questions",
    description: "Email or mobile number, and email with a bank account: one query in two credential sets.",
    prototypeFrame: "D1_Dekking",
    wallet: wallet([card("email", MAIL1), card("email", MAIL2), card("email", MAIL3), card("phone"), card("iban"), card("iban", { iban: "NL34RABO0123456789", bic: "RABONL2U" })]),
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () =>
        dcql(
          [pbdfQ("email", "email", ["email"]), pbdfQ("phone", "phone", ["mobilenumber"]), pbdfQ("iban", "iban", ["fullname", "iban"])],
          [set([["email"], ["phone"]]), set([["email", "iban"]])]
        ),
    },
    unavailable: { irma: "A condiscon has no way to use one disclosed credential for two discons." },
    expected: "One email address, used for both questions, and a bank account.",
    lookFor: ["The card says it counts for two questions", "Choosing the email address once sets it for both"],
  },
  {
    id: "claimsets",
    group: "extras",
    title: "Prefer this claim, else that",
    description: "Over 18 if your EU identity has it, otherwise your date of birth.",
    prototypeFrame: "D1_Dekking",
    wallet: wallet([card("pid"), card("pid", { over18: "omit", street: "Havenkade 5", city: "Utrecht" })]),
    dcql: {
      source: "eudi",
      during: "upFront",
      status: "check",
      note: "Whether the EUDI issuer takes age_equal_or_over in its PID offer is unconfirmed.",
      query: () =>
        dcql([
          eudiPidQ("pid", [{ id: "age", path: ["age_equal_or_over", "18"] }, { id: "birth", path: ["birthdate"] }], {
            claim_sets: [["age"], ["birth"]],
          }),
        ]),
    },
    unavailable: { irma: "There are no claim_sets in a condiscon." },
    expected: "Over 18 from the first EU identity, or the date of birth from the second.",
    lookFor: ["Each card shares only the first claim set it can answer", "Two cards of one kind can share different fields"],
  },
  {
    id: "bewaren",
    group: "extras",
    title: "The verifier retains data",
    description: "The verifier says up front which values it keeps: from the driving licence, not from the optional mobile number.",
    prototypeFrame: "D1_Dekking",
    wallet: wallet([card("driving")], [during("Mobile number (optional)", card("phone"))], ["phone"]),
    dcql: {
      source: "eudi",
      during: "inFlow",
      status: "native",
      note: "The licence is the EUDI mDL; the optional mobile number is a pbdf-staging SD-JWT, added in the flow.",
      query: () =>
        dcql(
          [
            mdocQ("licence", "org.iso.18013.5.1.mDL", "org.iso.18013.5.1", [
              { name: "family_name", intentToRetain: true },
              { name: "document_number", intentToRetain: true },
              { name: "birth_date" },
            ]),
            pbdfQ("phone", "phone", ["mobilenumber"]),
          ],
          [set([["licence"]]), set([["phone"]], false)]
        ),
    },
    unavailable: { irma: "There is no intent_to_retain in IRMA." },
    expected: "Family name and document number (kept), birth date, and the mobile number if added.",
    lookFor: ["Values the verifier keeps are marked as kept", "The mobile number is not marked"],
  },
  {
    id: "keten",
    group: "extras",
    title: "A chained session",
    description: "After you share your personal data, the same party gives you an address.",
    prototypeFrame: "D2_Vervolgverzoek",
    wallet: wallet([card("personal")]),
    irma: {
      status: "check",
      note: "The IRMA server fetches the next session from this tool, so this works on the deployed tool, not from localhost.",
      nextSession: "address",
      request: irmaDisclosure([[ia("personal", "firstnames", "familyname", "bsn")]]),
    },
    unavailable: { dcql: "OpenID4VP has no chained sessions." },
    expected: "Personal data; then an address lands in the wallet.",
    lookFor: ["After sharing, the next request follows without a new scan", "The address is offered as a card to add"],
  },
]

export const edge: Scenario[] = [
  {
    id: "verkeerd",
    group: "edge",
    title: "The added card has the wrong value",
    description: "Asked: Rijnstad. The issuer you add from gives an address in Utrecht.",
    prototypeFrame: "E3_Verkeerd_kaartje",
    wallet: wallet([], [during("Address (the issuer deliberately gives Utrecht)", card("address", { street: "Oudegracht", houseNumber: "21", city: "Utrecht", municipality: "Utrecht" }))], ["address"]),
    irma: { status: "native", request: irmaDisclosure([[[iv("address", "city", "Rijnstad")]]]) },
    unavailable: { dcql: "It needs adding mid-session with a chosen wrong value: OpenID4VCI can't add, and pbdf-staging values can't be chosen." },
    expected: "Nothing: the added address doesn't count.",
    lookFor: ["After adding, the wallet says the new card doesn't match", "You can try adding again or stop"],
  },
  {
    id: "kanniet",
    group: "edge",
    title: "Cannot be added in Yivi",
    description: "An exam registration you have to get from the school; Yivi can't add it.",
    prototypeFrame: "E1_Kan_niet_en_ingetrokken",
    wallet: wallet([card("personal")], [], ["exam"]),
    irma: {
      status: "native",
      note: "The irma-demo type has no IssueURL. Don't issue it from this tool: that would defeat the scenario.",
      request: irmaDisclosure([[ia("personal", "firstnames", "familyname")], [ia("exam", "election", "start")]]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      note: "No OpenID4VCI card can be added mid-session, so any of them shows this.",
      query: (f) => dcql([veramoQ("personal", "personal", ["given_name", "family_name"], f), veramoQ("exam", "exam", ["exam", "date"], f)]),
    },
    unavailable: {},
    expected: "Nothing: the session can't be completed.",
    lookFor: ["The missing card says it can't be added in Yivi", "It says where to get it instead"],
  },
  {
    id: "nietvernieuwen",
    group: "edge",
    title: "Revoked and cannot be renewed",
    description: "Your exam registration has been revoked, and Yivi can't add a new one.",
    prototypeFrame: "E1_Kan_niet_en_ingetrokken",
    wallet: wallet([card("exam", undefined, "revoked")]),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "check",
      note: "Needs a status list on the Veramo exam registration type.",
      query: (f) => dcql([veramoQ("exam", "exam", ["exam", "date"], f)]),
    },
    unavailable: { irma: "There is no revocable irma-demo type without an IssueURL." },
    expected: "Nothing: the only card is revoked.",
    lookFor: ["The card shows “Revoked”", "No option to renew it is offered"],
  },
  {
    id: "ingetrokken",
    group: "edge",
    title: "Revoked card",
    description: "Your personal data has been revoked; add it again.",
    prototypeFrame: "E1_Kan_niet_en_ingetrokken",
    wallet: wallet([card("personal", undefined, "revoked"), card("email", MAIL1)]),
    irma: {
      status: "check",
      note: "The revocable irma-demo type is MijnOverheid.root (BSN), so it stands in for personal data.",
      wallet: wallet([card("bsn", undefined, "revoked"), card("email", MAIL1)]),
      request: irmaDisclosure([[ia("bsn", "BSN")], [ia("email", "email")]]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "check",
      note: "Needs a status list on the Veramo personal data type.",
      query: (f) => dcql([veramoQ("personal", "personal", ["given_name", "family_name", "bsn"], f), veramoQ("email", "email", ["email"], f)]),
    },
    unavailable: {},
    expected: "Personal data, after adding it again; and the email address.",
    lookFor: ["The revoked card is shown as “Revoked”", "Adding it again is offered"],
  },
  {
    id: "eeningetrokken",
    group: "edge",
    title: "One revoked among others",
    description: "Three email addresses in the app; one of them is revoked.",
    prototypeFrame: "E1_Kan_niet_en_ingetrokken",
    wallet: wallet([card("email", MAIL1), card("email", MAIL2), card("email", MAIL3, "revoked")]),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "check",
      note: "Needs a status list on the Veramo email type.",
      query: (f) => dcql([veramoQ("email", "email", ["email"], f)]),
    },
    unavailable: { irma: "The irma-demo email type is not revocable." },
    expected: "One of the two email addresses that aren't revoked.",
    lookFor: [
      "All three addresses are listed under “Which email address”",
      "The revoked one says “Revoked” and can't be chosen",
      "The default choice is not the revoked one",
    ],
  },
  {
    id: "ontvangen",
    group: "edge",
    title: "Disclose and receive",
    description: "You share your personal data and get an address card in the same session.",
    prototypeFrame: "E2_Ontvangen_en_niets_verplicht",
    wallet: wallet([card("personal")]),
    irma: {
      status: "native",
      request: irmaIssuance([card("address")], [[ia("personal", "firstnames", "familyname", "bsn")]]),
    },
    unavailable: { dcql: "OpenID4VP can't issue while disclosing." },
    expected: "Personal data; the address lands in the wallet.",
    lookFor: ["The overview shows both what you share and what you receive"],
  },
  {
    id: "nietsnodig",
    group: "edge",
    title: "Nothing required",
    description: "Only optional data: an email address you have, and a mobile number you don't.",
    prototypeFrame: "E2_Ontvangen_en_niets_verplicht",
    wallet: wallet([card("email", MAIL1)], [during("Mobile number (optional)", card("phone"))], ["phone"]),
    irma: {
      status: "native",
      request: irmaDisclosure([[[], ia("email", "email")], [[], ia("phone", "mobilenumber")]]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () =>
        dcql([pbdfQ("email", "email", ["email"]), pbdfQ("phone", "phone", ["mobilenumber"])], [set([["email"]], false), set([["phone"]], false)]),
    },
    unavailable: {},
    expected: "Whatever you switched on, possibly nothing.",
    lookFor: ["Sharing nothing is allowed", "Both cards are off until switched on"],
  },
]
