import type { LixPlugin } from "./plugin.js";

export type LixDatabase = {
	file: LixFile;
	change: Change;
	commit: Commit;
	ref: Ref;
	file_internal: LixFile;
	change_queue: ChangeQueueEntry;
};

export type Ref = {
	name: string;
	commit_id: string;
};

export type ChangeQueueEntry = {
	id?: number;
	path: string;
	file_id: LixFile["id"];
	data: ArrayBuffer;
};

// named lix file to avoid conflict with built-in file type
export type LixFile = {
	id: string;
	path: string;
	data: ArrayBuffer;
};

export type Commit = {
	id: string; // uuid
	// todo:
	//  multiple users can commit one change
	//  think of real-time collaboration scenarios
	user_id: string; // @relation to a user
	description: string;
	created?: string;
	parent_id: string;
	// @relation changes: Change[]
};

export type Change = {
	id: string;
	file_id: LixFile["id"];
	/**
	 * If no commit id exists on a change,
	 * the change is considered uncommitted.
	 */
	commit_id?: Commit["id"];
	/**
	 * The plugin key that contributed the change.
	 *
	 * Exists to ease querying for changes by plugin,
	 * in case the user changes the plugin configuration.
	 */
	plugin_key: LixPlugin["key"];
	/**
	 * The operation that was performed.
	 *
	 * The operation is taken from the diff reports.
	 */
	operation: "create" | "update" | "delete";

	/**
	 * The type of change that was made.
	 *
	 * @example
	 *   - "cell" for csv cell change
	 *   - "message" for inlang message change
	 *   - "user" for a user change
	 */
	type: string;
	/**
	 * The value of the change.
	 *
	 * The value is `undefined` for a delete operation.
	 *
	 * @example
	 *   - For a csv cell change, the value would be the new cell value.
	 *   - For an inlang message change, the value would be the new message.
	 */
	value?: Record<string, any> & {
		id: string;
	}; // JSONB

	conflict?: any[] | null;
	/**
	 * Additional metadata for the change used by the plugin
	 * to process changes.
	 */
	meta?: string; // JSONB
};
