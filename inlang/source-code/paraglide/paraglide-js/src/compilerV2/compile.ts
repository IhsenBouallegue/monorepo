import { compileBundle } from "./compileBundle.js"
import { telemetry } from "../services/telemetry/implementation.js"
import { jsIdentifier } from "../services/codegen/identifier.js"
import { getStackInfo } from "../services/telemetry/stack-detection.js"
import { getPackageJson } from "../services/environment/package.js"
import { createRuntime } from "./runtime.js"
import { createRegistry } from "./registry.js"
import { lookup } from "@inlang/sdk"
import { type BundleNested, type ProjectSettings } from "@inlang/sdk2"
import fs from "node:fs/promises"
import * as prettier from "prettier"
import {
	escapeForDoubleQuoteString,
	escapeForSingleQuoteString,
} from "~/services/codegen/escape.js"
import { isValidJSIdentifier } from "~/services/valid-js-identifier/index.js"

const ignoreDirectory = `# ignore everything because the directory is auto-generated by inlang paraglide-js
# for more info visit https://inlang.com/m/gerre34r/paraglide-js
*
`

export type CompileOptions = {
	bundles: Readonly<BundleNested[]>
	settings: Pick<ProjectSettings, "baseLocale" | "locales">
	projectId: string | undefined
}

const defaultCompileOptions = {
	projectId: undefined,
} satisfies Partial<CompileOptions>

/**
 * A compile function takes a list of messages and project settings and returns
 * a map of file names to file contents.
 *
 * @example
 *   const output = compile({ messages, settings })
 *   console.log(output)
 *   >> { "messages.js": "...", "runtime.js": "..." }
 */
export const compile = async (args: CompileOptions): Promise<Record<string, string>> => {
	const opts = {
		...defaultCompileOptions,
		...args,
	}

	//Maps each language to it's fallback
	//If there is no fallback, it will be undefined
	const fallbackMap = getFallbackMap(opts.settings.locales, opts.settings.baseLocale)

	const resources = opts.bundles.map((bundle) => compileBundle(bundle, fallbackMap))

	const indexFile = [
		"/* eslint-disable */",
		'import { languageTag } from "./runtime.js"',
		opts.settings.locales
			.map((locale) => `import * as ${jsIdentifier(locale)} from "./messages/${locale}.js"`)
			.join("\n"),
		"\n",
		resources.map(({ bundle }) => bundle.code).join("\n\n"),
	].join("\n")

	const output: Record<string, string> = {
		".prettierignore": ignoreDirectory,
		".gitignore": ignoreDirectory,
		"runtime.js": createRuntime(opts.settings),
		"registry.js": createRegistry(),
		"messages.js": indexFile,
	}

	// generate message files
	for (const locale of opts.settings.locales) {
		const filename = `messages/${locale}.js`
		let file = ["/* eslint-disable */", "import * as registry from '../registry.js' "].join("\n")

		for (const resource of resources) {
			// Bundle Aliases
			const aliases = Object.values(resource.bundle.source.alias)

			const compiledMessage = resource.messages[locale]
			if (!compiledMessage) {
				// add fallback
				const fallbackLocale = fallbackMap[locale]
				if (fallbackLocale) {
					file += `\nexport { ${jsIdentifier(resource.bundle.source.id)} } from "./${fallbackLocale}.js"`
					for (const alias of aliases) {
						if (isValidJSIdentifier(alias))
							file += `\nexport { ${alias} } from "./${fallbackLocale}.js"`
						else
							file += `\nexport { "${escapeForDoubleQuoteString(alias)}" } from "./${fallbackLocale}.js"`
					}
				} else {
					file += `\nexport const ${jsIdentifier(resource.bundle.source.id)} = '${escapeForSingleQuoteString(
						resource.bundle.source.id
					)}'`
					for (const alias of aliases) {
						file += `\nexport {${jsIdentifier(resource.bundle.source.id)} as ${jsIdentifier(alias)} }`
					}
				}

				continue
			}

			file += `\n${compiledMessage.code}`
			file += `\nexport { ${jsIdentifier(compiledMessage.source.id)} as ${resource.bundle.source.id} }`
			for (const alias of aliases) {
				file += `\nexport { ${jsIdentifier(compiledMessage.source.id)} as ${jsIdentifier(alias)} }`
			}
		}

		output[filename] = file
	}

	// telemetry
	const pkgJson = await getPackageJson(fs, process.cwd())
	const stack = getStackInfo(pkgJson)
	telemetry.capture(
		{
			event: "PARAGLIDE-JS compile executed",
			properties: { stack },
		},
		opts.projectId
	)

	telemetry.shutdown()
	return await formatFiles(output)
}

async function formatFiles(files: Record<string, string>): Promise<Record<string, string>> {
	const output: Record<string, string> = {}
	const promises: Promise<void>[] = []

	for (const [key, value] of Object.entries(files)) {
		if (!key.endsWith(".js")) {
			output[key] = value
			continue
		}

		promises.push(
			new Promise((resolve, reject) => {
				fmt(value)
					.then((formatted) => {
						output[key] = formatted
						resolve()
					})
					.catch(reject)
			})
		)
	}

	await Promise.all(promises)
	return output
}

async function fmt(js: string): Promise<string> {
	return await prettier.format(js, {
		arrowParens: "always",
		singleQuote: true,
		parser: "babel",
		plugins: ["prettier-plugin-jsdoc"],
	})
}

export function getFallbackMap<T extends string>(
	languageTags: T[],
	sourceLanguageTag: NoInfer<T>
): Record<T, T | undefined> {
	return Object.fromEntries(
		languageTags.map((lang) => {
			const fallbackLanguage = lookup(lang, {
				languageTags: languageTags.filter((t) => t !== lang),
				defaultLanguageTag: sourceLanguageTag,
			})

			if (lang === fallbackLanguage) return [lang, undefined]
			else return [lang, fallbackLanguage]
		})
	) as Record<T, T | undefined>
}
