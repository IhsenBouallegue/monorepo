// import type { DiffReport, LixPlugin } from "@lix-js/sdk"

import papaparse from "papaparse"
// @ts-nocheck

type Cell = { id: string; text: string; column: string }

/**
 * @type {import('@lix-js/sdk').LixPlugin<{
 *  cell: Cell
 * }>}
 */
import { getLowestCommonAncestor, getLeafChange, type Conflict, type LixPlugin } from "@lix-js/sdk"

// await resolveConflict({
// 	lix: lix,
// 	conflict: conflict,
// 	resolveWithChange: changes[0]!,
// });

const primaryKeys = ["country"]

function getId(row: any) {
	const primaryKeyList = primaryKeys.map((key) => row[key]).filter(Boolean)
	if (primaryKeyList.length < primaryKeys.length) {
		return undefined
	}
	return `${primaryKeyList.join("__")}-`
}

const plugin: LixPlugin = {
	key: "csv",
	glob: "*.csv",

	getId,

	detectConflicts: async ({ sourceLix, targetLix, leafChangesOnlyInSource }) => {
		console.log({ sourceLix, targetLix, leafChangesOnlyInSource })
		const result: Conflict[] = []

		for (const change of leafChangesOnlyInSource) {
			const lowestCommonAncestor = await getLowestCommonAncestor({
				sourceChange: change,
				sourceLix,
				targetLix,
			})

			if (lowestCommonAncestor === undefined) {
				// no common parent, no conflict. must be an insert
				continue
			}

			const leafChangeInTarget = await getLeafChange({
				change: lowestCommonAncestor,
				lix: targetLix,
			})

			if (lowestCommonAncestor.id === leafChangeInTarget.id) {
				// no conflict. the lowest common ancestor is
				// the leaf change in the target. aka, no changes
				// in target have been made that could conflict with the source
				continue
			}

			const hasDiff = JSON.stringify(change.value) !== JSON.stringify(leafChangeInTarget.value)
			if (hasDiff === false) {
				continue
			}
			// naive raise any snapshot difference as a conflict for now
			// more sophisticated conflict reporting can be incrementally added
			result.push({
				change_id: leafChangeInTarget.id,
				conflicting_change_id: change.id,
				reason:
					"The snapshots of the change do not match. More sophisticated reasoning will be added later.",
			})
		}

		return result
	},
	// (args: {
	// 	sourceLix: LixReadonly;
	// 	targetLix: LixReadonly;
	// 	/**
	// 	 * Leaf changes that are only in the source lix.
	// 	 *
	// 	 * You can traverse the parents of the leaf changes to find
	// 	 * conflicting changes in the target lix.
	// 	 */
	// 	leafChangesOnlyInSource: Change[];
	// }) => Promise<Conflict[]>;
	// 	file: async ({ current, conflicts, changes }) => {
	// 		// incoming.  fileId
	// 		if (!papaparse) {
	// 			// @ts-expect-error - no types
	// 			papaparse = (await import("http://localhost:5174/papaparse.js")).default
	// 		}
	// 		const currentParsed = current
	// 			? papaparse.parse(new TextDecoder().decode(current), {
	// 					header: true,
	// 			  })
	// 			: undefined
	// 		if (currentParsed === undefined) {
	// 			throw new Error("cannot parse file for merging ")
	// 		}
	// 		const resolved = []
	// 		const unresolved = []
	// 		for (const conflict of conflicts) {
	// 			// @ts-ignore
	// 			const { hasConflict, result } = await plugin.merge.cell(conflict)
	// 			result && resolved.push([result])
	// 			hasConflict && unresolved.push(conflict)
	// 		}
	// 		for (const change of [...changes, ...resolved]) {
	// 			const latestChange = change[0] // only using latest change for simple merge cases
	// 			const [rowId, columnName] = latestChange.value.id.split("-")
	// 			// TODO: handle insert/ delete row
	// 			const existingRow = currentParsed.data.find((row) => row.id === rowId)
	// 			existingRow[columnName] = latestChange.value.text
	// 		}
	// 		const resultBlob = new TextEncoder().encode(
	// 			// @ts-expect-error
	// 			papaparse.unparse(currentParsed)
	// 		)
	// 		return { result: resultBlob, unresolved }
	// 	},
	// 	cell: async ({ current, incoming, base }) => {
	// 		// always raise conflicts resolving column "v" for testing
	// 		if (current[0].value.id.endsWith("-v")) {
	// 			const diff = await plugin.diff.cell({ old: current[0].value, neu: incoming[0].value })
	// 			if (diff.length > 0) {
	// 				console.log({ current, incoming, base })
	// 				return { hasConflict: true }
	// 			}
	// 		}
	// 		let chosen
	// 		// choose latest edit
	// 		if (current[0].created > incoming[0].created) {
	// 			chosen = current[0]
	// 		} else {
	// 			chosen = incoming[0]
	// 		}
	// 		return { result: chosen }
	// 	},

	applyChanges: async ({ changes, file, lix }) => {
		const parsed = papaparse.parse(new TextDecoder().decode(file.data), {
			header: true,
		})

		console.log({ changes, parsed })
		for (const change of changes) {
			if (change.value) {
				const { id, column, text } = change.value as unknown as Cell

				let existingRow = parsed.data.find((row) => getId(row) + column === id)

				// console.log({ id, existingRow, change, parsed, column })

				// create the row if it doesn't exist
				if (!existingRow) {
					existingRow = {}
					parsed.data.push(existingRow)
				}
				// @ts-ignore
				existingRow[column] = text
				if (!parsed.meta.fields.includes(column)) {
					parsed.meta.fields.push(column)
				}
			} else {
				if (!change.parent_id) {
					throw new Error(
						"Expected a previous change to exist if a value is undefined (a deletion)"
					)
				}
				// TODO possibility to avoid querying the parent change?
				const parent = await lix.db
					.selectFrom("change")
					.selectAll()
					.where("change.id", "=", change.parent_id)
					.executeTakeFirstOrThrow()
					.catch((e) => {
						console.error(e, change)
						throw e
					})

				const { id, column } = parent.value as unknown as Cell

				let existingRowIndex = parsed.data.findIndex((row) => getId(row) + column === id)
				const existingRow = parsed.data[existingRowIndex]

				if (existingRow) {
					existingRow[column] = ""

					// if the row is empty after deleting the cell, remove it
					// @ts-ignore
					if ((Object.values(existingRow) as any).every((cell: string) => cell === "")) {
						parsed.data.splice(existingRowIndex, 1)
					}
				}
			}
		}

		console.log({ parsed })
		const csv = papaparse.unparse(parsed as any)

		return {
			fileData: new TextEncoder().encode(csv),
		}
	},

	diff: {
		file: async ({ old, neu }) => {
			/** @type {import("@lix-js/sdk").DiffReport[]} */
			const result = []

			const oldParsed = old
				? papaparse.parse(new TextDecoder().decode(old.data), {
						header: true,
				  })
				: undefined

			const oldById =
				oldParsed?.data.reduce((agg: any, row) => {
					const rowId = getId(row)
					if (!rowId) {
						return agg
					}
					agg[rowId] = row
					return agg
				}, {}) || {}

			const newParsed = neu
				? papaparse.parse(new TextDecoder().decode(neu.data), {
						header: true,
				  })
				: undefined

			// TODO: hnadle row deletions, file deletions
			if (newParsed) {
				for (const row of newParsed.data.values()) {
					const rowId = getId(row)
					if (!rowId) {
						continue
					}

					const oldRow = oldById[rowId]
					if (oldById[rowId]) {
						oldById[rowId].visited = true
					}

					// TODO: handle column deletions
					for (const column in row) {
						const id = rowId + column

						const diff = await plugin.diff.cell({
							old: oldRow
								? {
										id,
										column,
										text: oldRow[column],
								  }
								: undefined,
							neu: {
								id,
								column,
								text: row[column],
							},
						})

						if (diff.length > 0) {
							result.push(...diff)
						}
					}
				}
			}

			for (const oldRow of oldParsed?.data ?? []) {
				if (!oldRow.visited) {
					console.log({ oldRow }, "removed")
					for (const column in oldRow) {
						const id = getId(oldRow) + column

						const diff = await plugin.diff.cell({
							old: {
								id,
								column,
								text: oldRow[column],
							},
							neu: undefined,
						})

						if (diff.length > 0) {
							result.push(...diff)
						}
					}
				}
			}

			return result
		},

		// @ts-ignore --  TODO: handle return cases for operation independent
		cell: async ({ old, neu }) => {
			if (old?.text === neu?.text) {
				return []
			} else {
				return [
					{
						type: "cell",
						operation: old && neu ? "update" : old ? "delete" : "create",
						old,
						neu,
					},
				]
			}
		},
	},

	diffComponent: {
		// TODO replace async init by bundling static imports
		// @ts-ignore -- return as html element
		cell: async () => {
			/**
			 * @type {import("lit")}
			 */
			const lit = await import(
				// @ts-expect-error - no types
				"http://localhost:5174/lit-all.js"
			)

			const { diffWords } = await import(
				// @ts-expect-error - no types
				"http://localhost:5174/diff.js"
			)

			return class extends lit.LitElement {
				static properties = {
					old: { type: Object },
					neu: { type: Object },
					show: { type: String },
				}

				old
				neu
				show

				// TODO lix css variables for colors
				addedColor = "green"
				removedColor = "red"

				render() {
					console.log("rerender")
					if (this.old === undefined || this.neu === undefined) {
						return lit.html`<span>${this.old?.text ?? this.neu?.text}</span>`
					}

					const diff = diffWords(this.old.text, this.neu.text)

					return lit.html`
              <span>
                ${diff.map((part) => {
									if (this.show === "neu" && part.removed) {
										return lit.nothing
									} else if (this.show === "old" && part.added) {
										return lit.nothing
									}
									const color = part.added
										? this.addedColor
										: part.removed
										? this.removedColor
										: "black"
									return lit.html`
                    <span style="color: ${color}">${part.value}</span>
                  `
								})}
              </span>
            `
				}
			}
		},
	},
}

export default plugin
