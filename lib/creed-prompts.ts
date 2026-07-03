// The prompts Creed exposes over MCP (prompts/list + prompts/get).
export const CREED_PROMPTS = [
  {
    name: "review-document",
    description: "Read a shared Creed document and suggest targeted improvements.",
    text: "Use read_creed for the workspace contract, then use creed_list_documents to choose a shared document. Use creed_read_document for normal-sized documents. For large documents, use creed_read_document_digest first, then creed_outline_document, creed_read_document_block, and creed_search_document for exact areas. Review it for unclear, stale, duplicated, or poorly structured content. If a targeted edit is warranted, use creed_update_document for full-body edits or creed_update_document_patch for exact block replacements with the latest expectedRevision. If a question or review note is better, use creed_create_document_comment for document content. If the note is about a proposed edit, use creed_create_proposal_comment with proposalId or proposalFamilyId.",
  },
  {
    name: "format-document",
    description: "Improve a shared document using Creed's supported editor Markdown.",
    text: "Use read_creed for the workspace contract, then inspect the target shared document with creed_read_document for normal-sized documents. For large documents, use creed_read_document_digest first, then creed_outline_document, creed_read_document_block, and creed_search_document for exact areas. Improve only the needed Markdown while preserving unchanged content exactly. Use headings for navigation, tables for comparisons, mermaid diagrams for branching flows or relationships, callouts for important constraints, and document or URL references when they keep context live. Submit with creed_update_document for full-body edits or creed_update_document_patch for exact block replacements with the latest expectedRevision.",
  },
] as const;
