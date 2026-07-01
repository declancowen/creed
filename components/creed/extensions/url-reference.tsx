"use client";

import { mergeAttributes, Node, type NodeViewRenderer } from "@tiptap/core";
import {
  ensureLinkPreview,
  resolveLinkPreview,
  subscribeLinkPreview,
  type LinkPreview,
} from "@/lib/link-preview-index";
import { isHttpUrl, urlHostname } from "@/lib/url-reference";

// Three Tiptap nodes render an external URL, mirroring Notion's paste menu:
//   - UrlMentionInline: an inline atom chip (favicon + title) that opens the link.
//   - UrlBookmarkCard:  a block card (favicon, title, description, host).
//   - UrlEmbed:         a block full-width iframe preview with a header bar.
//
// All three round-trip through Markdown as `[mention|bookmark|embed](url)`
// (see lib/url-reference.ts, lib/rich-text.ts and sectionToMarkdown in
// lib/creed-data.ts). Metadata resolves live from the link-preview index so
// titles/descriptions stay fresh without storing a stale copy.

export type UrlReferenceOptions = {
  // Opens a URL. Supplied by the editor (defaults to a new tab).
  onOpen: (url: string) => void;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    urlReference: {
      insertUrlMention: (attrs: { url: string }) => ReturnType;
      insertUrlBookmark: (attrs: { url: string }) => ReturnType;
      insertUrlEmbed: (attrs: { url: string }) => ReturnType;
    };
  }
}

const urlAttributes = {
  url: {
    default: "",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-url") ?? "",
    renderHTML: (attributes: { url?: string }) => ({ "data-url": attributes.url ?? "" }),
  },
};

function faviconImg(preview: LinkPreview, sizePx: number) {
  const img = document.createElement("img");
  img.className = "creed-url-ref-favicon";
  img.width = sizePx;
  img.height = sizePx;
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.style.width = `${sizePx}px`;
  img.style.height = `${sizePx}px`;
  img.style.flex = "0 0 auto";
  img.style.borderRadius = "3px";
  if (preview.favicon) img.src = preview.favicon;
  img.addEventListener("error", () => {
    img.style.visibility = "hidden";
  });
  return img;
}

function createUrlNodeView(form: "mention" | "bookmark" | "embed"): NodeViewRenderer {
  return (props) => {
    const options = props.extension.options as UrlReferenceOptions;
    const url: string = props.node.attrs.url ?? "";
    const safe = isHttpUrl(url);

    const dom: HTMLElement = document.createElement(form === "mention" ? "span" : "div");
    dom.className = `creed-url-ref creed-url-ref-${form}`;
    dom.setAttribute("data-url-ref", form);
    dom.setAttribute("data-url", url);
    dom.contentEditable = "false";

    if (form === "mention") {
      dom.setAttribute("role", "link");
      dom.setAttribute("tabindex", "0");
      // Inline chip layout set inline so it survives before CSS applies.
      dom.style.display = "inline-flex";
      dom.style.alignItems = "center";
      dom.style.gap = "5px";
      dom.style.verticalAlign = "baseline";
      dom.style.whiteSpace = "nowrap";
      dom.style.cursor = "pointer";
      dom.style.fontSize = "0.92em";
      dom.style.lineHeight = "1.4";
      dom.style.padding = "1px 7px 2px 6px";
      dom.style.borderRadius = "6px";
      dom.style.border = "1px solid rgba(128, 128, 128, 0.3)";
      dom.style.background = "rgba(128, 128, 128, 0.14)";
    }

    function open() {
      if (safe) options.onOpen?.(url);
    }

    dom.addEventListener("mousedown", (event) => event.preventDefault());
    if (form !== "embed") {
      dom.addEventListener("click", (event) => {
        event.preventDefault();
        open();
      });
    }
    dom.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    function render(preview: LinkPreview) {
      dom.innerHTML = "";
      const host = urlHostname(url);
      const title = preview.title || host;

      if (form === "mention") {
        dom.appendChild(faviconImg(preview, 14));
        const label = document.createElement("span");
        label.className = "creed-url-ref-label";
        label.textContent = title;
        dom.appendChild(label);
        dom.title = safe ? url : `${url} (invalid link)`;
        return;
      }

      if (form === "bookmark") {
        const text = document.createElement("div");
        text.className = "creed-url-ref-card-text";
        const titleEl = document.createElement("div");
        titleEl.className = "creed-url-ref-card-title";
        titleEl.textContent = title;
        text.appendChild(titleEl);
        if (preview.description) {
          const desc = document.createElement("p");
          desc.className = "creed-url-ref-card-desc";
          desc.textContent = preview.description;
          text.appendChild(desc);
        }
        const link = document.createElement("div");
        link.className = "creed-url-ref-card-link";
        link.appendChild(faviconImg(preview, 16));
        const linkText = document.createElement("span");
        linkText.textContent = url;
        link.appendChild(linkText);
        text.appendChild(link);
        dom.appendChild(text);

        if (preview.image) {
          const thumb = document.createElement("div");
          thumb.className = "creed-url-ref-card-thumb";
          thumb.style.backgroundImage = `url("${preview.image.replace(/"/g, "%22")}")`;
          dom.appendChild(thumb);
        }
        dom.setAttribute("role", "link");
        dom.style.cursor = "pointer";
        return;
      }

      // Embed: header bar (favicon + host + open) over a sandboxed iframe.
      const header = document.createElement("div");
      header.className = "creed-url-ref-embed-header";
      header.appendChild(faviconImg(preview, 14));
      const hostLabel = document.createElement("span");
      hostLabel.className = "creed-url-ref-embed-host";
      hostLabel.textContent = title;
      header.appendChild(hostLabel);
      const openLink = document.createElement("button");
      openLink.type = "button";
      openLink.className = "creed-url-ref-embed-open";
      openLink.textContent = "Open ↗";
      openLink.contentEditable = "false";
      openLink.addEventListener("mousedown", (event) => event.preventDefault());
      openLink.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      });
      header.appendChild(openLink);
      dom.appendChild(header);

      if (safe) {
        const frame = document.createElement("iframe");
        frame.className = "creed-url-ref-embed-frame";
        frame.src = url;
        frame.loading = "lazy";
        frame.referrerPolicy = "no-referrer";
        // Sandbox the embed: scripts + same-origin so most pages work, but no
        // top-navigation so a hostile embed can't redirect the editor.
        frame.setAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-popups allow-forms"
        );
        dom.appendChild(frame);
      } else {
        const invalid = document.createElement("p");
        invalid.className = "creed-url-ref-card-desc";
        invalid.textContent = "This link can't be embedded.";
        dom.appendChild(invalid);
      }
    }

    render(resolveLinkPreview(url));
    if (safe) void ensureLinkPreview(url);
    const unsubscribe = subscribeLinkPreview(() => render(resolveLinkPreview(url)));

    return {
      dom,
      update(updatedNode) {
        return updatedNode.type.name === props.node.type.name;
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

export const UrlMentionInline = Node.create<UrlReferenceOptions>({
  name: "urlMentionInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { onOpen: () => {} };
  },

  addAttributes() {
    return urlAttributes;
  },

  parseHTML() {
    return [{ tag: 'span[data-url-ref="mention"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-url-ref": "mention" })];
  },

  addNodeView() {
    return createUrlNodeView("mention");
  },

  addCommands() {
    return {
      insertUrlMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
      insertUrlBookmark:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "urlBookmarkCard", attrs }),
      insertUrlEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "urlEmbed", attrs }),
    };
  },
});

export const UrlBookmarkCard = Node.create<UrlReferenceOptions>({
  name: "urlBookmarkCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addOptions() {
    return { onOpen: () => {} };
  },

  addAttributes() {
    return urlAttributes;
  },

  parseHTML() {
    return [{ tag: 'div[data-url-ref="bookmark"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-url-ref": "bookmark" })];
  },

  addNodeView() {
    return createUrlNodeView("bookmark");
  },
});

export const UrlEmbed = Node.create<UrlReferenceOptions>({
  name: "urlEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addOptions() {
    return { onOpen: () => {} };
  },

  addAttributes() {
    return urlAttributes;
  },

  parseHTML() {
    return [{ tag: 'div[data-url-ref="embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-url-ref": "embed" })];
  },

  addNodeView() {
    return createUrlNodeView("embed");
  },
});
