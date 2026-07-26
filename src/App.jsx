import { lazy, Suspense, useState, useEffect } from "react";
import Header from "./components/Header";
import TabBar, { TABS } from "./components/TabBar";
import Footer from "./components/Footer";
import CommandPalette from "./components/CommandPalette";
import Loading from "./components/Loading";

const Overview = lazy(() => import("./tabs/Overview"));
const Rates = lazy(() => import("./tabs/Rates"));
const Inflation = lazy(() => import("./tabs/Inflation"));
const Growth = lazy(() => import("./tabs/Growth"));
const Shipments = lazy(() => import("./tabs/Shipments"));
const Labor = lazy(() => import("./tabs/Labor"));
const Global = lazy(() => import("./tabs/Global"));
const Risk = lazy(() => import("./tabs/Risk"));
const RealEstate = lazy(() => import("./tabs/RealEstate"));
const Sentiment = lazy(() => import("./tabs/Sentiment"));
const Capitol = lazy(() => import("./tabs/Capitol"));
const IPO = lazy(() => import("./tabs/IPO"));
const Auctions = lazy(() => import("./tabs/Auctions"));
const AlternativeIndex = lazy(() => import("./tabs/AlternativeIndex"));
const Economies = lazy(() => import("./tabs/Economies"));

const TAB_KEYS = ["overview", "rates", "inflation", "growth", "labor", "risk", "sentiment", "shipments", "capitol", "global", "economies", "realestate", "auctions", "ipo", "altindex"];

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

const TAB_COMPONENTS = {
  overview: Overview,
  rates: Rates,
  inflation: Inflation,
  growth: Growth,
  shipments: Shipments,
  labor: Labor,
  global: Global,
  economies: Economies,
  risk: Risk,
  sentiment: Sentiment,
  capitol: Capitol,
  realestate: RealEstate,
  ipo: IPO,
  auctions: Auctions,
  altindex: AlternativeIndex,
};

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if (isTypingTarget(e.target)) return;

      if (e.key === "]" && !mod && !e.altKey) {
        e.preventDefault();
        setActiveTab((curr) => {
          const idx = TAB_KEYS.indexOf(curr);
          return TAB_KEYS[(idx + 1) % TAB_KEYS.length];
        });
        return;
      }
      if (e.key === "[" && !mod && !e.altKey) {
        e.preventDefault();
        setActiveTab((curr) => {
          const idx = TAB_KEYS.indexOf(curr);
          return TAB_KEYS[(idx - 1 + TAB_KEYS.length) % TAB_KEYS.length];
        });
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && !mod && !e.altKey) {
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          setActiveTab(TAB_KEYS[num - 1]);
        } else if (num === 0) {
          e.preventDefault();
          setActiveTab(TAB_KEYS[9]);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header />
      <TabBar active={activeTab} onSelect={setActiveTab} />
      <main
        id="main-content"
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: 16,
        }}
      >
        <div className="tab-content" key={activeTab}>
          <Suspense fallback={<Loading />}>
            <ActiveComponent />
          </Suspense>
        </div>
        <Footer />
      </main>
      <CommandPalette
        tabs={TABS}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={setActiveTab}
      />
    </div>
  );
}
