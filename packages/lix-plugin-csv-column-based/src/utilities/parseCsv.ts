import * as papaparse from "papaparse";

/**
 * Parses the CSV based on the unique column.
 *
 * @returns
 *   The parsed CSV data indexed by the unique column.
 *
 * @example
 *   ```
 *   const data = new TextEncoder().encode("age,name\n23,alice\n56,bob");
 *   const parsed = parseCsv(data, "name");
 *
 *   console.log(parsed); // { "alice": { age: "23", name: "alice"}, "bob": { age: "56", name: "bob"} }
 *   console.log(parsed['bob']) // ["56", "bob"]
 *
 *   ```
 */
export function parseCsv(
	data: ArrayBuffer | undefined,
	uniqueColumn: string,
): [Record<string, Record<string, string>> | undefined, string[]] {
	const parsed = data
		? papaparse.parse(new TextDecoder().decode(data), {
				skipEmptyLines: true,
			})
		: undefined;

	const index: Record<string, Record<string, string>> = {};
	const headerRow = parsed?.data?.[0] as string[];
	if (!headerRow) {
		return [undefined, headerRow];
	}
	const uniqueColumnIndex = headerRow.indexOf(uniqueColumn);
	if (uniqueColumnIndex === undefined) {
		return [undefined, headerRow];
	}
	let isHeaderRow = true;
	for (const row of (parsed?.data as Array<string[]>) ?? []) {
		// don't index the header row
		if (isHeaderRow) {
			isHeaderRow = false;
			continue;
		}
		const uniqueValue = row[uniqueColumnIndex];
		if (uniqueValue) {
			const entity_id = `${uniqueColumn}|${uniqueValue}`;

			for (const [columnI, value] of row.entries()) {
				if (!index[entity_id]) {
					index[entity_id] = {};
				}
				index[entity_id]![headerRow[columnI]!] = value;
			}
		}
	}
	return [index, headerRow];
}