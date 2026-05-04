"use client"

import { openDB, type IDBPDatabase } from "idb"

export type Subgraph = {
  id: string
  name: string
  sdl: string
  enabled: boolean
  order: number
  updatedAt: number
}

const DB_NAME = "federation-playground"
const DB_VERSION = 2
const STORE = "subgraphs"
const SETTINGS = "settings"

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment")
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: "id" })
          store.createIndex("order", "order")
        }
        if (oldVersion < 2) {
          db.createObjectStore(SETTINGS)
        }
      },
    })
  }
  return dbPromise
}

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDB()
  return (await db.get(SETTINGS, key)) as T | undefined
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<void> {
  const db = await getDB()
  await db.put(SETTINGS, value, key)
}

export async function getAllSubgraphs(): Promise<Subgraph[]> {
  const db = await getDB()
  const all = await db.getAll(STORE)
  return (all as Subgraph[]).sort((a, b) => a.order - b.order)
}

export async function putSubgraph(sg: Subgraph): Promise<void> {
  const db = await getDB()
  await db.put(STORE, sg)
}

export async function deleteSubgraph(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, id)
}

export async function clearSubgraphs(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE)
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `sg_${Math.random().toString(36).slice(2)}_${Date.now()}`
}
