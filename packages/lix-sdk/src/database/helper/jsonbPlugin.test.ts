import { Kysely, SelectAllNode, sql } from "kysely";
import { createDialect, createInMemoryDatabase } from "sqlite-wasm-kysely";
import { test, expect } from "vitest";
import { JsonbPlugin } from "./jsonbPlugin.js";

test("parsing and serializing of jsonb should work", async () => {
	type MockSchema = {
		foo: {
			id: string;
			data_json: Record<string, any>;
		};
	};
	const database = await createInMemoryDatabase({
		readOnly: false,
	});

	database.exec(`
    CREATE TABLE foo (
      id TEXT PRIMARY KEY,
      data_json BLOB NOT NULL
    ) strict;  
  `);

	const db = new Kysely<MockSchema>({
		dialect: createDialect({
			database,
		}),
		plugins: [new JsonbPlugin({ database,
			jsonBPostfix: "_json"
		 })],
	});

	const foo = await db
		.insertInto("foo")
		.values({
			id: "mock",
			data_json: {
				data: "baz",
			},
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(foo).toEqual({
		id: "mock",
		data_json: {
			data: "baz",
		},
	});

	const fooQuery2 = await db.selectFrom("foo").selectAll().executeTakeFirst();
	expect(fooQuery2).toEqual({
		id: "mock",
		data_json: {
			data: "baz",
		},
	});
});

test("upserts should be handled", async () => {
	type MockSchema = {
		foo: {
			id: string;
			data_json: Record<string, any>;
		};
	};
	const database = await createInMemoryDatabase({
		readOnly: false,
	});

	database.exec(`
    CREATE TABLE foo (
      id TEXT PRIMARY KEY,
      data_json BLOB NOT NULL
    ) strict;  
  `);

	const db = new Kysely<MockSchema>({
		dialect: createDialect({
			database,
		}),
		plugins: [
			new JsonbPlugin({
				database,
				jsonBPostfix: '_json'
			}),
		],
	});

	const foo = await db
		.insertInto("foo")
		.values({
			id: "mock",
			data_json: {
				bar: "baz",
			},
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(foo).toEqual({
		id: "mock",
		data_json: {
			bar: "baz",
		},
	});

	const updatedFoo = {
		id: "mock",
		data_json: {
			bar: "baz",
			baz: "qux",
		},
	};

	const updatedFooResult = await db
		.insertInto("foo")
		.values(updatedFoo)
		.returningAll()
		.onConflict((oc) => oc.column("id").doUpdateSet(updatedFoo))
		.executeTakeFirstOrThrow();

	expect(updatedFooResult).toEqual(updatedFoo);
});

// this is what whe avoid using the column names
test.skip("storing json as text is supposed to fail to avoid heuristics if the json should be stored as blob or text", async () => {
	type MockSchema = {
		foo: {
			id: string;
			data_json: Record<string, any>;
		};
	};
	const database = await createInMemoryDatabase({
		readOnly: false,
	});

	database.exec(`
    CREATE TABLE foo (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL
    ) strict;  
  `);

	const db = new Kysely<MockSchema>({
		dialect: createDialect({
			database,
		}),
		plugins: [new JsonbPlugin({ database,
			jsonBPostfix: '_json'
		 })],
	});

	expect(() =>
		db
			.insertInto("foo")
			.values({
				id: "mock",
				data_json: {
					bar: "baz",
				},
			})
			.returningAll()
			.executeTakeFirstOrThrow(),
	).rejects.toThrowErrorMatchingInlineSnapshot(
		`[SQLite3Error: SQLITE_CONSTRAINT_DATATYPE: sqlite3 result code 3091: cannot store BLOB value in TEXT column foo.data]`,
	);
});

test("should not parse columns specified as nonJsonB", async () => {
	type MockSchema = {
		foo: {
			id: string;
			data: Record<string, any>;
		};
	};
	const database = await createInMemoryDatabase({
		readOnly: false,
	});

	database.exec(`
    CREATE TABLE foo (
      id TEXT PRIMARY KEY,
      data BLOB NOT NULL
    ) strict;  
  `);

	const db = new Kysely<MockSchema>({
		dialect: createDialect({
			database,
		}),
		plugins: [
			new JsonbPlugin({
				database,
				jsonBPostfix: '_json'
			}),
		],
	});

	const encodedJson = new TextEncoder().encode(
		JSON.stringify({
			data: "baz",
		}),
	);

	// foo insert - return type
	const foo = await db
		.insertInto("foo")
		.values({
			id: "mock",
			data: encodedJson,
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(foo).toEqual({
		id: "mock",
		data: encodedJson,
	});

	// foo select all
	const fooQuery2 = await db.selectFrom("foo").selectAll().executeTakeFirst();
	expect(fooQuery2).toEqual({
		id: "mock",
		data: encodedJson,
	});


	const results = await db
		.selectFrom('foo')
		.selectAll()
		.select((eb) => [
			sql.raw<Record<string, any>>('json(data)').as('data'),
		])
		.execute();
		

	// foo - table name with alias test
	const aliasTableNameQuery = await db
		.selectFrom("foo as test")
		.selectAll()
		.executeTakeFirst();
	expect(aliasTableNameQuery).toEqual({
		id: "mock",
		data: encodedJson,
	});

	// quering a non json colum as json column using aliase
	const aliasColumnName = await db
		.selectFrom("foo")
		.select("id")
		.select("data as test_json")
		.executeTakeFirst();
	expect(aliasColumnName).toEqual({
		id: "mock",
		test_json: {
			data: "baz",
		},
	});
});
