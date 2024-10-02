import { selectBundleNested, type InlangProject } from "@inlang/sdk2"
import type { CliStep } from "../utils.js"
import path from "node:path"
import { compile } from "~/compiler/compile.js"
import { writeOutput } from "~/services/file-handling/write-output.js"
import fs from "node:fs"

export const runCompiler: CliStep<
	{
		project: InlangProject
		outdir: string
		fs: typeof fs.promises
	},
	unknown
> = async (ctx) => {
	const absoluteOutdir = path.resolve(process.cwd(), ctx.outdir)
	const bundles = await selectBundleNested(ctx.project.db).execute()
	const settings = await ctx.project.settings.get()

	const output = await compile({
		bundles,
		settings,
	})

	await writeOutput(absoluteOutdir, output, ctx.fs)
	return { ...ctx, bundles }
}
