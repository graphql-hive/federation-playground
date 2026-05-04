export const PACKAGE_NAME = "@theguild/federation-composition"

export type RegistryInfo = {
  latest: string
  versions: VersionEntry[]
}

export type VersionEntry = {
  version: string
  publishedAt: string | null
  isPrerelease: boolean
}

type NpmPackument = {
  "dist-tags": Record<string, string>
  versions: Record<string, unknown>
  time?: Record<string, string>
}

function isPrerelease(v: string) {
  return v.includes("-")
}

function parseSemver(v: string) {
  const [main, pre = ""] = v.split("-", 2)
  const [maj = "0", min = "0", pat = "0"] = main.split(".")
  return {
    maj: Number.parseInt(maj, 10) || 0,
    min: Number.parseInt(min, 10) || 0,
    pat: Number.parseInt(pat, 10) || 0,
    pre,
  }
}

export function compareVersionsDesc(a: string, b: string) {
  const A = parseSemver(a)
  const B = parseSemver(b)
  if (A.maj !== B.maj) return B.maj - A.maj
  if (A.min !== B.min) return B.min - A.min
  if (A.pat !== B.pat) return B.pat - A.pat
  // stable ranks higher than prerelease
  if (!A.pre && B.pre) return -1
  if (A.pre && !B.pre) return 1
  return B.pre.localeCompare(A.pre)
}

export async function fetchRegistryInfo(signal?: AbortSignal): Promise<RegistryInfo> {
  // Use the abbreviated metadata endpoint for a smaller payload
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}`, {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
    signal,
  })
  if (!res.ok) {
    throw new Error(`npm registry responded with ${res.status}`)
  }
  const data = (await res.json()) as NpmPackument
  const latest = data["dist-tags"]?.latest ?? ""
  const time = data.time ?? {}
  const versions: VersionEntry[] = Object.keys(data.versions ?? {})
    .map((v) => ({
      version: v,
      publishedAt: time[v] ?? null,
      isPrerelease: isPrerelease(v),
    }))
    .sort((a, b) => compareVersionsDesc(a.version, b.version))
  return { latest, versions }
}
