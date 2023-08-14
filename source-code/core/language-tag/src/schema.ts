import { Type, Static, TSchema } from "@sinclair/typebox"
import { languageTagRegex } from "./registry.js"

/**
 * Follows the IETF BCP 47 language tag schema.
 *
 * Contains only max 2 letter tags for now. Will be extended in the future.
 *
 * @see https://www.ietf.org/rfc/bcp/bcp47.txt
 * @see https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
 */
export type LanguageTag = Static<typeof LanguageTag>
export const LanguageTag = Type.String({ pattern: languageTagRegex })

/**
 * Content for a language tag.
 *
 * The language tag `en` is always required.
 */
export type WithLanguageTags<T> = {
	en: T
	[languageTag: LanguageTag]: T
}
export const WithLanguageTags = <T extends TSchema>(type: T) =>
	Type.Intersect([Type.Object({ en: type }), Type.Record(LanguageTag, type)])
