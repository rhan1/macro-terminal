export default function Footer() {
  return (
    <footer
      style={{
        textAlign: "center",
        padding: "8px 16px",
        borderTop: "1px solid var(--color-term-border)",
        color: "var(--color-term-dim)",
        fontSize: 9,
        letterSpacing: "0.05em",
        flexShrink: 0,
      }}
    >
      DATA: FRED API &middot; LIVE MACRO DASHBOARD
    </footer>
  );
}
