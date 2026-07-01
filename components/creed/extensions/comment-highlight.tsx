"use client";

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// A comment anchor points at a run of text by its plain-text quote. We
// deliberately keep the anchor OUT of the stored document (it lives only as a
// ProseMirror decoration) so the Markdown source of truth stays clean - the
// highlight is derived at render time from the comment's captured quote.
export type CommentAnchor = {
  id: string;
  quote: string;
};

type CommentHighlightState = {
  anchors: CommentAnchor[];
  activeId: string | null;
  decorations: DecorationSet;
};

type CommentHighlightMeta = {
  anchors?: CommentAnchor[];
  activeId?: string | null;
};

export const commentHighlightPluginKey = new PluginKey<CommentHighlightState>(
  "creedCommentHighlight"
);

// Cap the number of highlights we paint so a document with hundreds of
// comments can't stall decoration building on every keystroke.
const MAX_DECORATIONS = 200;

function buildDecorations(
  doc: ProseMirrorNode,
  anchors: CommentAnchor[],
  activeId: string | null
): DecorationSet {
  const usable = anchors.filter((anchor) => anchor.quote.trim().length > 0);
  if (usable.length === 0) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (decorations.length >= MAX_DECORATIONS) {
      return false;
    }
    // Only text-holding blocks (paragraphs, headings, list item paragraphs)
    // carry a stable char-offset -> position mapping. Character tokens are
    // size 1 and marks don't shift positions, so content offset o maps to
    // document position pos + 1 + o.
    if (!node.isTextblock) {
      return true;
    }
    const text = node.textContent;
    if (!text) {
      return true;
    }
    const lower = text.toLowerCase();
    for (const anchor of usable) {
      const quote = anchor.quote.trim();
      const idx = lower.indexOf(quote.toLowerCase());
      if (idx === -1) {
        continue;
      }
      const from = pos + 1 + idx;
      const to = from + quote.length;
      decorations.push(
        Decoration.inline(from, to, {
          class: `creed-comment-highlight${anchor.id === activeId ? " is-active" : ""}`,
          "data-comment-id": anchor.id,
        })
      );
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}

// Extension that paints comment highlights as inline decorations. Anchors are
// pushed in from React via a transaction meta (see rich-text-editor.tsx) rather
// than stored on the document, so editing text never mutates comment state.
export const CommentHighlight = Extension.create({
  name: "creedCommentHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<CommentHighlightState>({
        key: commentHighlightPluginKey,
        state: {
          init: () => ({
            anchors: [],
            activeId: null,
            decorations: DecorationSet.empty,
          }),
          apply: (tr, value, _oldState, newState) => {
            const meta = tr.getMeta(commentHighlightPluginKey) as
              | CommentHighlightMeta
              | undefined;

            const anchors = meta?.anchors ?? value.anchors;
            const activeId =
              meta && "activeId" in meta ? meta.activeId ?? null : value.activeId;

            if (meta || tr.docChanged) {
              return {
                anchors,
                activeId,
                decorations: buildDecorations(newState.doc, anchors, activeId),
              };
            }

            return { anchors, activeId, decorations: value.decorations };
          },
        },
        props: {
          decorations: (state) => commentHighlightPluginKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
