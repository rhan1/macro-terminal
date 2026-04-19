import { useState, useEffect } from "react";
import Header from "./components/Header";
import TabBar, { TABS } from "./components/TabBar";
import Footer from "./components/Footer";
import CommandPalette from "./components/CommandPalette";
import Overview from "./tabs/Overview";
import Rates from "./tabs/Rates";
import Inflation from "./tabs/Inflation";
import Growth from "./tabs/Growth";
import Shipments from "./tabs/Shipments";
import Labor from "./tabs/Labor";
import Global from "./tabs/Global";
import Risk from "./tabs/Risk";
import RealEstate from "./tabs/RealEstate";
import Sentiment from "./tabs/Sentiment";
import Capitol from "./tabs/Capitol";
import IPO from "./tabs/IPO";
import Auctions from "./tabs/Auctions";
import AlternativeIndex from "./tabs/AlternativeIndex";

const TAB_KEYS = ["overview", "rates", "inflation", "growth", "labor", "risk", "sentiment", "shipments", "capitol", "global", "realestate", "auctions", "ipo", "altindex"];

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
          <ActiveComponent />
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
