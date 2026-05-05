"use client"

import type { Subgraph } from "@/lib/db"

const SHARE_PARAM = "share"
const SHARE_VERSION = 1
const MAX_SHARE_URL_LENGTH = 12000

type ShareSubgraph = {
  name: string
  sdl: string
}

export type SharePayload = {
  v: number
  compositionVersion: string | null
  selectedIndex: number | null
  subgraphs: ShareSubgraph[]
}

export function createSharePayload({
  subgraphs,
  selectedId,
  version,
}: {
  subgraphs: Subgraph[]
  selectedId: string | null
  version: string | null
}): SharePayload {
  const selectedIndex = subgraphs.findIndex((subgraph) => subgraph.id === selectedId)

  return {
    v: SHARE_VERSION,
    compositionVersion: version,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
    subgraphs: subgraphs.map((subgraph) => ({
      name: subgraph.name,
      sdl: subgraph.sdl,
    })),
  }
}

export function createShareUrl(baseUrl: string, payload: SharePayload): string {
  const url = new URL(baseUrl)
  url.hash = new URLSearchParams([[SHARE_PARAM, serializeSharePayload(payload)]]).toString()

  const absoluteUrl = url.toString()
  if (absoluteUrl.length > MAX_SHARE_URL_LENGTH) {
    throw new Error("This playground is too large to share as a URL")
  }

  return absoluteUrl
}

export function readSharePayloadFromHash(hash: string): {
  payload: SharePayload | null
  error: string | null
} {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
  const raw = params.get(SHARE_PARAM)
  if (!raw) {
    return { payload: null, error: null }
  }

  try {
    return { payload: parseSharePayload(raw), error: null }
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : "Invalid shared playground link",
    }
  }
}

export function hasSharePayloadInHash(hash: string): boolean {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
  return params.has(SHARE_PARAM)
}

function serializeSharePayload(payload: SharePayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

function parseSharePayload(value: string): SharePayload {
  const json = new TextDecoder().decode(base64UrlToBytes(value))
  const parsed = JSON.parse(json) as unknown

  if (!isSharePayload(parsed)) {
    throw new Error("Invalid shared playground payload")
  }

  if (parsed.v !== SHARE_VERSION) {
    throw new Error(`Unsupported shared playground version: ${parsed.v}`)
  }

  return parsed
}

function isSharePayload(value: unknown): value is SharePayload {
  if (!value || typeof value !== "object") {
    return false
  }

  const payload = value as Partial<SharePayload>
  return (
    typeof payload.v === "number" &&
    (payload.compositionVersion === null || typeof payload.compositionVersion === "string") &&
    (payload.selectedIndex === null ||
      (Number.isInteger(payload.selectedIndex) && (payload.selectedIndex ?? 0) >= 0)) &&
    Array.isArray(payload.subgraphs) &&
    payload.subgraphs.every(
      (subgraph) =>
        subgraph &&
        typeof subgraph === "object" &&
        typeof subgraph.name === "string" &&
        typeof subgraph.sdl === "string",
    )
  )
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}
