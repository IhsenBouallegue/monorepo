/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { test, expect, vi } from "vitest";
import { openLixInMemory } from "../open/openLixInMemory.js";
import { newLixFile } from "../newLix.js";
import type { NewChange } from "../database/schema.js";
import type { LixPlugin } from "../plugin.js";
import { SelectedChangeNotInConflictError } from "./errors.js";
import { resolveConflictBySelecting } from "./resolve-conflict-by-selecting.js";

test("it should resolve a conflict by applying the change and marking the conflict as resolved with the applied change", async () => {
	const mockChanges: NewChange[] = [
		{
			operation: "create",
			plugin_key: "plugin1",
			type: "mock",
			file_id: "mock",
			value: {
				id: "value1",
			},
		},
		{
			operation: "create",
			plugin_key: "plugin1",
			file_id: "mock",
			type: "mock",
			value: {
				id: "value2",
			},
		},
	];

	const mockPlugin: LixPlugin = {
		key: "plugin1",
		glob: "*",
		applyChanges: vi.fn().mockResolvedValue({
			fileData: new TextEncoder().encode(JSON.stringify(mockChanges[0]?.value)),
		}),
		diff: {
			file: vi.fn(),
		},
	};

	const lix = await openLixInMemory({
		blob: await newLixFile(),
		providePlugins: [mockPlugin],
	});

	const currentBranch = await lix.db
		.selectFrom("branch")
		.where("active", "=", true)
		.selectAll()
		.executeTakeFirst();

	await lix.db
		.insertInto("file")
		.values({ id: "mock", path: "mock", data: new Uint8Array() })
		.execute();

	const changes = await lix.db
		.insertInto("change")
		.values(mockChanges)
		.returningAll()
		.execute();

	await lix.db
		.insertInto("branch_change")
		.values([
			{
				seq: 1,
				branch_id: currentBranch!.id,
				change_id: changes[0]!.id,
			},
		])
		.execute();

	const conflict = await lix.db
		.insertInto("conflict")
		.values({
			change_id: changes[0]!.id,
			conflicting_change_id: changes[1]!.id,
			branch_id: currentBranch!.id,
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	await resolveConflictBySelecting({
		lix: lix,
		conflict: conflict,
		selectChangeId: changes[0]!.id,
	});

	const resolvedConflict = await lix.db
		.selectFrom("conflict")
		.selectAll()
		.where("change_id", "=", conflict.change_id)
		.where("conflicting_change_id", "=", conflict.conflicting_change_id)
		.executeTakeFirstOrThrow();

	const fileAfterResolve = await lix.db
		.selectFrom("file")
		.selectAll()
		.where("id", "=", changes[0]!.file_id)
		.executeTakeFirstOrThrow();

	const parsed = JSON.parse(new TextDecoder().decode(fileAfterResolve.data));

	expect(parsed).toStrictEqual(mockChanges[0]!.value);
	expect(resolvedConflict.resolved_with_change_id).toBe(changes[0]!.id);
});

test("it should throw if the change id does not belong to the conflict", async () => {
	await expect(
		resolveConflictBySelecting({
			lix: {} as any,
			conflict: {
				branch_id: "my-branch",
				change_id: "change1",
				conflicting_change_id: "change2",
				meta: undefined,
				reason: undefined,
				resolved_with_change_id: undefined,
			},
			selectChangeId: "change3",
		}),
	).rejects.toThrowError(SelectedChangeNotInConflictError);
});
