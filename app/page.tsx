"use client"

import dynamic from "next/dynamic"
import { Spinner } from "@/components/ui/spinner"

// The playground depends on browser APIs (IndexedDB, CodeMirror).
// Render it client-side only to avoid SSR mismatches.
const Playground = dynamic(() => import("@/components/playground").then((m) => m.Playground), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center">
      <Spinner className="text-muted-foreground" />
    </div>
  ),
})

export default function Page() {
  return <Playground />
}
