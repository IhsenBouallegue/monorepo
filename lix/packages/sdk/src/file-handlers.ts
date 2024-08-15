import { v4 } from "uuid";
import type { LixDatabase, LixFile } from "./schema.js";
import type { LixPlugin } from "./plugin.js";
import { minimatch } from "minimatch";
import { Kysely } from "kysely";
import { getChangeHistory } from "./get-change-history.js";

// start a new normalize path function that has the absolute minimum implementation.
function normalizePath(path: string) {
	if (!path.startsWith("/")) {
		return "/" + path;
	}
	return path;
}

// creates initial changes for new files
export async function handleFileInsert(args: {
	neu: LixFile;
	plugins: LixPlugin[];
	db: Kysely<LixDatabase>;
	queueEntry: any;
}) {
	const pluginDiffs: any[] = [];

	// console.log({ args });
	for (const plugin of args.plugins) {
		// glob expressions are expressed relative without leading / but path has leading /
		if (!minimatch(normalizePath(args.neu.path), "/" + plugin.glob)) {
			break;
		}

		const diffs = await plugin.diff!.file!({
			old: undefined,
			neu: args.neu,
		});
		// console.log({ diffs });

		pluginDiffs.push({ diffs, pluginKey: plugin.key });
	}

	await args.db.transaction().execute(async (trx) => {
		for (const { diffs, pluginKey } of pluginDiffs) {
			for (const diff of diffs ?? []) {
				const value = diff.neu ?? diff.old;

				await trx
					.insertInto("change")
					.values({
						id: v4(),
						type: diff.type,
						file_id: args.neu.id,
						plugin_key: pluginKey,
						operation: diff.operation,
						// @ts-expect-error - database expects stringified json
						value: JSON.stringify(value),
						meta: JSON.stringify(diff.meta),
						// add queueId interesting for debugging or knowning what changes were generated in same worker run
					})
					.execute();
			}
		}

		// TODO: decide if TRIGGER or in js land with await trx.insertInto('file_internal').values({ id: args.fileId, blob: args.newBlob, path: args.newPath }).execute()
		await trx
			.deleteFrom("change_queue")
			.where("id", "=", args.queueEntry.id)
			.execute();
	});
}

export async function handleFileChange(args: {
	queueEntry: any;
	old: LixFile;
	neu: LixFile;
	plugins: LixPlugin[];
	db: Kysely<LixDatabase>;
}) {
	const fileId = args.neu?.id ?? args.old?.id;

	const pluginDiffs: any[] = [];

	for (const plugin of args.plugins) {
		// glob expressions are expressed relative without leading / but path has leading /
		if (!minimatch(normalizePath(args.neu.path), "/" + plugin.glob)) {
			break;
		}

		const diffs = await plugin.diff!.file!({
			old: args.old,
			neu: args.neu,
		});

		pluginDiffs.push({
			diffs,
			pluginKey: plugin.key,
			pluginDiffFunction: plugin.diff,
		});
	}

	await args.db.transaction().execute(async (trx) => {
		for (const { diffs, pluginKey, pluginDiffFunction } of pluginDiffs) {
			for (const diff of diffs ?? []) {
				// assume an insert or update operation as the default
				// if diff.neu is not present, it's a delete operationd
				const value = diff.neu ?? diff.old;

				// TODO: save hash of changed fles in every commit to discover inconsistent commits with blob?

				const previousUncomittedChange = await trx
					.selectFrom("change")
					.selectAll()
					.where((eb) => eb.ref("value", "->>").key("id"), "=", value.id)
					.where("type", "=", diff.type)
					.where("file_id", "=", fileId)
					.where("plugin_key", "=", pluginKey)
					.where("commit_id", "is", null)
					.executeTakeFirst();

				const previousCommittedChange = (
					await getChangeHistory({
						atomId: value.id,
						depth: 1,
						fileId,
						pluginKey,
						diffType: diff.type,
						db: trx,
					})
				)[0];

				if (previousUncomittedChange) {
					// working change exists but is different from previously committed change
					// -> update the working change or delete if it is the same as previous uncommitted change
					// overwrite the (uncomitted) change
					// to avoid (potentially) saving every keystroke change
					let previousCommittedDiff = [];

					// working change exists but is identical to previously committed change
					if (previousCommittedChange) {
						previousCommittedDiff = await pluginDiffFunction?.[diff.type]?.({
							old: previousCommittedChange.value,
							neu: diff.neu,
						});

						if (previousCommittedDiff.length === 0) {
							// drop the change because it's identical
							await trx
								.deleteFrom("change")
								.where((eb) => eb.ref("value", "->>").key("id"), "=", value.id)
								.where("type", "=", diff.type)
								.where("file_id", "=", fileId)
								.where("plugin_key", "=", pluginKey)
								.where("commit_id", "is", null)
								.execute();
							continue;
						}
					}

					if (!previousCommittedChange || previousCommittedDiff.length) {
						await trx
							.updateTable("change")
							.where((eb) => eb.ref("value", "->>").key("id"), "=", value.id)
							.where("type", "=", diff.type)
							.where("file_id", "=", fileId)
							.where("plugin_key", "=", pluginKey)
							.where("commit_id", "is", null)
							.set({
								id: v4(),
								// @ts-expect-error - database expects stringified json
								value: JSON.stringify(value),
								operation: diff.operation,
								meta: JSON.stringify(diff.meta),
							})
							.execute();
					}
				} else {
					await trx
						.insertInto("change")
						.values({
							id: v4(),
							type: diff.type,
							file_id: fileId,
							plugin_key: pluginKey,
							parent_id: previousCommittedChange?.id,
							// @ts-expect-error - database expects stringified json
							value: JSON.stringify(value),
							meta: JSON.stringify(diff.meta),
							operation: diff.operation,
						})
						.execute();
				}
			}
		}

		await trx
			.deleteFrom("change_queue")
			.where("id", "=", args.queueEntry.id)
			.execute();
	});
}
