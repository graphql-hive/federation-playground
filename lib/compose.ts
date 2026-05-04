"use client"

import { parse, GraphQLError, type DocumentNode } from "graphql"

export type CompositionInput = {
  name: string
  sdl: string
}

export type CompositionError = {
  subgraph?: string
  message: string
  code?: string
}

export type CompositionOutcome =
  | { status: "empty" }
  | { status: "loading-library"; version: string }
  | { status: "library-error"; version: string; message: string }
  | { status: "success"; supergraphSdl: string; publicSdl: string; subgraphCount: number; version: string }
  | { status: "errors"; errors: CompositionError[]; version: string }

type ComposeServicesFn = (
  services: { name: string; typeDefs: DocumentNode; url?: string }[],
) => {
  errors?: ReadonlyArray<unknown>
  supergraphSdl?: string
  publicSdl?: string
}

type LoadedModule = {
  composeServices: ComposeServicesFn
  compositionHasErrors: (result: unknown) => boolean
}

const moduleCache = new Map<string, Promise<LoadedModule>>()
const loadedVersions = new Set<string>()

export function isVersionLoaded(version: string): boolean {
  return loadedVersions.has(version)
}

// Build dynamic import at runtime so the bundler doesn't try to resolve the URL at build time.
const dynamicImport = new Function("u", "return import(u)") as (u: string) => Promise<unknown>

function esmUrl(version: string) {
  return `https://esm.sh/@theguild/federation-composition@${encodeURIComponent(version)}`
}

export function loadComposition(version: string): Promise<LoadedModule> {
  let cached = moduleCache.get(version)
  if (!cached) {
    cached = dynamicImport(esmUrl(version)).then((mod) => {
      const m = mod as Partial<LoadedModule>
      if (typeof m.composeServices !== "function") {
        throw new Error(`@theguild/federation-composition@${version} did not expose composeServices`)
      }
      const loaded: LoadedModule = {
        composeServices: m.composeServices,
        compositionHasErrors:
          typeof m.compositionHasErrors === "function"
            ? m.compositionHasErrors
            : (r: unknown) => {
                const errs = (r as { errors?: unknown[] })?.errors
                return Array.isArray(errs) && errs.length > 0
              },
      }
      loadedVersions.add(version)
      return loaded
    })
    cached.catch(() => moduleCache.delete(version))
    moduleCache.set(version, cached)
  }
  return cached
}

export async function runComposition(
  inputs: CompositionInput[],
  version: string,
): Promise<CompositionOutcome> {
  const enabled = inputs.filter((s) => s.sdl.trim().length > 0)
  if (enabled.length === 0) {
    return { status: "empty" }
  }

  // Parse subgraphs first so parse errors are reported even if the library is offline.
  const services: { name: string; typeDefs: DocumentNode }[] = []
  const parseErrors: CompositionError[] = []
  for (const s of enabled) {
    try {
      services.push({ name: s.name || "unnamed", typeDefs: parse(s.sdl) })
    } catch (e) {
      const err = e as GraphQLError | Error
      parseErrors.push({ subgraph: s.name, message: err.message, code: "PARSE_ERROR" })
    }
  }
  if (parseErrors.length > 0) {
    return { status: "errors", errors: parseErrors, version }
  }

  let mod: LoadedModule
  try {
    mod = await loadComposition(version)
  } catch (e) {
    return {
      status: "library-error",
      version,
      message: e instanceof Error ? e.message : String(e),
    }
  }

  try {
    const result = mod.composeServices(services)
    if (mod.compositionHasErrors(result)) {
      const errors = (result.errors ?? []).map((raw) => {
        const err = raw as GraphQLError & {
          extensions?: { code?: string; subgraph?: string }
        }
        return {
          subgraph: err.extensions?.subgraph,
          message: err.message,
          code: err.extensions?.code ?? "COMPOSITION_ERROR",
        }
      })
      return { status: "errors", errors, version }
    }
    return {
      status: "success",
      supergraphSdl: result.supergraphSdl ?? "",
      publicSdl: result.publicSdl ?? "",
      subgraphCount: services.length,
      version,
    }
  } catch (e) {
    const err = e as Error
    return {
      status: "errors",
      version,
      errors: [
        {
          message: err.message ?? "Unknown composition failure",
          code: "INTERNAL_ERROR",
        },
      ],
    }
  }
}
