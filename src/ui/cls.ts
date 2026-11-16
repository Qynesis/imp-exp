/** Join class names, skipping empty and false values. */
export const cls = (...names: (string | false | null | undefined | 0)[]): string => names.filter(Boolean).join(' ')
