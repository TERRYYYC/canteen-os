/** Explicit routes only: the gateway is not a general-purpose HTTP proxy. */
export const KNOWLEDGE_JSON_MAX_BYTES = 4 * 1024 * 1024;
export const KNOWLEDGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024 + 64 * 1024;

export const KNOWLEDGE_ROUTES = [
  ["GET", "/knowledge/health"],
  ["GET", "/knowledge/recipes"],
  ["GET", "/knowledge/recipes/:id"],
  ["GET", "/knowledge/recipes/:id/revisions"],
  ["GET", "/knowledge/recipes/:id/revisions/:version"],
  ["POST", "/knowledge/recipes"],
  ["PUT", "/knowledge/recipes/:id"],
  ["POST", "/knowledge/recipes/:id/archive"],
  ["POST", "/knowledge/sources"],
  ["POST", "/knowledge/assets/external"],
  ["POST", "/knowledge/assets/upload"],
  ["GET", "/knowledge/assets/:id/content"],
  ["GET", "/knowledge/ingredients"],
  ["GET", "/knowledge/techniques"],
  ["GET", "/knowledge/recipes/:id/legacy"],
] as const;
