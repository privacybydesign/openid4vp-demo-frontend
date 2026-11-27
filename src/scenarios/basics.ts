import type { Scenario } from "./types"
import { card, during, wallet, ia, iv, irmaDisclosure, pbdfQ, veramoQ, dcql, set } from "./build"

export const MAIL1 = { email: "sanne@example.nl" }
export const MAIL2 = { email: "s.devries@werk.example" }
export const MAIL3 = { email: "sanne@studie.example" }
export const PASS1 = { documentNumber: "NX4R7K2P9" }
export const PASS2 = { documentNumber: "PK7T2M4X1" }
export const PASS3 = { documentNumber: "RB3W8N5L2" }

const DOC = ["firstName", "lastName", "documentNumber"]
const IRMA_PASSPORT = ia("passport", "kind", "number")
const IRMA_IDCARD = ia("idcard", "type", "number")
const IRMA_DRIVING = ia("driving", "firstName", "lastName", "documentNumber")

export const basics: Scenario[] = [
  {
    id: "eenvoudig",
    group: "basics",
    title: "One attribute",
    description: "One email address, and the wallet already has it.",
    prototypeFrame: "R1_Alles_in_je_app",
    wallet: wallet([card("email", MAIL1)]),
    irma: { request: irmaDisclosure([[ia("email", "email")]]), status: "native" },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () => dcql([pbdfQ("email", "email", ["email"])]),
    },
    unavailable: {},
    expected: "The email address.",
    lookFor: [
      "Everything is already in the app, so the overview opens straight away",
      "One card with one value: the email address",
    ],
  },
  {
    id: "keuze",
    group: "basics",
    title: "Two choices",
    description:
      "Over 18 from two passports, a driving licence, an ID card or personal data; and one of two email addresses.",
    prototypeFrame: "R7_Eenvoudige_keuze",
    wallet: wallet(
      [card("passport", PASS1), card("passport", PASS2), card("driving"), card("email", MAIL1), card("email", MAIL2)],
      [during("A third email address, if you want to choose it", card("email", MAIL3))],
      ["idcard", "personal"]
    ),
    irma: {
      status: "check",
      note: "The irma-demo passport and ID card have no over-18 attribute, so those two options ask for the document instead.",
      request: irmaDisclosure([
        [IRMA_PASSPORT, [iv("driving", "over18", "yes")], IRMA_IDCARD, [iv("personal", "over18", "Yes")]],
        [ia("email", "email")],
      ]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "check",
      note: "Needs two passports from the staging passport issuer, and the EUDI verifier has to accept pbdf-staging iDIN.",
      query: () =>
        dcql(
          [
            pbdfQ("passport", "passport", [{ path: ["over18"], values: ["Yes"] }]),
            pbdfQ("driving", "driving", [{ path: ["over18"], values: ["Yes"] }]),
            pbdfQ("idcard", "idcard", [{ path: ["over18"], values: ["Yes"] }]),
            pbdfQ("personal", "personal", [{ path: ["over18"], values: ["Yes"] }]),
            pbdfQ("email", "email", ["email"]),
          ],
          [set([["passport"], ["driving"], ["idcard"], ["personal"]]), set([["email"]])]
        ),
    },
    unavailable: {},
    expected: "Over 18 from one of the cards, and one email address.",
    lookFor: [
      "Small request: Edit is a single link to what you share",
      "Both passports are offered; the ID card and personal data are listed as addable",
      "Choosing which email address offers both, plus adding a third",
    ],
  },
  {
    id: "drie",
    group: "basics",
    title: "Two passports and a licence",
    description: "Passport, ID card or driving licence, with two passports and a licence in the app; plus email.",
    prototypeFrame: "S6_Regels",
    wallet: wallet(
      [card("passport", PASS1), card("passport", PASS2), card("driving"), card("email", MAIL1)],
      [during("Another passport or an ID card, if you want to choose it", card("passport", PASS3), card("idcard"))]
    ),
    irma: {
      status: "native",
      request: irmaDisclosure([[IRMA_PASSPORT, IRMA_IDCARD, IRMA_DRIVING], [ia("email", "email")]]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "check",
      note: "Needs two or three passports from the staging passport issuer.",
      query: () =>
        dcql(
          [
            pbdfQ("passport", "passport", DOC),
            pbdfQ("idcard", "idcard", DOC),
            pbdfQ("driving", "driving", DOC),
            pbdfQ("email", "email", ["email"]),
          ],
          [set([["passport"], ["idcard"], ["driving"]]), set([["email"]])]
        ),
    },
    unavailable: {},
    expected: "One identity document and the email address.",
    lookFor: [
      "The sheet groups your cards by kind: passports together, then the licence",
      "The ID card is offered to add",
    ],
  },
  {
    id: "ontbreekt",
    group: "basics",
    title: "One card missing",
    description: "Personal data is in the app; the email address has to be added first.",
    prototypeFrame: "R3_Meer_toevoegen",
    wallet: wallet([card("personal")], [during("Email address", card("email", MAIL1))], ["email"]),
    irma: {
      status: "native",
      request: irmaDisclosure([[ia("personal", "firstnames", "familyname")], [ia("email", "email")]]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "check",
      note: "iDIN stands in for personal data; the EUDI verifier has to accept pbdf-staging iDIN.",
      query: () =>
        dcql([pbdfQ("personal", "personal", ["initials", "familyname"]), pbdfQ("email", "email", ["email"])]),
    },
    unavailable: {},
    expected: "Name from personal data, and the newly added email address.",
    lookFor: ["Only the missing email address is shown as a step", "After adding it, you tap to continue to the overview"],
  },
  {
    id: "hotel",
    group: "basics",
    title: "Pick one of three kinds",
    description:
      "Passport, ID card or driving licence, plus an email address; a mobile number is optional. None of the three identity cards is in the app yet.",
    prototypeFrame: "R2_Eerst_toevoegen",
    wallet: wallet(
      [card("email", MAIL1), card("phone")],
      [during("Passport, ID card or driving licence: any one", card("passport", PASS1), card("idcard"), card("driving"))],
      ["passport", "idcard", "driving"]
    ),
    irma: {
      status: "native",
      request: irmaDisclosure([
        [IRMA_PASSPORT, IRMA_IDCARD, IRMA_DRIVING],
        [ia("email", "email")],
        [[], ia("phone", "mobilenumber")],
      ]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () =>
        dcql(
          [
            pbdfQ("passport", "passport", DOC),
            pbdfQ("idcard", "idcard", DOC),
            pbdfQ("driving", "driving", DOC),
            pbdfQ("email", "email", ["email"]),
            pbdfQ("phone", "phone", ["mobilenumber"]),
          ],
          [set([["passport"], ["idcard"], ["driving"]]), set([["email"]]), set([["phone"]], false)]
        ),
    },
    unavailable: {},
    expected: "One of passport, ID card or licence (with document number), the email address, and the mobile number if switched on.",
    lookFor: [
      "The overview lists only what is still missing",
      "Choosing which card to add offers passport, ID card and licence",
      "Adding happens in the sheet, as it does today",
      "The issuer's question shows before the card lands",
      "After landing you tap to continue; nothing advances by itself",
      "Switching the optional mobile number on adds it to the overview",
    ],
  },
  {
    id: "gemeente",
    group: "basics",
    title: "Two cards missing",
    description: "Personal data and an email address are both missing, and an optional mobile number too.",
    prototypeFrame: "R3_Meer_toevoegen",
    wallet: wallet(
      [],
      [
        during("Personal data", card("personal")),
        during("Email address", card("email", MAIL1)),
        during("Mobile number (optional)", card("phone")),
      ],
      ["personal", "email", "phone"]
    ),
    irma: {
      status: "native",
      request: irmaDisclosure([
        [ia("personal", "firstnames", "familyname", "dateofbirth", "bsn")],
        [ia("email", "email")],
        [[], ia("phone", "mobilenumber")],
      ]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "check",
      note: "iDIN stands in for personal data, so there is no BSN; the EUDI verifier has to accept pbdf-staging iDIN.",
      query: () =>
        dcql(
          [
            pbdfQ("personal", "personal", ["initials", "familyname", "dateofbirth"]),
            pbdfQ("email", "email", ["email"]),
            pbdfQ("phone", "phone", ["mobilenumber"]),
          ],
          [set([["personal"]]), set([["email"]]), set([["phone"]], false)]
        ),
    },
    unavailable: {},
    expected: "Personal data, email address, and the mobile number if added.",
    lookFor: [
      "Two required steps, and the optional one is marked as optional",
      "The optional card can be skipped without adding it",
    ],
  },
  {
    id: "speelhal",
    group: "basics",
    title: "A required value",
    description: "Over 18 has to be Yes. None of the cards that carry it is in the app yet.",
    prototypeFrame: "R4_Waarden_en_problemen",
    wallet: wallet(
      [],
      [during("Passport, ID card or driving licence: any one", card("passport", PASS1), card("idcard"), card("driving"))],
      ["passport", "idcard", "driving"]
    ),
    irma: {
      status: "check",
      note: "The irma-demo passport and ID card have no over-18 attribute, so personal data takes their place.",
      wallet: wallet(
        [],
        [during("Driving licence or personal data: any one", card("driving"), card("personal"))],
        ["driving", "personal"]
      ),
      request: irmaDisclosure([[[iv("driving", "over18", "yes")], [iv("personal", "over18", "Yes")]]]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () => {
        const over18 = [{ path: ["over18"], values: ["Yes"] }]
        return dcql(
          [pbdfQ("passport", "passport", over18), pbdfQ("idcard", "idcard", over18), pbdfQ("driving", "driving", over18)],
          [set([["passport"], ["idcard"], ["driving"]])]
        )
      },
    },
    unavailable: {},
    expected: "Over 18 = Yes, from one card.",
    lookFor: ["The requested value is shown: “Requested: Over 18 Yes”", "Adding a card shows the requested value on its first page"],
  },
  {
    id: "parkeren",
    group: "basics",
    title: "Wallet holds another value",
    description: "The city must be Rijnstad; the address in the app says Utrecht.",
    prototypeFrame: "R4_Waarden_en_problemen",
    wallet: wallet(
      [card("address", { city: "Utrecht", municipality: "Utrecht" })],
      [during("An address in Rijnstad", card("address"))]
    ),
    irma: { status: "native", request: irmaDisclosure([[[iv("address", "city", "Rijnstad")]]]) },
    dcql: {
      source: "veramo",
      during: "drop",
      status: "flagged",
      note: "Stops at the mismatch: the address with the right value can't be added over OpenID4VCI.",
      query: (f) => dcql([veramoQ("address", "address", [{ path: ["locality"], values: ["Rijnstad"] }], f)]),
    },
    unavailable: {},
    expected: "An address in Rijnstad, after adding one.",
    lookFor: ["The card in the app is shown with its value and why it doesn't count", "The way out is adding an address with the right value"],
  },
  {
    id: "verlopen",
    group: "basics",
    title: "Expired card",
    description: "The passport in the app has expired; add it again or choose another card.",
    prototypeFrame: "R4_Waarden_en_problemen",
    wallet: wallet(
      [card("passport", PASS1, "expired"), card("email", MAIL1)],
      [during("ID card or driving licence", card("idcard"), card("driving"))]
    ),
    irma: {
      status: "check",
      note: "irma-demo expiry is week-granular, so the passport can't be issued already expired: let it expire, or move the phone's clock forward.",
      request: irmaDisclosure([[IRMA_PASSPORT, IRMA_IDCARD, IRMA_DRIVING], [ia("email", "email")]]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "flagged",
      note: "The passport is issued with a 60-second expiry.",
      query: (f) => {
        const doc = ["given_name", "family_name", "document_number"]
        return dcql(
          [
            veramoQ("passport", "passport", doc, f),
            veramoQ("idcard", "idcard", doc, f),
            veramoQ("driving", "driving", doc, f),
            veramoQ("email", "email", ["email"], f),
          ],
          [set([["passport"], ["idcard"], ["driving"]]), set([["email"]])]
        )
      },
    },
    unavailable: {},
    expected: "An ID card or licence, or a passport added again; and the email address.",
    lookFor: ["The expired passport is shown as “Expired” and can't be chosen", "Adding it again and choosing another card are both offered"],
  },
  {
    id: "set",
    group: "basics",
    title: "Cards that belong together",
    description: "Personal data and an address are asked for as one option; one of the two is in the app.",
    prototypeFrame: "R6_Naast_of_onder",
    wallet: wallet([card("personal"), card("email", MAIL1)], [during("Address", card("address"))], ["address"]),
    irma: {
      status: "native",
      request: irmaDisclosure([
        [[...ia("personal", "firstnames", "familyname"), ...ia("address", "street", "city")]],
        [ia("email", "email")],
      ]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "flagged",
      query: (f) =>
        dcql(
          [
            veramoQ("personal", "personal", ["given_name", "family_name"], f),
            veramoQ("address", "address", ["street_address", "locality"], f),
            veramoQ("email", "email", ["email"], f),
          ],
          [set([["personal", "address"]]), set([["email"]])]
        ),
    },
    unavailable: {},
    expected: "Name and address together, and the email address.",
    lookFor: ["The two cards of the option are shown together", "Only the missing address is a step to do"],
  },
  {
    id: "lang",
    group: "basics",
    title: "Long names and values",
    description: "Very long names, an address and an email address, to see how they wrap.",
    prototypeFrame: "R5_Soorten_verzoek",
    wallet: wallet([
      card("personal", {
        givenName: "Maria Josephina Wilhelmina",
        familyName: "van der Heijden-van den Broek",
        prefix: "van der",
        surname: "Heijden-van den Broek",
      }),
      card("address", {
        street: "Burgemeester Van Walsumlaan",
        houseNumber: "1284-III",
        city: "’s-Hertogenbosch",
        municipality: "’s-Hertogenbosch",
      }),
      card("email", { email: "maria.vanderheijden-vandenbroek@zorgverzekeraarzuid.example" }),
    ]),
    irma: {
      status: "native",
      request: irmaDisclosure([
        [ia("personal", "firstnames", "familyname")],
        [ia("address", "street", "houseNumber", "city")],
        [ia("email", "email")],
      ]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      query: (f) =>
        dcql([
          veramoQ("personal", "personal", ["given_name", "family_name"], f),
          veramoQ("address", "address", ["street_address", "locality"], f),
          veramoQ("email", "email", ["email"], f),
        ]),
    },
    unavailable: {},
    expected: "The long values, unshortened.",
    lookFor: ["Long values wrap instead of being cut off", "Long names don't push buttons off screen"],
  },
]
