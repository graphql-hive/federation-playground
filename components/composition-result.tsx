"use client"

import { useEffect, useState } from "react"
import type { CompositionOutcome } from "@/lib/compose"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { SdlEditor } from "@/components/sdl-editor"
import {
  Check,
  Copy,
  Download,
  AlertTriangle,
  Sparkles,
  Network,
  Loader2,
  Globe,
  ArrowUpRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  outcome: CompositionOutcome | null
  pending: boolean
  /** When set, the composition library for this version is downloading. */
  switchingVersion?: string | null
}

type SdlTab = "supergraph" | "public" | "errors"

export function CompositionResult({ outcome, pending, switchingVersion }: Props) {
  const [tab, setTab] = useState<SdlTab>("supergraph")
  const [copied, setCopied] = useState(false)

  // If composition fails, jump to errors. When it recovers, jump back to supergraph.
  useEffect(() => {
    if (!outcome) return
    if (outcome.status === "errors") setTab("errors")
    else if (outcome.status === "success" && tab === "errors") setTab("supergraph")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome?.status])

  const supergraph = outcome?.status === "success" ? outcome.supergraphSdl : ""
  const publicSdl = outcome?.status === "success" ? outcome.publicSdl : ""
  const errors = outcome?.status === "errors" ? outcome.errors : []

  const activeSdl = tab === "public" ? publicSdl : supergraph
  const activeFilename = tab === "public" ? "public.graphql" : "supergraph.graphql"
  const canCopy =
    outcome?.status === "success" &&
    tab !== "errors" &&
    activeSdl.length > 0 &&
    !switchingVersion

  async function handleCopy() {
    if (!canCopy) return
    await navigator.clipboard.writeText(activeSdl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleDownload() {
    if (!canCopy) return
    const blob = new Blob([activeSdl], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = activeFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Network className="h-3.5 w-3.5 text-primary" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Composition result</h2>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            disabled={!canCopy}
            title={copied ? "Copied!" : "Copy SDL"}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            disabled={!canCopy}
            title="Download SDL"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="sr-only">Download</span>
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as SdlTab)}
          className={cn(
            "flex h-full min-h-0 flex-col transition-[opacity,filter] duration-200",
            switchingVersion && "pointer-events-none opacity-40 blur-[1px]",
          )}
          aria-busy={switchingVersion ? true : undefined}
        >
          <div className="flex gap-0 border-b px-4">
            {(["supergraph", "public", "errors"] as SdlTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "relative flex items-center gap-1.5 border-b-2 px-0 pb-2.5 pt-3 text-xs transition-colors",
                  "mr-5 last:mr-0 focus:outline-none",
                  tab === t
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "supergraph" && <Sparkles className="h-3 w-3" aria-hidden />}
                {t === "public" && <Globe className="h-3 w-3" aria-hidden />}
                {t === "errors" && <AlertTriangle className="h-3 w-3" aria-hidden />}
                {t === "supergraph" ? "Supergraph" : t === "public" ? "Public" : "Errors"}
                {t === "errors" && errors.length > 0 && (
                  <span className="rounded bg-destructive/15 px-1 py-px font-mono text-[9px] font-semibold text-destructive">
                    {errors.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <TabsContent value="supergraph" className="m-0 min-h-0 flex-1 p-4">
            <SdlPane
              outcome={outcome}
              sdl={supergraph}
              emptyTitle="No subgraphs to compose"
              emptyDescription="Add a subgraph and start writing SDL to see the composed supergraph here."
              emptyIcon={<Sparkles className="h-5 w-5" />}
            />
          </TabsContent>

          <TabsContent value="public" className="m-0 min-h-0 flex-1 p-4">
            <SdlPane
              outcome={outcome}
              sdl={publicSdl}
              emptyTitle="No public schema yet"
              emptyDescription="Once composition succeeds, the federation-stripped, gateway-facing SDL will appear here."
              emptyIcon={<Globe className="h-5 w-5" />}
            />
          </TabsContent>

          <TabsContent value="errors" className="m-0 min-h-0 flex-1 overflow-auto p-4">
            {errors.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Check className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>No errors</EmptyTitle>
                  <EmptyDescription>
                    Your subgraphs compose cleanly into a valid supergraph.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {errors.map((err, i) => (
                  <li
                    key={i}
                    className="relative flex items-start gap-3 overflow-hidden rounded-md border border-border bg-card pl-4 pr-3 py-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-destructive/70"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {err.code && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-destructive">
                            {err.code}
                          </span>
                        )}
                        {err.subgraph && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {err.subgraph}
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-foreground">{err.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        {switchingVersion && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm"
          >
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-card px-5 py-4 text-center shadow-lg">
              <div className="relative flex h-9 w-9 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">Loading composition library</p>
                <p className="text-xs text-muted-foreground">
                  Fetching{" "}
                  <span className="font-mono text-foreground">
                    @theguild/federation-composition@{switchingVersion}
                  </span>{" "}
                  from esm.sh
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                The previous result stays visible until the new version finishes loading.
              </p>
            </div>
          </div>
        )}
      </div>
      {/* Hive federation promo */}
      <a
        href="https://the-guild.dev/graphql/hive/federation"
        target="_blank"
        rel="noreferrer noopener"
        className="group flex shrink-0 items-center justify-between border-t px-4 py-2 transition-colors hover:bg-accent/40"
      >
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 28 28" fill="none" aria-hidden>
            <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill="currentColor" className="text-primary" />
            <polygon points="14,7 20,10.5 20,17.5 14,21 8,17.5 8,10.5" fill="currentColor" className="text-primary-foreground opacity-30" />
            <polygon points="14,11 17,12.75 17,16.25 14,18 11,16.25 11,12.75" fill="currentColor" className="text-primary-foreground opacity-70" />
          </svg>
          <span className="text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
            Run federation at scale with{" "}
            <span className="font-medium text-foreground">GraphQL Hive</span>
          </span>
        </div>
        <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
      </a>
    </div>
  )
}

function SdlPane({
  outcome,
  sdl,
  emptyTitle,
  emptyDescription,
  emptyIcon,
}: {
  outcome: CompositionOutcome | null
  sdl: string
  emptyTitle: string
  emptyDescription: string
  emptyIcon: React.ReactNode
}) {
  if (!outcome || outcome.status === "empty") {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">{emptyIcon}</EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (outcome.status === "loading-library") {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Loader2 className="h-5 w-5 animate-spin" />
          </EmptyMedia>
          <EmptyTitle>Loading composition library</EmptyTitle>
          <EmptyDescription>
            Fetching{" "}
            <span className="font-mono text-foreground">
              @theguild/federation-composition@{outcome.version}
            </span>{" "}
            from esm.sh...
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (outcome.status === "library-error") {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>Failed to load library</EmptyTitle>
          <EmptyDescription>
            Could not load{" "}
            <span className="font-mono">
              @theguild/federation-composition@{outcome.version}
            </span>
            : {outcome.message}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (outcome.status === "errors") {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>Composition failed</EmptyTitle>
          <EmptyDescription>
            Switch to the Errors tab to inspect what went wrong.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="h-full min-h-0">
      <SdlEditor
        value={sdl}
        onChange={() => {
          /* read-only */
        }}
        readOnly
        maxHeight="100%"
      />
    </div>
  )
}


