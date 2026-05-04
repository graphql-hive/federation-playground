"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, Loader2, Package, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { VersionEntry } from "@/lib/registry"
import { cn } from "@/lib/utils"

type Props = {
  value: string | null
  latest: string | null
  versions: VersionEntry[]
  loading: boolean
  error: string | null
  /** The version currently being downloaded, if any. */
  switchingTo: string | null
  onChange: (version: string) => void
  onRetry?: () => void
}

function formatDate(iso: string | null) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return ""
  }
}

export function VersionSelect({
  value,
  latest,
  versions,
  loading,
  error,
  switchingTo,
  onChange,
  onRetry,
}: Props) {
  const [open, setOpen] = useState(false)
  const [includePrereleases, setIncludePrereleases] = useState(false)
  const isSwitching = !!switchingTo && switchingTo === value

  const filtered = useMemo(() => {
    return includePrereleases ? versions : versions.filter((v) => !v.isPrerelease)
  }, [versions, includePrereleases])

  const stable = useMemo(() => filtered.filter((v) => !v.isPrerelease), [filtered])
  const prereleases = useMemo(() => filtered.filter((v) => v.isPrerelease), [filtered])

  const buttonLabel = (() => {
    if (loading && !value) return "Loading versions"
    if (error && !value) return "Versions unavailable"
    if (!value) return "Select version"
    return `v${value}`
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-busy={isSwitching || undefined}
          aria-label={
            isSwitching
              ? `Loading composition library version ${switchingTo}`
              : "Select composition library version"
          }
          className={cn(
            "h-8 gap-2 px-2.5 font-mono text-[11px] transition-colors",
            isSwitching && "border-primary/40 bg-primary/5",
          )}
          disabled={loading && versions.length === 0}
        >
          {isSwitching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
          ) : error ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
          ) : loading && !value ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Package className="h-3.5 w-3.5 text-primary" aria-hidden />
          )}
          <span className="hidden font-sans text-xs font-medium text-muted-foreground md:inline">
            composition
          </span>
          <span className={cn("text-foreground", isSwitching && "text-primary")}>
            {buttonLabel}
          </span>
          {isSwitching ? (
            <span className="rounded bg-primary/10 px-1 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wide text-primary">
              loading
            </span>
          ) : (
            value &&
            value === latest && (
              <span className="rounded bg-primary/10 px-1 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wide text-primary">
                latest
              </span>
            )
          )}
          <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,90vw)] p-0" align="end">
        <Command
          filter={(itemValue, search) => {
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Search versions..." className="h-9" />
          <CommandList className="max-h-80">
            {error ? (
              <div className="flex flex-col items-start gap-2 px-3 py-3 text-xs">
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
                {onRetry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onRetry}
                  >
                    Retry
                  </Button>
                )}
              </div>
            ) : (
              <>
                <CommandEmpty>No matching versions.</CommandEmpty>
                {stable.length > 0 && (
                  <CommandGroup heading="Stable releases">
                    {stable.map((v) => (
                      <VersionRow
                        key={v.version}
                        entry={v}
                        latest={latest}
                        selected={value === v.version}
                        onSelect={() => {
                          onChange(v.version)
                          setOpen(false)
                        }}
                      />
                    ))}
                  </CommandGroup>
                )}
                {prereleases.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Pre-releases">
                      {prereleases.map((v) => (
                        <VersionRow
                          key={v.version}
                          entry={v}
                          latest={latest}
                          selected={value === v.version}
                          onSelect={() => {
                            onChange(v.version)
                            setOpen(false)
                          }}
                        />
                      ))}
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </CommandList>
          {!error && versions.some((v) => v.isPrerelease) && (
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3 w-3 cursor-pointer accent-primary"
                  checked={includePrereleases}
                  onChange={(e) => setIncludePrereleases(e.target.checked)}
                />
                Include pre-releases
              </label>
              <a
                href="https://www.npmjs.com/package/@theguild/federation-composition"
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                npm
              </a>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function VersionRow({
  entry,
  latest,
  selected,
  onSelect,
}: {
  entry: VersionEntry
  latest: string | null
  selected: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={entry.version}
      onSelect={onSelect}
      className="flex items-center justify-between gap-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Check
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            selected ? "text-primary opacity-100" : "opacity-0",
          )}
          aria-hidden
        />
        <span className="font-mono text-xs">{entry.version}</span>
        {entry.version === latest && (
          <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            latest
          </span>
        )}
        {entry.isPrerelease && (
          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            pre
          </span>
        )}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatDate(entry.publishedAt)}
      </span>
    </CommandItem>
  )
}
