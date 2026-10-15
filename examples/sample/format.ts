// Overloads: the signatures and the implementation are one function node.
export function formatPrice(cents: number): string;
export function formatPrice(cents: number, currency: string): string;
export function formatPrice(cents: number, currency = "USD"): string {
  return `${currency} ${toFixed2(cents / 100)}`;
}

function toFixed2(n: number): string {
  return n.toFixed(2);
}

// Nested function declaration. formatPrice is attributed to the innermost
// function (buildReceipt>renderLine), not to buildReceipt as well; passing
// renderLine to .map() is a "ref" edge from buildReceipt.
export function buildReceipt(lines: number[]): string {
  function renderLine(cents: number): string {
    return formatPrice(cents);
  }
  return lines.map(renderLine).join("\n");
}

// Duplicate names inside one function: ids are disambiguated by line.
export function pickFormatter(compact: boolean): (n: number) => string {
  if (compact) {
    const fmt = (n: number) => toFixed2(n);
    return fmt;
  }
  const fmt = (n: number) => formatPrice(n);
  return fmt;
}
