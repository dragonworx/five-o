// Shared by the client and server bundles, so it must stay free of imports.
// Adding ?test=1 to the page URL makes the client tag every API request with
// the header below; the server then runs those requests against a throwaway
// in-memory database (dev only — see server/db.ts).
export const TEST_MODE_QUERY_PARAM = "test";
export const TEST_MODE_HEADER = "x-test-mode";
