import { Node, mergeAttributes } from "@tiptap/core";

// Inline atom node representing an "@" reference to a source (PDF / YouTube / Note).
// Mirrors ThreadRef — rendered as a distinct styled chip.
export const SourceRef = Node.create({
  name: "sourceRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      sourceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-source-id"),
        renderHTML: (attrs) => (attrs.sourceId ? { "data-source-id": attrs.sourceId } : {}),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent?.replace(/^@/, "") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-source-ref]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-source-ref": "", class: "source-ref" }),
      `@${node.attrs.label}`,
    ];
  },
});
