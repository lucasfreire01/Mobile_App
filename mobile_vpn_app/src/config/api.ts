const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '')

export function getApiUrl() {
  if (!apiUrl) {
    throw new Error('Defina EXPO_PUBLIC_API_URL no arquivo .env antes de entrar.')
  }

  return apiUrl
}
