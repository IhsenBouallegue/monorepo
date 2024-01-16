import { createHandle, type HandleOptions } from "./hooks/handle.js"
import { createReroute } from "./hooks/reroute.js"
import { base } from "$app/paths"
import { page } from "$app/stores"
import { get } from "svelte/store"
import type { PathTranslations } from "./path-translations/types.js"
import type { Paraglide } from "./runtime.js"
import { getTranslatedPath } from "./path-translations/getTranslatedPath.js"
import { serializeRoute } from "./utils/serialize-path.js"
import { translatePath } from "./path-translations/translatePath.js"

export type I18nOptions<T extends string> = {
	/**
	 * The default locale to use if no locale is specified.
	 * By default the sourceLanguageTag from the Paraglide runtime is used.
	 *
	 * @default runtime.sourceLanguageTag
	 */
	defaultLocale?: T

	/**
	 * Translations for pathnames.
	 */
	pathnames?: PathTranslations<T>

	/**
	 * A predicate that determines whether a page should be excluded from translation.
	 * If it returns `true`, any links to it will not be translated,
	 * and no alternate links will be added while on it.
	 *
	 * @default () => false
	 * @param path The path to check (eg /base/api)
	 * @returns `true` if the path should be excluded from translation
	 *
	 * @example
	 * ```ts
	 * exclude: (path) => path.startsWith("/base/api")
	 * ```
	 */
	exclude?: (path: string) => boolean

	/**
	 * Whether to prefix the language tag to the path even if it's the default language.
	 * @default "always"
	 */
	prefixDefaultLanguage?: "always" | "never"
}

export function createI18n<T extends string>(runtime: Paraglide<T>, options: I18nOptions<T>) {
	const translations = options.pathnames ?? {}

	const exclude = options.exclude ?? (() => false)

	// We don't want the translations to be mutable
	Object.freeze(translations)

	return {
		/**
		 * The configuration that was used to create this i18n instance.
		 */
		config: {
			runtime,
			translations,
			exclude,
		},

		/**
		 * Returns a `reroute` hook that applies the path translations to the paths
		 */
		reroute: () => createReroute(runtime, translations),

		/**
		 * Returns a `handle` hook that set's the correct `lang` attribute
		 * on the `html` element
		 */
		handle: (options: HandleOptions) => createHandle(runtime, options),

		/**
		 * Takes in a URL and returns the language that should be used for it.
		 * @param url
		 * @returns
		 */
		getLanguageFromUrl(url: URL): T {
			const absoluteBase = new URL(base, get(page).url).pathname
			const pathWithLanguage = url.pathname.slice(absoluteBase.length)
			const [lang, ...parts] = pathWithLanguage.split("/").filter(Boolean)

			if (runtime.isAvailableLanguageTag(lang)) return lang
			return runtime.sourceLanguageTag
		},

		/**
		 * Takes in a route and returns a translated version of it.
		 * This is useful for use in `goto` statements and `redirect` calls.
		 *
		 * @param canonicalPath The path to translate (eg _/base/about_)
		 * @param lang The language to translate to
		 * @returns The translated path (eg _/base/de/ueber-uns_)
		 *
		 * @example
		 * ```ts
		 * redirect(i18n.resolveRoute("/base/about", "de"))
		 * ```
		 */
		resolveRoute(path: string, lang: T) {
			const absoluteBase = new URL(base, get(page).url).pathname
			if (options.exclude?.(path)) return path

			const canonicalPath = path.slice(absoluteBase.length)
			const translatedPath = getTranslatedPath(canonicalPath, lang, translations)

			return serializeRoute({
				path: translatedPath,
				lang,
				base,
				defaultLanguageTag: runtime.sourceLanguageTag,
				includeLanguage: true,
				dataSuffix: undefined,
			})
		},

		/**
		 * Takes in a path in one language and returns it's translated version in another language.
		 * This is useful for use in `alternate` links.
		 *
		 * @param translatedPath The path to translate (eg _/base/de/ueber-uns_)
		 * @param targetLanguage The language to translate to (eg _en_)
		 * @returns The translated path (eg _/base/en/about_)
		 *
		 * @example
		 * ```ts
		 * <link
		 *   rel="alternate"
		 *   href={i18n.translatePath($page.url.pathname, languageTag(), "en")}
		 *   hreflang="en"
		 * >
		 * ```
		 */
		translatePath(translatedPath: string, targetLanguage: T) {
			const absoluteBase = new URL(base, get(page).url).pathname

			return translatePath(translatedPath, targetLanguage, translations, {
				base: absoluteBase,
				availableLanguageTags: runtime.availableLanguageTags,
				defaultLanguageTag: runtime.sourceLanguageTag,
			})
		},
	}
}

export type I18n<T extends string> = ReturnType<typeof createI18n<T>>
