"use client";

import { mergeAttributes, Node, type NodeViewRenderer } from "@tiptap/core";
import {
  DOCUMENT_TONE_STYLE,
  documentPropertyTone,
  labelDocumentProperty,
  type DocumentPropertyKey,
} from "@/lib/document-properties";
import {
  isDocReferenceKind,
  referenceHref,
  type DocReferenceKind,
} from "@/lib/document-reference";
import {
  ensureReferenceIndex,
  resolveReference,
  subscribeReferenceIndex,
  type DocumentReferenceEntry,
} from "@/lib/document-reference-index";

// Two Tiptap nodes render a document/folder reference:
//   - DocReferenceInline: an inline atom chip (name only) that opens the link.
//   - DocReferenceCard:   a block atom full-width card (title, description,
//     property pills) mirroring the dashboard document card.
//
// Both round-trip through Markdown as `[[kind:slug]]` / `![[kind:slug]]` (see
// lib/document-reference.ts, lib/rich-text.ts, and sectionToMarkdown in
// lib/creed-data.ts). The node views resolve live metadata from the client
// reference index so titles/pills stay current without storing a stale copy.

export type DocReferenceOptions = {
  // Opens a reference target. Supplied by the editor so navigation uses the
  // Next router (SPA) instead of a full page load.
  onOpen: (href: string) => void;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docReference: {
      insertDocReferenceInline: (attrs: { refKind: DocReferenceKind; refSlug: string }) => ReturnType;
      insertDocReferenceCard: (attrs: { refKind: DocReferenceKind; refSlug: string }) => ReturnType;
    };
  }
}

const CARD_PILL_PROPERTIES: DocumentPropertyKey[] = [
  "status",
  "documentType",
  "stage",
  "lifecycle",
  "priority",
  "size",
];

function svgIcon(kind: DocReferenceKind, sizePx: number) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "1.8");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("aria-hidden", "true");
  // Explicit width/height + inline sizing so the SVG can never fall back to
  // its default 300x150 intrinsic size (which happens before CSS applies or if
  // the class selector is overridden), which would blow the icon up to fill
  // the editor.
  el.setAttribute("width", String(sizePx));
  el.setAttribute("height", String(sizePx));
  el.style.width = `${sizePx}px`;
  el.style.height = `${sizePx}px`;
  el.style.flex = "0 0 auto";
  el.innerHTML =
    kind === "folder"
      ? '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />'
      : '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />';
  return el;
}

function pillFor(property: DocumentPropertyKey, value: string) {
  const pill = document.createElement("span");
  pill.className = "creed-doc-ref-pill";
  const tone = documentPropertyTone(property, value);
  const style = DOCUMENT_TONE_STYLE[tone];
  pill.style.backgroundColor = style.backgroundColor;
  pill.style.color = style.color;
  pill.style.border = style.border;
  pill.textContent = labelDocumentProperty(property, value);
  return pill;
}

// Shared node-view factory. `form` selects the chip vs. card rendering; both
// resolve from the same reference index and open the same href on click.
function createReferenceNodeView(form: "inline" | "card"): NodeViewRenderer {
  return (props) => {
    const editor = props.editor;
    const getPos = props.getPos;
    const options = props.extension.options as DocReferenceOptions;

    const rawKind = props.node.attrs.refKind;
    const kind: DocReferenceKind = isDocReferenceKind(rawKind) ? rawKind : "doc";
    const slug: string = props.node.attrs.refSlug ?? "";
    const href = referenceHref(kind, slug);

    const dom: HTMLElement = document.createElement(form === "inline" ? "span" : "div");
    dom.className = form === "inline" ? "creed-doc-ref creed-doc-ref-inline" : "creed-doc-ref creed-doc-ref-card";
    dom.setAttribute("data-doc-ref", form);
    dom.setAttribute("data-ref-kind", kind);
    dom.setAttribute("data-ref-slug", slug);
    dom.setAttribute("role", "link");
    dom.setAttribute("tabindex", "0");
    dom.contentEditable = "false";

    // Essential layout set inline so the chip stays a single-line icon+label
    // even if the stylesheet has not loaded / applied. Tailwind Preflight forces
    // `svg { display:block }`, so the container must be a flex row or the icon
    // breaks onto its own line.
    if (form === "inline") {
      dom.style.display = "inline-flex";
      dom.style.alignItems = "center";
      dom.style.gap = "4px";
      dom.style.verticalAlign = "baseline";
      dom.style.whiteSpace = "nowrap";
      dom.style.cursor = "pointer";
      dom.style.fontSize = "0.92em";
      dom.style.lineHeight = "1.4";
      // Boxed, subtly grey chip so a reference reads as a distinct object.
      // Mid-grey with alpha so it works on both light and dark canvases (inline
      // styles win over the theme stylesheet, so we can't rely on .dark here).
      dom.style.padding = "1px 7px 2px 6px";
      dom.style.borderRadius = "6px";
      dom.style.border = "1px solid rgba(128, 128, 128, 0.3)";
      dom.style.background = "rgba(128, 128, 128, 0.14)";
      dom.style.color = "inherit";
      dom.style.textDecoration = "none";
    }

    function open() {
      options.onOpen?.(href);
    }

    dom.addEventListener("mousedown", (event) => {
      // Prevent ProseMirror from turning the click into a node selection so a
      // single click reliably navigates.
      event.preventDefault();
    });
    dom.addEventListener("click", (event) => {
      event.preventDefault();
      open();
    });
    dom.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    function toggleForm() {
      if (typeof getPos !== "function" || !editor.isEditable) return;
      const pos = getPos();
      if (typeof pos !== "number") return;
      const nextType = form === "inline" ? "docReferenceCard" : "docReferenceInline";
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: pos, to: pos + props.node.nodeSize },
          { type: nextType, attrs: { refKind: kind, refSlug: slug } }
        )
        .run();
    }

    function render(entry: DocumentReferenceEntry | null) {
      dom.innerHTML = "";
      const missing = !entry;
      dom.classList.toggle("creed-doc-ref-missing", missing);
      const title = entry?.title ?? slug;

      if (form === "inline") {
        const icon = svgIcon(kind, 14);
        icon.setAttribute("class", "creed-doc-ref-icon");
        dom.appendChild(icon);
        const label = document.createElement("span");
        label.className = "creed-doc-ref-label";
        label.textContent = title;
        dom.appendChild(label);
        dom.title = missing ? `${title} (not found)` : title;
        return;
      }

      // Card form.
      const header = document.createElement("div");
      header.className = "creed-doc-ref-card-header";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "8px";
      const icon = svgIcon(kind, 16);
      icon.setAttribute("class", "creed-doc-ref-icon");
      header.appendChild(icon);
      const titleEl = document.createElement("span");
      titleEl.className = "creed-doc-ref-card-title";
      titleEl.textContent = title;
      header.appendChild(titleEl);
      dom.appendChild(header);

      const description = entry?.description?.trim();
      if (description) {
        const desc = document.createElement("p");
        desc.className = "creed-doc-ref-card-desc";
        desc.textContent = description;
        dom.appendChild(desc);
      } else if (missing) {
        const desc = document.createElement("p");
        desc.className = "creed-doc-ref-card-desc";
        desc.textContent = kind === "folder" ? "Folder not found." : "Document not found.";
        dom.appendChild(desc);
      }

      if (entry && kind === "doc") {
        const pills = document.createElement("div");
        pills.className = "creed-doc-ref-card-pills";
        for (const property of CARD_PILL_PROPERTIES) {
          const value = entry[property];
          if (typeof value === "string" && value) {
            pills.appendChild(pillFor(property, value));
          }
        }
        if (pills.childElementCount > 0) {
          dom.appendChild(pills);
        }
      }

      if (editor.isEditable) {
        const collapse = document.createElement("button");
        collapse.type = "button";
        collapse.className = "creed-doc-ref-toggle";
        collapse.textContent = "Collapse to inline";
        collapse.contentEditable = "false";
        collapse.addEventListener("mousedown", (event) => event.preventDefault());
        collapse.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleForm();
        });
        dom.appendChild(collapse);
      }
    }

    // Inline chips get a hover affordance to expand into a card.
    if (form === "inline") {
      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = "creed-doc-ref-expand";
      expand.title = "Expand to card";
      expand.textContent = "⤢";
      expand.contentEditable = "false";
      expand.addEventListener("mousedown", (event) => event.preventDefault());
      expand.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleForm();
      });
      // Appended after render() populates the label so it sits at the end.
      dom.addEventListener("mouseenter", () => {
        if (editor.isEditable && !dom.contains(expand)) dom.appendChild(expand);
      });
      dom.addEventListener("mouseleave", () => {
        if (dom.contains(expand)) dom.removeChild(expand);
      });
    }

    render(resolveReference(kind, slug));
    void ensureReferenceIndex();
    const unsubscribe = subscribeReferenceIndex(() => {
      render(resolveReference(kind, slug));
    });

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== props.node.type.name) return false;
        // Slug/kind are immutable for a given node instance; nothing to update
        // beyond re-resolving, which the subscription already handles.
        return true;
      },
      ignoreMutation() {
        return true;
      },
      destroy() {
        unsubscribe();
      },
    };
  };
}

const referenceAttributes = {
  refKind: {
    default: "doc",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-ref-kind") ?? "doc",
    renderHTML: (attributes: { refKind?: string }) => ({
      "data-ref-kind": attributes.refKind ?? "doc",
    }),
  },
  refSlug: {
    default: "",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-ref-slug") ?? "",
    renderHTML: (attributes: { refSlug?: string }) => ({
      "data-ref-slug": attributes.refSlug ?? "",
    }),
  },
};

export const DocReferenceInline = Node.create<DocReferenceOptions>({
  name: "docReferenceInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { onOpen: () => {} };
  },

  addAttributes() {
    return referenceAttributes;
  },

  parseHTML() {
    return [{ tag: 'span[data-doc-ref="inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-doc-ref": "inline" })];
  },

  addNodeView() {
    return createReferenceNodeView("inline");
  },

  addCommands() {
    return {
      insertDocReferenceInline:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
      insertDocReferenceCard:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "docReferenceCard", attrs }),
    };
  },
});

export const DocReferenceCard = Node.create<DocReferenceOptions>({
  name: "docReferenceCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addOptions() {
    return { onOpen: () => {} };
  },

  addAttributes() {
    return referenceAttributes;
  },

  parseHTML() {
    return [{ tag: 'div[data-doc-ref="card"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-doc-ref": "card" })];
  },

  addNodeView() {
    return createReferenceNodeView("card");
  },
});
