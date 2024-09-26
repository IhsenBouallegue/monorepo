import type { LixPlugin } from "../plugin.js";
import { createDiscussion } from "../discussion/create-discussion.js";
import { addComment } from "../discussion/add-comment.js";
import { handleFileChange, handleFileInsert } from "../file-handlers.js";
import { loadPlugins } from "../load-plugin.js";
import { contentFromDatabase, type SqliteDatabase } from "sqlite-wasm-kysely";
import { initDb } from "../database/initDb.js";
import { createBranch } from "../branch/create.js";
import { switchBranch } from "../branch/switch.js";

// TODO: fix in fink to not use time ordering!
// .orderBy("commit.created desc")

/**
 * Common setup between different lix environments.
 */
export async function openLix(args: {
	database: SqliteDatabase;
	/**
	 * Usecase are lix apps that define their own file format,
	 * like inlang (unlike a markdown, csv, or json plugin).
	 *
	 * (+) avoids separating app code from plugin code and
	 *     resulting bundling logic.
	 * (-) such a file format must always be opened with the
	 *     file format sdk. the file is not portable
	 *
	 * @example
	 *   const lix = await openLixInMemory({ blob: await newLixFile(), providePlugin: [myPlugin] })
	 */
	providePlugins?: LixPlugin[];
}) {
	const db = initDb({ sqlite: args.database });

	const plugins = await loadPlugins(db);
	if (args.providePlugins && args.providePlugins.length > 0) {
		plugins.push(...args.providePlugins);
	}

	args.database.createFunction({
		name: "triggerWorker",
		arity: 0,
		// @ts-expect-error - dynamic function
		xFunc: () => {
			// TODO: abort current running queue?
			queueWorker();
		},
	});

	let currentAuthor: string | undefined;

	let pending: Promise<void> | undefined;
	let resolve: () => void;
	// run number counts the worker runs in a current batch and is used to prevent race conditions where a trigger is missed because a previous run is just about to reset the hasMoreEntriesSince flag
	let runNumber = 1;
	// If a queue trigger happens during an existing queue run we might miss updates and use hasMoreEntriesSince to make sure there is always a final immediate queue worker execution
	let hasMoreEntriesSince: number | undefined = undefined;
	async function queueWorker(trail = false) {
		try {
			if (pending && !trail) {
				hasMoreEntriesSince = runNumber;
				// console.log({ hasMoreEntriesSince });
				return;
			}
			runNumber++;

			if (!pending) {
				pending = new Promise((res) => {
					resolve = res;
				});
			}

			const entry = await db
				.selectFrom("change_queue")
				.selectAll()
				.orderBy("id asc")
				.limit(1)
				.executeTakeFirst();

			if (entry) {
				const existingFile = await db
					.selectFrom("file_internal")
					.selectAll()
					.where("id", "=", entry.file_id)
					.limit(1)
					.executeTakeFirst();

				if (existingFile?.data) {
					await handleFileChange({
						currentAuthor,
						queueEntry: entry,
						old: {
							...existingFile,
							id: entry.file_id,
						},
						neu: {
							...entry,
							id: entry.file_id,
						},
						plugins,
						db,
					});
				} else {
					await handleFileInsert({
						currentAuthor,
						queueEntry: entry,
						neu: {
							...entry,
							id: entry.file_id,
						},
						plugins,
						db,
					});
				}
			}

			// console.log("getrting { numEntries }");

			const { numEntries } = await db
				.selectFrom("change_queue")
				.select((eb) => eb.fn.count<number>("id").as("numEntries"))
				.executeTakeFirstOrThrow();

			// console.log({ numEntries });

			if (
				!hasMoreEntriesSince ||
				(numEntries === 0 && hasMoreEntriesSince < runNumber)
			) {
				resolve!(); // TODO: fix type
				pending = undefined;
				hasMoreEntriesSince = undefined;
				// console.log("resolving");
			}

			// TODO: handle endless tries on failing quee entries
			// we either execute the queue immediately if we know there is more work or fall back to polling
			setTimeout(() => queueWorker(true), hasMoreEntriesSince ? 0 : 1000);
		} catch (e) {
			// https://linear.app/opral/issue/LIXDK-102/re-visit-simplifying-the-change-queue-implementation

			console.error(
				"change queue failed (will remain so until rework of change queue): ",
				e,
			);
		}
	}

	queueWorker();

	async function settled() {
		await pending;
	}

	const lix = {
		db,
		settled,
		currentAuthor: {
			get: () => currentAuthor,
			// async setter for future proofing
			set: async (author: string) => {
				currentAuthor = author;
			},
		},
		toBlob: async () => {
			await settled();
			return new Blob([contentFromDatabase(args.database)]);
		},
		plugins,
		close: async () => {
			args.database.close();
			await db.destroy();
		},
		createDiscussion: (args: { changeIds?: string[]; body: string }) => {
			if (currentAuthor === undefined) {
				throw new Error("current author not set");
			}
			return createDiscussion({
				...args,
				db,
				currentAuthor,
			});
		},
		addComment: (args: { parentCommentId: string; body: string }) => {
			if (!currentAuthor) {
				throw new Error("current author not set");
			}
			return addComment({ ...args, db, currentAuthor });
		},
		createBranch: (
			name: string,
			{ branchId }: { branchId: string | undefined } = { branchId: undefined },
		) =>
			createBranch({
				db,
				name: name,
				branchId,
			}),
		switchBranch: ({ branchId, name }: { branchId?: string; name?: string }) =>
			switchBranch({
				db,
				lix,
				plugins: plugins,
				branchId: branchId,
				name: name,
			}),
	};

	return lix;
}

// // TODO register on behalf of apps or leave it up to every app?
// //      - if every apps registers, components can be lazy loaded
// async function registerDiffComponents(plugins: LixPlugin[]) {
// 	for (const plugin of plugins) {
// 		for (const type in plugin.diffComponent) {
// 			const component = plugin.diffComponent[type]?.()
// 			const named = "lix-plugin-" + plugin.key + "-diff-" + type
// 			if (customElements.get(name) === undefined) {
// 				// @ts-ignore
// 				customElements.define(name, component)
// 			}
// 		}
// 	}
// }
