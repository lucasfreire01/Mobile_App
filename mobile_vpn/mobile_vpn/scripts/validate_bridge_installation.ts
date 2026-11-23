import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validateBridgeInstallation(value: unknown, requireActive = false) {
  if (!value || typeof value !== 'object') throw new Error('Configuração da ponte inválida.')
  const config = value as Record<string, unknown>
  if (
    typeof config.apiUrl !== 'string' ||
    typeof config.bridgeId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(config.bridgeId)
  ) {
    throw new Error('Configuração da ponte inválida.')
  }
  const url = new URL(config.apiUrl)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/', '/api/v1', '/api/v1/'].includes(url.pathname)
  )
    throw new Error('Servidor da ponte inválido.')
  if (requireActive && (!config.bridgeToken || config.installationToken))
    throw new Error('Ponte ainda não ativada.')
  const token = (entry: unknown) => typeof entry === 'string' && /^[A-Za-z0-9_-]{43}$/.test(entry)
  if (!token(config.bridgeToken) && !token(config.installationToken))
    throw new Error('Instalação da ponte não autorizada.')
  if (config.bridgeToken !== undefined && !token(config.bridgeToken))
    throw new Error('Credencial da ponte inválida.')
  if (config.installationToken !== undefined && !token(config.installationToken))
    throw new Error('Autorização de instalação inválida.')
  if (
    !config.bridgeToken &&
    config.expiresAt !== undefined &&
    (typeof config.expiresAt !== 'number' ||
      !Number.isFinite(config.expiresAt) ||
      config.expiresAt <= Date.now())
  ) {
    throw new Error('Pacote de instalação expirado.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const path = process.argv[2]
    if (!path) throw new Error('Missing configuration')
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192)
      throw new Error('Invalid configuration file')
    validateBridgeInstallation(
      JSON.parse(readFileSync(path, 'utf8')),
      process.argv[3] === '--active'
    )
  } catch {
    // JSON parse errors may contain input excerpts. Never include them in installer output.
    console.error('Configuração de instalação inválida ou expirada. Baixe um novo pacote pelo app.')
    process.exitCode = 1
  }
}
