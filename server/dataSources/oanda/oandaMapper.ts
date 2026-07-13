export function toOandaInstrument(symbol: string): string {
  return symbol.replace("/", "_").toUpperCase();
}

export function fromOandaInstrument(instrument: string): string {
  return instrument.replace("_", "/").toUpperCase();
}
