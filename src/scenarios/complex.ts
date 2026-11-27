import type { FormatChoice, Scenario, WalletState } from "./types"
import { card, during, wallet, ia, iv, irmaDisclosure, pbdfQ, veramoQ, dcql, set } from "./build"
import { MAIL1, MAIL2, MAIL3, PASS1, PASS2, PASS3 } from "./basics"

const PHONE2 = { mobile: "+31687654321" }
const PHONE3 = { mobile: "+31624680135" }
const PHONE4 = { mobile: "+31611223344" }
const IBAN2 = { iban: "NL34RABO0123456789", bic: "RABONL2U" }
const DIPLOMA2 = { education: "Master Zorgmanagement", achieved: "2019" }
const DIPLOMA3 = { education: "MBO Verzorgende IG", achieved: "2010" }
const DIPLOMA4 = { education: "Post-hbo Wijkverpleging", achieved: "2022" }

const MULTI_NON_SINGLETON =
  "The staging IRMA server refuses several non-singleton credentials in one inner con (irmago #804), so it rejects this request until that lands."

const IRMA_ADDRESS = ia("address", "street", "city")

// The three ways to identify yourself with an address, shared by opties,
// optiesleeg and groot.
const IRMA_OPTIONS = [
  ia("personal", "firstnames", "familyname"),
  [...ia("passport", "kind", "number"), ...IRMA_ADDRESS],
  [...ia("driving", "firstName", "lastName", "documentNumber"), ...IRMA_ADDRESS],
]

function veramoOptions(f: FormatChoice): object[] {
  const doc = ["given_name", "family_name", "document_number"]
  return [
    veramoQ("personal", "personal", ["given_name", "family_name"], f),
    veramoQ("passport", "passport", doc, f),
    veramoQ("address", "address", ["street_address", "locality"], f),
    veramoQ("driving", "driving", doc, f),
  ]
}
const VERAMO_OPTIONS_SET = set([["personal"], ["passport", "address"], ["driving", "address"]])

// The stress test: two required sets, each with two options of two credentials.
//   A: [email, mobile] or [bank account, passport]
//   B: [EU identity, licence] or [address, ID card]
// The EU identity must be Dutch; a Belgian one fails the value check.
const STRESS_FULL: WalletState = wallet(
  [
    card("email", MAIL1),
    card("email", MAIL2),
    card("email", MAIL3),
    card("phone"),
    card("phone", PHONE2),
    card("iban"),
    card("iban", IBAN2),
    card("passport", PASS1),
    card("passport", PASS2),
    card("pid"),
    card("pid", { street: "Havenkade 5", postalCode: "3511 CD", city: "Utrecht" }),
    card("pid", { street: "Meir 40", postalCode: "2000", city: "Antwerpen", country: "BE", nationalities: "BE" }),
    card("driving"),
    card("address"),
  ],
  [during("ID card, to complete the second option of set B", card("idcard"))],
  ["idcard"]
)

function stressIrma(optionalSecond: boolean): object {
  return irmaDisclosure([
    [
      [...ia("email", "email"), ...ia("phone", "mobilenumber")],
      [...ia("iban", "fullname", "iban"), ...ia("passport", "number")],
    ],
    [
      ...(optionalSecond ? [[]] : []),
      [...ia("pid", "address", "city"), iv("pid", "country", "NL"), ...ia("driving", "lastName", "documentNumber")],
      [...ia("address", "street", "city"), ...ia("idcard", "number")],
    ],
  ])
}

function stressDcql(f: FormatChoice, optionalSecond: boolean): object {
  return dcql(
    [
      veramoQ("email", "email", ["email"], f),
      veramoQ("mobile", "phone", ["phone_number"], f),
      veramoQ("iban", "iban", ["holder_name", "iban"], f),
      veramoQ("passport", "passport", ["family_name", "document_number"], f),
      veramoQ("pid", "pid", [["address", "street_address"], ["address", "locality"], { path: ["address", "country"], values: ["NL"] }], f),
      veramoQ("licence", "driving", ["family_name", "document_number"], f),
      veramoQ("address", "address", ["street_address", "locality"], f),
      veramoQ("idcard", "idcard", ["family_name", "document_number"], f),
    ],
    [
      set([["email", "mobile"], ["iban", "passport"]]),
      set([["pid", "licence"], ["address", "idcard"]], !optionalSecond),
    ]
  )
}

const STRESS_LOOK = [
  "With a full wallet, the overview shows one choice per set",
  "Edit opens the whole page of choices",
  "Choosing which email address offers all three",
  "The Belgian EU identity is not offered: it fails the value check",
]

export const complex: Scenario[] = [
  {
    id: "combinatie",
    group: "complex",
    title: "Two cards, each with a choice",
    description: "An email address and a mobile number in one option, with several of each in the app.",
    prototypeFrame: "S1_Per_kaartje",
    wallet: wallet(
      [card("email", MAIL1), card("email", MAIL2), card("phone"), card("phone", PHONE2), card("phone", PHONE3)],
      [during("Another email address or mobile number, if you want to choose it", card("email", MAIL3), card("phone", PHONE4))]
    ),
    irma: {
      status: "check",
      note: MULTI_NON_SINGLETON,
      request: irmaDisclosure([[[...ia("email", "email"), ...ia("phone", "mobilenumber")]]]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () =>
        dcql([pbdfQ("email", "email", ["email"]), pbdfQ("phone", "phone", ["mobilenumber"])], [set([["email", "phone"]])]),
    },
    unavailable: {},
    expected: "One email address and one mobile number.",
    lookFor: ["Per card, you choose which one you share", "Adding another one is offered next to the choice"],
  },
  {
    id: "toets",
    group: "complex",
    title: "Check in for an exam",
    description: "Personal data and one of three exam registrations.",
    prototypeFrame: "S2_Opties_en_kaartjes",
    wallet: wallet([
      card("personal"),
      card("exam"),
      card("exam", { exam: "Onderzoeksmethoden", date: "2026-12-03", room: "A0.05" }),
      card("exam", { exam: "Bedrijfseconomie", date: "2026-12-10", room: "C1.20" }),
    ]),
    irma: {
      status: "native",
      request: irmaDisclosure([[[...ia("personal", "firstnames", "familyname"), ...ia("exam", "election", "start", "voteURL")]]]),
    },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "native",
      query: (f) =>
        dcql(
          [veramoQ("personal", "personal", ["given_name", "family_name"], f), veramoQ("exam", "exam", ["exam", "date", "room"], f)],
          [set([["personal", "exam"]])]
        ),
    },
    unavailable: {},
    expected: "Name and one exam registration.",
    lookFor: ["The three registrations are offered as a choice", "Personal data has no choice, so it isn't presented as one"],
  },
  {
    id: "opties",
    group: "complex",
    title: "Pick an option, then a card",
    description: "Personal data, or passport + address, or driving licence + address.",
    prototypeFrame: "S2_Opties_en_kaartjes",
    wallet: wallet(
      [card("passport", PASS1), card("passport", PASS2), card("address"), card("personal")],
      [during("A third passport or a driving licence, if you want to choose it", card("passport", PASS3), card("driving"))]
    ),
    irma: { status: "native", request: irmaDisclosure([IRMA_OPTIONS]) },
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "flagged",
      query: (f) => dcql(veramoOptions(f), [VERAMO_OPTIONS_SET]),
    },
    unavailable: {},
    expected: "One of the three options, completely.",
    lookFor: [
      "Large request with options: “Choose another combination” switches option",
      "The sheet “Which combination do you share?” lists all three",
      "The address is one choice shared by the two options that need it",
    ],
  },
  {
    id: "meerdere",
    group: "complex",
    title: "Several cards for one question",
    description: "Share one or more diplomas, and an email address.",
    prototypeFrame: "S6_Regels",
    wallet: wallet(
      [card("diploma"), card("diploma", DIPLOMA2), card("diploma", DIPLOMA3), card("email", MAIL1)],
      [during("Another diploma, if you want to share it", card("diploma", DIPLOMA4))]
    ),
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "check",
      note: "pbdf-staging diplomas come from the staging DUO issuer, and the EUDI verifier has to accept them.",
      query: () =>
        dcql([pbdfQ("diploma", "diploma", ["qualification", "dateAwarded"], { multiple: true }), pbdfQ("email", "email", ["email"])]),
    },
    unavailable: { irma: "A condiscon can't ask for every instance of a credential." },
    expected: "All diplomas you selected, and the email address.",
    lookFor: ["Several diplomas can be selected at once", "Edit opens the sheet instead of a single choice"],
  },
  {
    id: "tweemaal",
    group: "complex",
    title: "The same card type twice",
    description: "Two email addresses in one request.",
    prototypeFrame: "S7_Wisselen_in_blad",
    wallet: wallet([card("email", MAIL1), card("email", MAIL2), card("email", MAIL3)]),
    irma: {
      status: "check",
      note: "Probably not supported: two inner cons may not be able to pick different instances of one credential type. Confirm in irmago.",
      request: irmaDisclosure([[ia("email", "email")], [ia("email", "email")]]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () => dcql([pbdfQ("email1", "email", ["email"]), pbdfQ("email2", "email", ["email"])]),
    },
    unavailable: {},
    expected: "Two different email addresses.",
    lookFor: ["The second choice defaults to a different address than the first", "Choosing the same address twice is not possible"],
  },
  {
    id: "afmaken",
    group: "complex",
    title: "Complete an option",
    description: "Email address + mobile number, or a passport. You have the email address already.",
    prototypeFrame: "S3_Optie_afmaken",
    wallet: wallet(
      [card("email", MAIL1), card("email", MAIL2)],
      [during("A mobile number, or a passport", card("phone"), card("passport", PASS1))],
      ["phone", "passport"]
    ),
    irma: {
      status: "check",
      note: MULTI_NON_SINGLETON,
      request: irmaDisclosure([[[...ia("email", "email"), ...ia("phone", "mobilenumber")], ia("passport", "kind", "number")]]),
    },
    dcql: {
      source: "pbdf",
      during: "inFlow",
      status: "native",
      query: () =>
        dcql(
          [pbdfQ("email", "email", ["email"]), pbdfQ("phone", "phone", ["mobilenumber"]), pbdfQ("passport", "passport", ["documentNumber"])],
          [set([["email", "phone"], ["passport"]])]
        ),
    },
    unavailable: {},
    expected: "Email + mobile number, or the passport.",
    lookFor: ["The option you're closest to is suggested first", "Only the missing mobile number is a step to do"],
  },
  {
    id: "optiesleeg",
    group: "complex",
    title: "Three options, empty wallet",
    description: "Personal data, or passport + address, or driving licence + address; nothing is in the app.",
    prototypeFrame: "S4_Opties_niets_in_app",
    wallet: wallet(
      [],
      [
        during(
          "Personal data, or passport + address, or driving licence + address",
          card("personal"),
          card("passport", PASS1),
          card("address"),
          card("driving")
        ),
      ],
      ["personal", "passport", "address", "driving"]
    ),
    irma: { status: "native", request: irmaDisclosure([IRMA_OPTIONS]) },
    unavailable: {
      dcql: "It is about adding mid-session, which OpenID4VCI can't do, and pbdf-staging has no personal data and address to pair.",
    },
    expected: "One of the three options, after adding its cards.",
    lookFor: [
      "One thing to do, in three ways",
      "Choosing passport + address shows “card 1 of 2”",
      "Stopping after the passport: the address completes it",
      "The same choice later shows what you already have",
    ],
  },
  {
    id: "groot",
    group: "complex",
    title: "Everything at once",
    description: "Options with several cards, a combination of email and mobile, and optional diplomas.",
    prototypeFrame: "S5_Alles_tegelijk",
    wallet: wallet(
      [card("email", MAIL1), card("email", MAIL2), card("diploma"), card("diploma", DIPLOMA2)],
      [
        during("Personal data, or passport + address, or driving licence + address", card("personal"), card("passport", PASS1), card("address"), card("driving")),
        during("Mobile number", card("phone")),
        during("Another email address or diploma, if you want to choose it", card("email", MAIL3), card("diploma", DIPLOMA4)),
      ],
      ["personal", "passport", "address", "driving", "phone"]
    ),
    dcql: {
      source: "veramo",
      during: "upFront",
      status: "flagged",
      query: (f) =>
        dcql(
          [
            ...veramoOptions(f),
            veramoQ("email", "email", ["email"], f),
            veramoQ("phone", "phone", ["phone_number"], f),
            veramoQ("diploma", "diploma", ["education", "achieved"], f, { multiple: true }),
          ],
          [VERAMO_OPTIONS_SET, set([["email", "phone"]]), set([["diploma"]], false)]
        ),
    },
    unavailable: { irma: "It asks for several diplomas for one question, which a condiscon can't." },
    expected: "One identity option, email + mobile, and any diplomas you chose.",
    lookFor: ["The overview stays readable with three sections", "Optional diplomas are off until you switch them on"],
  },
  {
    id: "stress",
    group: "complex",
    title: "Stress test",
    description:
      "Two required sets of two options of two cards, with a full wallet: three email addresses, two of most cards, and a Belgian EU identity that fails the value check.",
    prototypeFrame: "S9_Stresstest",
    wallet: STRESS_FULL,
    irma: { status: "check", note: MULTI_NON_SINGLETON, request: stressIrma(false) },
    dcql: { source: "veramo", during: "upFront", status: "flagged", query: (f) => stressDcql(f, false) },
    unavailable: {},
    expected: "Two credentials from each set; only a Dutch EU identity.",
    lookFor: STRESS_LOOK,
  },
  {
    id: "stressopt",
    group: "complex",
    title: "Stress test, second set optional",
    description: "The stress test, with the second set (EU identity + licence, or address + ID card) not required.",
    prototypeFrame: "S10_Stresstest_optioneel",
    wallet: STRESS_FULL,
    irma: { status: "check", note: MULTI_NON_SINGLETON, request: stressIrma(true) },
    dcql: { source: "veramo", during: "upFront", status: "flagged", query: (f) => stressDcql(f, true) },
    unavailable: {},
    expected: "Two credentials from the first set; the second only if switched on.",
    lookFor: ["The second set is optional and off by default", ...STRESS_LOOK.slice(0, 2)],
  },
  {
    id: "stressleeg",
    group: "complex",
    title: "Stress test, empty wallet",
    description: "The stress test with nothing in the app: every card is added during the session.",
    prototypeFrame: "S9_Stresstest",
    wallet: wallet(
      [],
      [
        during("Set 1 · option A", card("email", MAIL1), card("phone")),
        during("Set 1 · option B", card("iban"), card("passport", PASS1)),
        during("Set 2 · option A", card("pid"), card("driving")),
        during("Set 2 · option B", card("address"), card("idcard")),
      ],
      ["email", "phone", "iban", "passport", "pid", "driving", "address", "idcard"]
    ),
    irma: { status: "check", note: MULTI_NON_SINGLETON, request: stressIrma(false) },
    unavailable: {
      dcql: "It is about adding everything mid-session, which OpenID4VCI can't do; the full-wallet stress test has a DCQL variant.",
    },
    expected: "Two credentials from each set, after adding them.",
    lookFor: [
      "Empty wallet: two things to do, each in two ways",
      "Choosing a possibility shows both cards of that option",
      "After the first set is complete, the overview says so and moves to the second",
    ],
  },
]
