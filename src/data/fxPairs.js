// Yahoo Finance FX symbols. "BASE/QUOTE" display, Yahoo ticker either
// BASEQUOTE=X or BASE=X (when QUOTE=USD). DXY is ^DXY (index, not a pair).
export const FX_PAIRS = [
  { yahoo: "EURUSD=X", display: "EUR/USD", base: "EUR", quote: "USD", flag: "🇪🇺" },
  { yahoo: "JPY=X",    display: "USD/JPY", base: "USD", quote: "JPY", flag: "🇯🇵" },
  { yahoo: "GBPUSD=X", display: "GBP/USD", base: "GBP", quote: "USD", flag: "🇬🇧" },
  { yahoo: "CAD=X",    display: "USD/CAD", base: "USD", quote: "CAD", flag: "🇨🇦" },
  { yahoo: "CHF=X",    display: "USD/CHF", base: "USD", quote: "CHF", flag: "🇨🇭" },
  { yahoo: "AUDUSD=X", display: "AUD/USD", base: "AUD", quote: "USD", flag: "🇦🇺" },
  { yahoo: "CNH=X",    display: "USD/CNH", base: "USD", quote: "CNH", flag: "🇨🇳" },
  { yahoo: "MXN=X",    display: "USD/MXN", base: "USD", quote: "MXN", flag: "🇲🇽" },
  { yahoo: "^DXY",     display: "DXY",      base: "USD", quote: "BASKET", flag: "💵", isIndex: true },
];
