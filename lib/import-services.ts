export type ImportedService = {
  name: string
  sdl: string
}

export function parseImportedServices(value: string): ImportedService[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("Clipboard content is not valid JSON")
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Expected a non-empty array of { "sdl": "...", "name": "service-name" }')
  }

  for (const [index, service] of parsed.entries()) {
    if (
      !service ||
      typeof service !== "object" ||
      Array.isArray(service) ||
      Object.keys(service).some((key) => key !== "name" && key !== "sdl") ||
      typeof (service as Partial<ImportedService>).name !== "string" ||
      !(service as Partial<ImportedService>).name?.trim() ||
      typeof (service as Partial<ImportedService>).sdl !== "string"
    ) {
      throw new Error(`Service ${index + 1} must contain only non-empty "name" and string "sdl" fields`)
    }
  }

  return parsed as ImportedService[]
}
