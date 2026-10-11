/** Plain-text separator for label and value cells. Hidden in HTML (table cells already separate them), but html-to-text joins adjacent cells with nothing, so this makes the text part read "Label: value". */
export function TextOnlySeparator() {
  return <span style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>: </span>
}
