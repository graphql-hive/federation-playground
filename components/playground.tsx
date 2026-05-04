"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Plus, Trash2, RotateCcw, GitBranch, LayoutList, Code2, Network } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { SdlEditor } from "@/components/sdl-editor"
import { SubgraphItem } from "@/components/subgraph-item"
import { CompositionResult } from "@/components/composition-result"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  type Subgraph,
  getAllSubgraphs,
  putSubgraph,
  deleteSubgraph,
  clearSubgraphs,
  newId,
  getSetting,
  setSetting,
} from "@/lib/db"
import {
  runComposition,
  loadComposition,
  isVersionLoaded,
  type CompositionOutcome,
} from "@/lib/compose"
import { parse as parseGraphQL } from "graphql"
import { fetchRegistryInfo, type VersionEntry } from "@/lib/registry"
import { VersionSelect } from "@/components/version-select"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"

const SEED_SUBGRAPHS: Omit<Subgraph, "id" | "order" | "updatedAt">[] = [
  {
    name: "users",
    enabled: true,
    sdl: `extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

type User @key(fields: "id") {
  id: ID!
  name: String!
}

type Query {
  users: [User]
}
`,
  },
  {
    name: "comments",
    enabled: true,
    sdl: `extend schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.3"
    import: ["@key", "@external"]
  )

extend type User @key(fields: "id") {
  id: ID! @external
  comments: [Comment]
}

type Comment {
  id: ID!
  text: String!
  author: User!
}
`,
  },
]

export function Playground() {
  const [hydrated, setHydrated] = useState(false)
  const [subgraphs, setSubgraphs] = useState<Subgraph[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<CompositionOutcome | null>(null)
  const [, startTransition] = useTransition()
  const [pending, setPending] = useState(false)
  // Mobile tab: which panel is visible on small screens
  const [mobileTab, setMobileTab] = useState<"subgraphs" | "editor" | "result">("subgraphs")

  // Library version state
  const [version, setVersion] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [registryReloadKey, setRegistryReloadKey] = useState(0)
  // Tracks the version currently being downloaded (only set when the requested
  // version isn't already in the runtime module cache).
  const [switchingVersion, setSwitchingVersion] = useState<string | null>(null)

  // Hydrate from IndexedDB
  useEffect(() => {
    let mounted = true
      ; (async () => {
        try {
          let all = await getAllSubgraphs()
          if (all.length === 0) {
            // seed
            const now = Date.now()
            const seeded: Subgraph[] = SEED_SUBGRAPHS.map((s, i) => ({
              ...s,
              id: newId(),
              order: i,
              updatedAt: now,
            }))
            await Promise.all(seeded.map(putSubgraph))
            all = seeded
          }
          // Load persisted version preference
          const persistedVersion = await getSetting<string>("version")
          if (!mounted) return
          setSubgraphs(all)
          setSelectedId(all[0]?.id ?? null)
          if (persistedVersion) setVersion(persistedVersion)
        } finally {
          if (mounted) setHydrated(true)
        }
      })()
    return () => {
      mounted = false
    }
  }, [])

  // Fetch npm registry info
  useEffect(() => {
    const ctrl = new AbortController()
    let mounted = true
    setVersionsLoading(true)
    setVersionsError(null)
    fetchRegistryInfo(ctrl.signal)
      .then((info) => {
        if (!mounted) return
        setVersions(info.versions)
        setLatestVersion(info.latest || null)
        // Default to latest if no version is selected yet
        setVersion((current) => current ?? info.latest ?? info.versions[0]?.version ?? null)
      })
      .catch((err) => {
        if (!mounted) return
        if ((err as Error).name === "AbortError") return
        setVersionsError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (mounted) setVersionsLoading(false)
      })
    return () => {
      mounted = false
      ctrl.abort()
    }
  }, [registryReloadKey])

  // Persist version when it changes
  useEffect(() => {
    if (!hydrated || !version) return
    void setSetting("version", version)
  }, [hydrated, version])

  // Pre-warm the dynamic loader and track switching state when a new version
  // is selected that isn't yet in the cache.
  useEffect(() => {
    if (!version) return
    if (isVersionLoaded(version)) {
      setSwitchingVersion(null)
      return
    }
    setSwitchingVersion(version)
    let cancelled = false
    loadComposition(version)
      .catch(() => {
        /* surfaced via library-error outcome from runComposition */
      })
      .finally(() => {
        if (cancelled) return
        // Only clear if we're still pointing at this version (otherwise a
        // newer switch is in flight and will manage its own state).
        setSwitchingVersion((curr) => (curr === version ? null : curr))
      })
    return () => {
      cancelled = true
    }
  }, [version])

  // Debounced inputs for composition
  const compositionInputs = useMemo(
    () => subgraphs.map((s) => ({ name: s.name, sdl: s.sdl })),
    [subgraphs],
  )
  const debouncedInputs = useDebouncedValue(compositionInputs, 350)

  // Mark pending while inputs differ from debounced
  useEffect(() => {
    const same =
      compositionInputs.length === debouncedInputs.length &&
      compositionInputs.every(
        (s, i) =>
          s.name === debouncedInputs[i]?.name && s.sdl === debouncedInputs[i]?.sdl,
      )
    setPending(!same)
  }, [compositionInputs, debouncedInputs])

  // Run composition off the render path. We deliberately do NOT clobber the
  // previous outcome when version changes — the result panel keeps showing
  // the last successful result (dimmed under an overlay) until the new
  // composition resolves. The first-ever run shows a "loading library" state
  // because there is no previous outcome.
  useEffect(() => {
    if (!hydrated || !version) return
    let cancelled = false
    setOutcome((prev) => prev ?? { status: "loading-library", version })
    startTransition(() => {
      runComposition(debouncedInputs, version).then((result) => {
        if (!cancelled) setOutcome(result)
      })
    })
    return () => {
      cancelled = true
    }
  }, [debouncedInputs, hydrated, version])

  const selected = subgraphs.find((s) => s.id === selectedId) ?? null

  const updateSubgraph = useCallback(
    (id: string, patch: Partial<Subgraph>) => {
      setSubgraphs((prev) => {
        const next = prev.map((s) =>
          s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
        )
        const updated = next.find((s) => s.id === id)
        if (updated) {
          // fire-and-forget persist
          void putSubgraph(updated)
        }
        return next
      })
    },
    [],
  )

  const handleAdd = useCallback(() => {
    const id = newId()
    const order = subgraphs.length
    const baseName = `subgraph-${order + 1}`
    const sg: Subgraph = {
      id,
      name: baseName,
      sdl: `extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

type Query {
  hello: String
}
`,
      enabled: true,
      order,
      updatedAt: Date.now(),
    }
    setSubgraphs((prev) => [...prev, sg])
    setSelectedId(id)
    void putSubgraph(sg)
  }, [subgraphs.length])

  const handleDelete = useCallback(
    (id: string) => {
      setSubgraphs((prev) => {
        const next = prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }))
        // persist new order
        next.forEach((s) => void putSubgraph(s))
        return next
      })
      if (selectedId === id) {
        setSelectedId((curr) => {
          const remaining = subgraphs.filter((s) => s.id !== id)
          return remaining[0]?.id ?? null
        })
      }
      void deleteSubgraph(id)
    },
    [selectedId, subgraphs],
  )

  const handleClearAll = useCallback(async () => {
    await clearSubgraphs()
    setSubgraphs([])
    setSelectedId(null)
  }, [])

  // Per-subgraph status (parse error?)
  const perSubgraphStatus = useMemo(() => {
    const map = new Map<string, "ok" | "error" | "idle">()
    for (const s of subgraphs) {
      if (!s.sdl.trim()) {
        map.set(s.id, "idle")
        continue
      }
      try {
        parseGraphQL(s.sdl)
        map.set(s.id, "ok")
      } catch {
        map.set(s.id, "error")
      }
    }
    return map
  }, [subgraphs])

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4 md:px-5">
        <div className="flex items-center gap-2.5">
          {/* Hive hexagon logo */}
          <a
            href="https://the-guild.dev/graphql/hive/federation"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="GraphQL Hive"
            className="shrink-0"
          >
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden>
              <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill="currentColor" className="text-primary" />
              <polygon points="14,7 20,10.5 20,17.5 14,21 8,17.5 8,10.5" fill="currentColor" className="text-primary-foreground opacity-30" />
              <polygon points="14,11 17,12.75 17,16.25 14,18 11,16.25 11,12.75" fill="currentColor" className="text-primary-foreground opacity-70" />
            </svg>
          </a>
          <div>
            <h1 className="text-sm font-semibold leading-none tracking-tight">Federation Playground</h1>
            <p className="mt-0.5 hidden text-[11px] leading-none text-muted-foreground sm:block">
              Compose subgraphs &amp; validate SDL in real time
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <VersionSelect
            value={version}
            latest={latestVersion}
            versions={versions}
            loading={versionsLoading}
            error={versionsError}
            switchingTo={switchingVersion}
            onChange={setVersion}
            onRetry={() => setRegistryReloadKey((n) => n + 1)}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                disabled={subgraphs.length === 0}
                title="Reset playground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="sr-only">Reset</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset playground?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all of your subgraphs from this browser. This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <ThemeToggle />
        </div>
      </header>

      {!hydrated ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Desktop: 3-column resizable layout ── */}
          <ResizablePanelGroup direction="horizontal" className="hidden flex-1 md:flex">
            <ResizablePanel defaultSize={20} minSize={15} maxSize={32} className="bg-sidebar">
              <SubgraphSidebar
                subgraphs={subgraphs}
                selectedId={selectedId}
                statuses={perSubgraphStatus}
                onSelect={setSelectedId}
                onAdd={handleAdd}
                onDelete={handleDelete}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={45} minSize={25}>
              <SubgraphEditor
                subgraph={selected}
                onChange={(patch) => selected && updateSubgraph(selected.id, patch)}
                onDelete={() => selected && handleDelete(selected.id)}
                onAdd={handleAdd}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={35} minSize={25}>
              <CompositionResult
                outcome={outcome}
                pending={pending}
                switchingVersion={switchingVersion}
              />
            </ResizablePanel>
          </ResizablePanelGroup>

          {/* ── Mobile: full-screen panels + bottom tab bar ── */}
          <div className="flex flex-1 flex-col overflow-hidden md:hidden">
            {/* Active panel */}
            <div className="min-h-0 flex-1 overflow-hidden">
              {mobileTab === "subgraphs" && (
                <SubgraphSidebar
                  subgraphs={subgraphs}
                  selectedId={selectedId}
                  statuses={perSubgraphStatus}
                  onSelect={(id) => { setSelectedId(id); setMobileTab("editor") }}
                  onAdd={() => { handleAdd(); setMobileTab("editor") }}
                  onDelete={handleDelete}
                />
              )}
              {mobileTab === "editor" && (
                <SubgraphEditor
                  subgraph={selected}
                  onChange={(patch) => selected && updateSubgraph(selected.id, patch)}
                  onDelete={() => { selected && handleDelete(selected.id); setMobileTab("subgraphs") }}
                  onAdd={() => { handleAdd(); setMobileTab("editor") }}
                />
              )}
              {mobileTab === "result" && (
                <CompositionResult
                  outcome={outcome}
                  pending={pending}
                  switchingVersion={switchingVersion}
                />
              )}
            </div>

            {/* Bottom tab bar */}
            <nav
              className="flex shrink-0 border-t bg-background"
              aria-label="Mobile navigation"
            >
              {(
                [
                  { id: "subgraphs", label: "Subgraphs", Icon: LayoutList },
                  { id: "editor",    label: "Editor",    Icon: Code2 },
                  { id: "result",    label: "Result",    Icon: Network },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMobileTab(id)}
                  aria-current={mobileTab === id ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                    mobileTab === id
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
                  {label}
                  {id === "result" && pending && (
                    <span className="absolute mt-0.5 h-1 w-1 rounded-full bg-primary" aria-hidden />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </>
      )}
    </div>
  )
}

function SubgraphSidebar({
  subgraphs,
  selectedId,
  statuses,
  onSelect,
  onAdd,
  onDelete,
}: {
  subgraphs: Subgraph[]
  selectedId: string | null
  statuses: Map<string, "ok" | "error" | "idle">
  onSelect: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Subgraphs</h2>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onAdd}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {subgraphs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm font-medium text-foreground">No subgraphs yet</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Add a subgraph to get started. Your work is saved locally in IndexedDB.
            </p>
            <Button size="sm" variant="outline" onClick={onAdd} className="mt-1 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New subgraph
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {subgraphs.map((sg) => (
              <li key={sg.id}>
                <SubgraphItem
                  subgraph={sg}
                  active={sg.id === selectedId}
                  status={statuses.get(sg.id) ?? "idle"}
                  onSelect={() => onSelect(sg.id)}
                  onDelete={() => onDelete(sg.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t px-4 py-3">
        <a
          href="https://the-guild.dev/graphql/hive/federation"
          target="_blank"
          rel="noreferrer noopener"
          className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 28 28" fill="none" aria-hidden>
            <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill="currentColor" className="text-primary" />
            <polygon points="14,7 20,10.5 20,17.5 14,21 8,17.5 8,10.5" fill="currentColor" className="text-primary-foreground opacity-30" />
            <polygon points="14,11 17,12.75 17,16.25 14,18 11,16.25 11,12.75" fill="currentColor" className="text-primary-foreground opacity-70" />
          </svg>
          Powered by GraphQL Hive
        </a>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Composition runs client-side via <span className="font-mono">@theguild/federation-composition</span> on <span className="font-mono">esm.sh</span>. State persisted in IndexedDB.
        </p>
      </div>
    </div>
  )
}

function SubgraphEditor({
  subgraph,
  onChange,
  onDelete,
  onAdd,
}: {
  subgraph: Subgraph | null
  onChange: (patch: Partial<Subgraph>) => void
  onDelete: () => void
  onAdd: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)

  if (!subgraph) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <GitBranch className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">No subgraph selected</p>
          <p className="text-xs text-muted-foreground">
            Add a new subgraph to start composing your supergraph.
          </p>
        </div>
        <Button size="sm" onClick={onAdd} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add subgraph
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <label htmlFor="subgraph-name" className="sr-only">
          Subgraph name
        </label>
        <Input
          id="subgraph-name"
          ref={nameRef}
          value={subgraph.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="subgraph-name"
          className="h-7 max-w-xs border-transparent bg-transparent px-1.5 font-mono text-sm font-medium shadow-none focus-visible:border-input focus-visible:bg-muted/40"
        />
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Delete subgraph"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <SdlEditor
          value={subgraph.sdl}
          onChange={(v) => onChange({ sdl: v })}
          maxHeight="100%"
          placeholder="# Write your subgraph SDL here..."
        />
      </div>
    </div>
  )
}
