const SSO_SERVER_URL = import.meta.env.VITE_SSO_SERVER_URL
const APP_ID = import.meta.env.VITE_APP_ID
const CLIENT_TOKEN = import.meta.env.VITE_CLIENT_TOKEN

const LS_PROFILE_KEY = 'sso_profile'

function safeJsonParse_(v) {
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

export function getStoredProfile() {
  const raw = localStorage.getItem(LS_PROFILE_KEY)
  if (!raw) return null
  return safeJsonParse_(raw)
}

export function setStoredProfile(profile) {
  localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(profile))
}

export function clearStoredProfile() {
  localStorage.removeItem(LS_PROFILE_KEY)
}

export function getAuthTokenFromQuery() {
  const params = new URLSearchParams(window.location.search)
  return params.get('token')
}

export function redirectToSSO() {
  if (!SSO_SERVER_URL || !APP_ID) {
    throw new Error('Missing VITE_SSO_SERVER_URL or VITE_APP_ID in Vite env')
  }
  const url = `${SSO_SERVER_URL}?app_id=${encodeURIComponent(APP_ID)}`
  window.location.href = url
}

export async function verifyTokenWithSSO(authToken) {
  if (!SSO_SERVER_URL) throw new Error('Missing VITE_SSO_SERVER_URL in Vite env')
  if (!CLIENT_TOKEN) throw new Error('Missing VITE_CLIENT_TOKEN in Vite env')
  if (!authToken) throw new Error('Missing authToken')

  const res = await fetch(SSO_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_token: CLIENT_TOKEN,
      auth_token: authToken,
    }),
  })

  // GAS may return JSON or HTML error; handle both
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    if (!res.ok || !json?.ok) {
      const err = json?.error || `SSO verify failed (${res.status})`
      throw new Error(err)
    }
    return json.profile
  } catch {
    throw new Error(text || `SSO verify failed (${res.status})`)
  }
}

export function cleanupTokenFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('token')
  window.history.replaceState({}, document.title, url.toString())
}
