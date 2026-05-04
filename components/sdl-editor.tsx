"use client"

import { useTheme } from "next-themes"
import CodeMirror from "@uiw/react-codemirror"
import { graphql } from "cm6-graphql"
import { oneDark } from "@codemirror/theme-one-dark"
import { EditorView } from "@codemirror/view"
import { useMemo } from "react"

type Props = {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  minHeight?: string
  maxHeight?: string
  placeholder?: string
}

export function SdlEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = "180px",
  maxHeight,
  placeholder,
}: Props) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const extensions = useMemo(() => {
    const ext = [
      graphql(),
      EditorView.lineWrapping,
      EditorView.theme(
        {
          "&": {
            backgroundColor: "transparent",
          },
          ".cm-content": {
            padding: "12px 0",
            caretColor: "var(--primary)",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
          },
        },
        { dark: isDark },
      ),
    ]
    return ext
  }, [isDark])

  return (
    <div className="h-full w-full overflow-hidden rounded-md border bg-card">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        theme={isDark ? oneDark : "light"}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
        }}
        style={{
          minHeight,
          maxHeight,
          height: maxHeight ? "100%" : "auto",
        }}
      />
    </div>
  )
}
