import type { LinkForm } from "./walletLink"

const UNIVERSAL_LINK_HOST = import.meta.env.VITE_UNIVERSAL_LINK_HOST || "open.yivi.app"
const UNIVERSAL_LINK_HOST_STAGING = import.meta.env.VITE_UNIVERSAL_LINK_HOST_STAGING || "open.staging.yivi.app"

export function hostForLinkForm(form: LinkForm): string {
  return form === "universal-staging" ? UNIVERSAL_LINK_HOST_STAGING : UNIVERSAL_LINK_HOST
}
