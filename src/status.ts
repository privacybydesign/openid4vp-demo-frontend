import type { VariantStatus } from "./scenarios/types"
import type { Tone } from "./ui"

export const STATUS_LABEL: Record<VariantStatus, string> = { native: "Native", flagged: "Flagged", check: "Check" }
export const STATUS_TONE: Record<VariantStatus, Tone> = { native: "green", flagged: "amber", check: "amber" }
