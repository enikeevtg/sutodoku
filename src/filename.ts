/** A portable filename derived from the goal; plan text itself is unchanged. */
export function planBasename(goal: string): string {
  // eslint-disable-next-line no-control-regex -- Control characters are invalid in portable filenames.
  const sanitized = goal.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const encoder = new TextEncoder();
  let prefix = '', bytes = 0;
  for (const character of sanitized) {
    bytes += encoder.encode(character).length;
    if (bytes > 200) break;
    prefix += character;
  }
  const title = prefix.replace(/[. ]+$/, '') || 'suToDoku';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title) ? `suToDoku - ${title}` : title;
}
