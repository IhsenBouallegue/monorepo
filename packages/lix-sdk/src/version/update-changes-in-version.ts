import type { Version, Change } from "../database/schema.js";
import type { Lix } from "../lix/open-lix.js";

/**
 * Updates the changes that are part of a version.
 *
 * Creates a new change set under the hood and points
 * the version to the new change set.
 */
export async function updateChangesInVersion(args: {
	lix: Pick<Lix, "db" | "plugin">;
	version: Pick<Version, "id">;
	changes: Change[];
}): Promise<{ version: Version }> {
	const executeInTransaction = async (trx: Lix["db"]) => {
		// not relying on args.version.change_set_id because it might be stale
		const version = await trx
			.selectFrom("version")
			.where("version.id", "=", args.version.id)
			.select("change_set_id")
			.executeTakeFirstOrThrow();
		const newChangeSet = await trx
			.insertInto("change_set")
			.defaultValues()
			.returningAll()
			.executeTakeFirstOrThrow();
		// Copy non-overlapping changes to the new change set
		await trx
			.insertInto("change_set_element")
			.columns(["change_set_id", "change_id"])
			.expression(
				trx
					.selectFrom("change_set_element")
					.innerJoin("change", "change.id", "change_set_element.change_id")
					.where("change_set_element.change_set_id", "=", version.change_set_id)
					.where((eb) =>
						eb.not(
							eb.or(
								args.changes.map((change) =>
									eb.and([
										eb("change.schema_key", "=", change.schema_key),
										eb("change.entity_id", "=", change.entity_id),
										eb("change.file_id", "=", change.file_id),
									]),
								),
							),
						),
					)
					.select([
						(eb) => eb.val(newChangeSet.id).as("change_set_id"),
						"change_set_element.change_id",
					]),
			)
			.execute();

		// Insert the new changes
		await trx
			.insertInto("change_set_element")
			.values(
				args.changes.map((change) => ({
					change_set_id: newChangeSet.id,
					change_id: change.id,
				})),
			)
			.execute();

		return {
			version: await trx
				.updateTable("version")
				.set({
					change_set_id: newChangeSet.id,
				})
				.returningAll()
				.executeTakeFirstOrThrow(),
		};
	};

	if (args.lix.db.isTransaction) {
		return await executeInTransaction(args.lix.db);
	} else {
		return await args.lix.db.transaction().execute(executeInTransaction);
	}

	// await garbageCollectChangeConflicts({ lix: args.lix });
}
