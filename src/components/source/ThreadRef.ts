import { Node, mergeAttributes } from "@tiptap/core";

// Inline atom node representing an "@" reference to a chat thread. Rendered as a styled chip.
// Self-contained (not a Link mark) so it isn't subject to the Link extension's URI validation.
export const ThreadRef = Node.create({
  name: "threadRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      questionId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-question-id"),
        renderHTML: (attrs) => (attrs.questionId ? { "data-question-id": attrs.questionId } : {}),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent?.replace(/^@/, "") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-thread-ref]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-thread-ref": "", class: "thread-ref" }),
      `@${node.attrs.label}`,
    ];
  },
});
