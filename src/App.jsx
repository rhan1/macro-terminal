import { useState, useEffect } from "react";
import Header from "./components/Header";
import TabBar from "./components/TabBar";
import Footer from "./components/Footer";
import Overview from "./tabs/Overview";
import Rates from "./tabs/Rates";
import Inflation from "./tabs/Inflation";
import Growth from "./tabs/Growth";
import Labor from "./tabs/Labor";
import Risk from "./tabs/Risk";
import RealEstate from "./tabs/RealEstate";
import Sentiment from "./tabs/Sentiment";
import IPO from "./tabs/IPO";
import Auctions from "./tabs/Auctions";
import AlternativeIndex from "./tabs/AlternativeIndex";

const TAB_KEYS = ["overview", "rates", "inflation", "growth", "labor", "risk", "sentiment", "realestate", "ipo", "auctions", "altindex"];

const TAB_COMPONENTS = {
  overview: Overview,
  rates: Rates,
  inflation: Inflation,
  growth: Growth,
  labor: Labor,
  risk: Risk,
  realestate: RealEstate,
  sentiment: Sentiment,
  ipo: IPO,
  auctions: Auctions,
  altindex: AlternativeIndex,
};

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    function handleKey(e) {
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          setActiveTab(TAB_KEYS[num - 1]);
        } else if (num === 0) {
          e.preventDefault();
          setActiveTab("auctions");
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
    </div>
  );
}
