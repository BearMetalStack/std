export function escapeHtml(value: string): string {
  const rx = /[<>'"&]/g;
  const seqs = {
    ">": "gt",
    "<": "lt",
    "'": "apos",
    '"': "quot",
    "&": "amp",
  };
  return value.replace(rx, (e) => `&${seqs[e as keyof typeof seqs] ?? ""};`);
}
