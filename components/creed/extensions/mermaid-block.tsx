"use client";

import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

// Mermaid diagram block.
//
// Stored in the document as a fenced ```mermaid code block (see
// lib/rich-text.ts markdownToRichHtml and lib/creed-data.ts sectionToMarkdown),
// so it round-trips through Markdown and renders natively on GitHub after a
// publish. In the editor it renders as a live SVG via the `mermaid` package,
// with an inline source editor toggled from the block itself.
//
// The node is an atom: its Mermaid source lives in the `source` attribute and
// is serialized as the text child of `<pre data-type="mermaid"><code>`. There
// is no editable ProseMirror content inside the node; editing happens through
// the node view's textarea, which commits back into the attribute.

const DEFAULT_SOURCE = [
  "flowchart TD",
  "    A[Start] --> B{Decision}",
  "    B -->|Yes| C[Do the thing]",
  "    B -->|No| D[Stop]",
].join("\n");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaidBlock: {
      /** Insert a Mermaid diagram block. Falls back to a starter diagram. */
      setMermaidBlock: (attrs?: { source?: string }) => ReturnType;
    };
  }
}

// Lazy singleton: mermaid is ~500KB, so we only pull it in the first time a
// diagram actually renders rather than at editor mount.
let mermaidModule: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = import("mermaid").then((mod) => mod.default);
  }
  return mermaidModule;
}

function isDarkTheme() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

let renderSeq = 0;

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      source: {
        default: "",
        // The source lives as the text content of the <pre><code> on parse,
        // and is emitted the same way by renderHTML, so it never needs to be
        // an HTML attribute (which would double-escape newlines).
        parseHTML: (element) => element.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    // Both this node and CodeBlockLowlight register a rule that matches a
    // `<pre>`. CodeBlockLowlight's `pre` rule is broad, so without a higher
    // priority here a `<pre data-type="mermaid">` gets claimed as a plain code
    // block and renders as highlighted source instead of a live diagram.
    return [{ tag: 'pre[data-type="mermaid"]', priority: 100, preserveWhitespace: "full" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-type": "mermaid" }),
      ["code", {}, node.attrs.source ?? ""],
    ];
  },

  addCommands() {
    return {
      setMermaidBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { source: attrs?.source?.trim() ? attrs.source : DEFAULT_SOURCE },
          }),
    };
  },

  addNodeView(): NodeViewRenderer {
    return (props) => {
      let node = props.node;
      const editor = props.editor;
      const getPos = props.getPos;
      let source: string = node.attrs.source ?? "";
      let editing = false;

      const dom = document.createElement("div");
      dom.className = "creed-mermaid";
      dom.setAttribute("data-type", "mermaid");

      const preview = document.createElement("div");
      preview.className = "creed-mermaid-preview";
      preview.setAttribute("role", "img");

      const editRow = document.createElement("div");
      editRow.className = "creed-mermaid-edit";
      editRow.style.display = "none";

      const textarea = document.createElement("textarea");
      textarea.className = "creed-mermaid-source";
      textarea.spellcheck = false;
      textarea.setAttribute("aria-label", "Mermaid diagram source");

      const editActions = document.createElement("div");
      editActions.className = "creed-mermaid-edit-actions";
      const doneButton = document.createElement("button");
      doneButton.type = "button";
      doneButton.textContent = "Done";
      doneButton.className = "creed-mermaid-btn creed-mermaid-btn-primary";
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.className = "creed-mermaid-btn";
      editActions.append(cancelButton, doneButton);
      editRow.append(textarea, editActions);

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "creed-mermaid-edit-trigger";
      editButton.textContent = "Edit diagram";
      editButton.setAttribute("aria-label", "Edit diagram source");

      dom.append(preview, editButton, editRow);

      function commit(next: string) {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos == null) return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            source: next,
          })
        );
      }

      async function renderDiagram() {
        const trimmed = source.trim();
        if (!trimmed) {
          preview.innerHTML =
            '<span class="creed-mermaid-empty">Empty diagram. Click “Edit diagram” to add Mermaid syntax.</span>';
          return;
        }

        const token = (renderSeq += 1);
        try {
          const mermaid = await loadMermaid();
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: isDarkTheme() ? "dark" : "default",
            fontFamily: "inherit",
          });
          const { svg } = await mermaid.render(`creed-mermaid-${token}`, trimmed);
          // A newer render may have completed while we awaited; ignore stale.
          if (token !== renderSeq && editing) return;
          preview.innerHTML = svg;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid diagram syntax";
          const wrap = document.createElement("div");
          wrap.className = "creed-mermaid-error";
          const heading = document.createElement("p");
          heading.textContent = "Diagram could not be rendered";
          const detail = document.createElement("pre");
          detail.textContent = message;
          wrap.append(heading, detail);
          preview.replaceChildren(wrap);
        }
      }

      function enterEdit() {
        if (!editor.isEditable) return;
        editing = true;
        textarea.value = source;
        editRow.style.display = "";
        editButton.style.display = "none";
        preview.style.display = "none";
        // Autosize + focus after paint.
        window.requestAnimationFrame(() => {
          textarea.style.height = "auto";
          textarea.style.height = `${Math.max(textarea.scrollHeight, 80)}px`;
          textarea.focus();
        });
      }

      function exitEdit(save: boolean) {
        if (save) {
          const next = textarea.value;
          if (next !== source) {
            source = next;
            commit(next);
          }
        }
        editing = false;
        editRow.style.display = "none";
        editButton.style.display = "";
        preview.style.display = "";
        renderDiagram();
      }

      editButton.addEventListener("click", (event) => {
        event.preventDefault();
        enterEdit();
      });
      preview.addEventListener("dblclick", (event) => {
        event.preventDefault();
        enterEdit();
      });
      doneButton.addEventListener("click", (event) => {
        event.preventDefault();
        exitEdit(true);
      });
      cancelButton.addEventListener("click", (event) => {
        event.preventDefault();
        exitEdit(false);
      });
      textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.max(textarea.scrollHeight, 80)}px`;
      });
      textarea.addEventListener("keydown", (event) => {
        // Cmd/Ctrl+Enter commits; Escape cancels. Plain Enter inserts a
        // newline (Mermaid is line-oriented) so it must reach the textarea.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          exitEdit(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          exitEdit(false);
        }
      });

      void renderDiagram();

      return {
        dom,
        update(updated) {
          if (updated.type.name !== node.type.name) return false;
          node = updated;
          const nextSource = updated.attrs.source ?? "";
          if (nextSource !== source && !editing) {
            source = nextSource;
            void renderDiagram();
          }
          return true;
        },
        selectNode() {
          dom.classList.add("creed-mermaid-selected");
        },
        deselectNode() {
          dom.classList.remove("creed-mermaid-selected");
        },
        // While editing, keep ProseMirror out of the textarea's events.
        stopEvent: () => editing,
        ignoreMutation: () => true,
      };
    };
  },
});
