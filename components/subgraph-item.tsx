"use client"

import type { Subgraph } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  subgraph: Subgraph
  active: boolean
  status?: "ok" | "error" | "idle"
  onSelect: () => void
  onDelete: () => void
}

export function SubgraphItem({ subgraph, active, status = "idle", onSelect, onDelete }: Props) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
        active
          ? "bg-accent/70 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
          : "hover:bg-accent/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 text-left focus:outline-none"
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            status === "error"
              ? "bg-destructive"
              : status === "ok"
                ? "bg-primary"
                : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
        <span className="truncate text-sm font-medium text-foreground">
          {subgraph.name || "untitled"}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete subgraph ${subgraph.name}`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
