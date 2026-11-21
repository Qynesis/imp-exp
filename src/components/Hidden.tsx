/** Stands in for a figure this person's role may not see. */
export function Hidden({ what = 'buying prices' }: { what?: string }) {
  return <span className="hidden-fig" title={`Your role cannot see ${what}. Ask the owner.`} aria-label={`Hidden: ${what}`}>•••</span>
}
