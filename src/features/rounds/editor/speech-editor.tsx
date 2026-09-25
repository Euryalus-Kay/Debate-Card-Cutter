"use client";

import { useEffect, useMemo } from "react";
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import type * as Y from "yjs";
import { Bold, Highlighter, Underline as UnderlineIcon, Type, Heading3, Heading4, StickyNote, SquarePlus, Undo2, Redo2, Minimize2 } from "lucide-react";
import { Card, DRAFT_FRAGMENT, editorExtensions, makeId, Section, type BlockedReason } from "@/shared/editor/schema";
import { highlightCss } from "@/shared/draft-model";
import { cn, IconButton, Tooltip, toast } from "@/components/ui";
import { CardView, SectionView } from "./node-views";
import { useWorkspace } from "../store";
import { insertSectionAfterCurrent } from "../proposals";
import { AnchoredMarks } from "./anchored-marks";

const blockedMessages: Record<BlockedReason, string> = {
  locked_section: "That section is locked. Unlock it (lock icon) to edit.",
  card_text: "Card text is verbatim from the source. Re-highlight or underline freely; use \"Edit card text\" in the card menu to change words (the card will be flagged).",
};

let lastBlockToast = 0;

/** Throttled explanation when an edit is refused (locked section, verbatim card text). */
function notifyBlocked(reason: BlockedReason) {
  if (Date.now() - lastBlockToast > 2500) {
    lastBlockToast = Date.now();
    toast(blockedMessages[reason], "warn");
  }
}

export function useSpeechEditor(doc: Y.Doc | null, editable: boolean) {
  const extensions = useMemo(() => {
    // Until a draft document exists, use a plain (non-collaborative) schema so the editor is valid.
    if (!doc) return editorExtensions({ collaborative: false });
    const base = editorExtensions({
      collaborative: true,
      onBlocked: notifyBlocked,
    }).map((ext) => {
      if (ext.name === "section") return Section.extend({ addNodeView: () => ReactNodeViewRenderer(SectionView) });
      if (ext.name === "card") return Card.extend({ addNodeView: () => ReactNodeViewRenderer(CardView) });
      return ext;
    });
    return [
      ...base,
      Collaboration.configure({ document: doc, field: DRAFT_FRAGMENT }),
      AnchoredMarks,
      Placeholder.configure({ placeholder: "Start typing, add a section, or generate a draft…" }),
    ];
  }, [doc]);

  const editor = useEditor(
    {
      extensions,
      editable: editable && !!doc,
      immediatelyRender: false,
      editorProps: { attributes: { spellcheck: "true", "aria-label": "Speech draft" } },
    },
    [extensions],
  );
  useEffect(() => {
    editor?.setEditable(editable && !!doc);
  }, [editor, editable, doc]);
  return editor;
}

const HL_COLORS: { name: string; css: string }[] = [
  { name: "Yellow", css: highlightCss("yellow") },
  { name: "Cyan", css: highlightCss("cyan") },
  { name: "Green", css: highlightCss("green") },
];

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const ws = useWorkspace();
  const state = useEditorState({
    editor,
    selector: (c) =>
      c.editor
        ? {
            bold: c.editor.isActive("bold"),
            underline: c.editor.isActive("underline"),
            emphasis: c.editor.isActive("emphasis"),
            highlight: c.editor.isActive("highlight"),
            canUndo: c.editor.can().undo?.() ?? false,
            canRedo: c.editor.can().redo?.() ?? false,
          }
        : null,
  });
  if (!editor || !state) return null;
  const insertSection = () => {
    const id = makeId("sec");
    insertSectionAfterCurrent(editor, {
      type: "section",
      attrs: { id, kind: "response", relation: "none", targets: [], origin: "human" },
      content: [
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "New section" }] },
        { type: "paragraph" },
      ],
    });
    // Put the cursor in the new section's heading with its placeholder text selected, so typing names it.
    let from = -1;
    editor.state.doc.descendants((node, pos) => {
      if (from >= 0) return false;
      if (node.type.name === "section" && node.attrs.id === id) {
        from = pos + 2; // inside section → inside heading
        return false;
      }
      return true;
    });
    if (from >= 0) editor.chain().focus().setTextSelection({ from, to: from + "New section".length }).run();
  };
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line bg-elev px-2"
      role="toolbar"
      aria-label="Formatting"
      // Clicking a toolbar button must not take focus (or the text selection) away from the editor.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      <IconButton label="Undo (⌘Z)" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton label="Redo (⌘⇧Z)" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-4" />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-line" />
      <IconButton label="Bold (⌘B)" className={cn(state.bold && "bg-hover")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </IconButton>
      <IconButton label="Underline (⌘U)" className={cn(state.underline && "bg-hover")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="size-4" />
      </IconButton>
      <IconButton label="Emphasis (⌘E)" className={cn(state.emphasis && "bg-hover")} onClick={() => editor.chain().focus().toggleMark("emphasis").run()}>
        <Type className="size-4" />
      </IconButton>
      {HL_COLORS.map((c) => (
        <Tooltip key={c.name} content={`Highlight ${c.name.toLowerCase()} (⌘⇧H)`}>
          <button
            onClick={() => editor.chain().focus().toggleHighlight({ color: c.css }).run()}
            className="flex size-7 items-center justify-center rounded-md hover:bg-hover"
            aria-label={`Highlight ${c.name}`}
          >
            <span className="flex size-4 items-center justify-center rounded-sm" style={{ background: c.css }}>
              <Highlighter className="size-3 text-black/70" />
            </span>
          </button>
        </Tooltip>
      ))}
      <IconButton label="Remove highlight" onClick={() => editor.chain().focus().unsetHighlight().run()}>
        <Highlighter className="size-4 opacity-50" />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-line" />
      <IconButton label="Block heading" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </IconButton>
      <IconButton label="Tag heading" onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
        <Heading4 className="size-4" />
      </IconButton>
      <IconButton label="Add section" onClick={insertSection}>
        <SquarePlus className="size-4" />
      </IconButton>
      <IconButton
        label="Partner note (not read aloud)"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({ type: "note", content: [{ type: "text", text: "note" }] })
            .run()
        }
      >
        <StickyNote className="size-4" />
      </IconButton>
      <div className="ml-auto" />
      <IconButton label={ws.shrinkUnread ? "Show unread text at full size" : "Shrink text you won't read"} className={cn(ws.shrinkUnread && "bg-hover")} onClick={() => ws.set({ shrinkUnread: !ws.shrinkUnread })}>
        <Minimize2 className="size-4" />
      </IconButton>
    </div>
  );
}

export function SpeechEditorView({ editor, children }: { editor: Editor | null; children?: React.ReactNode }) {
  const ws = useWorkspace();
  return (
    <div className={cn("speech-editor min-h-0 flex-1 overflow-y-auto", ws.shrinkUnread && "shrink-unread")}>
      {/* Overlays (AI suggestions under their words) are positioned inside the scrolling content. */}
      <div className="relative mx-auto max-w-[860px] pl-10">
        <EditorContent editor={editor} />
        {children}
      </div>
    </div>
  );
}
