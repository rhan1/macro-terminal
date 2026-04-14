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

const TAB_KEYS = ["overview", "rates", "inflation", "growth", "labor", "risk", "realestate"];

const TAB_COMPONENTS = {
  overview: Overview,
  rates: Rates,
  inflation: Inflation,
  growth: Growth,
  labor: Labor,
  risk: Risk,
  realestate: RealEstate,
};

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    function handleKey(e) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveTab(TAB_KEYS[num - 1]);
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
      <Header />
      <TabBar active={activeTab} onSelect={setActiveTab} />
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
        }}
      >
        <ActiveComponent />
      </main>
      <Footer />
    </div>
  );
}
