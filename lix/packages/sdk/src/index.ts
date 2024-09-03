export { openLixInMemory } from "./open/openLixInMemory.js";
export { newLixFile } from "./newLix.js";
export * from "./plugin.js";
export * from "./database/schema.js";
export { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/sqlite";
export { v4 as uuidv4 } from "uuid";
export * from "./types.js";
export * from "./query-utilities/index.js";
export * from "./resolve-conflict/errors.js";
export { merge } from "./merge/merge.js";
export { getLeafChangesOnlyInSource } from "./query-utilities/get-leaf-changes-only-in-source.js";

// TODO maybe move to `lix.*` api
// https://github.com/opral/lix-sdk/issues/58
export { resolveConflictBySelecting } from "./resolve-conflict/resolve-conflict-by-selecting.js";
export { resolveConflictWithNewChange } from "./resolve-conflict/resolve-conflict-with-new-change.js";