import { useGlobalMarketData } from "../hooks/useGlobalMarketData";
import { useGlobalNews } from "../hooks/useGlobalNews";
import { useGlobalYields } from "../hooks/useGlobalYields";
import GlobalRegimeBanner from "../components/GlobalRegimeBanner";
import WorldPerformanceMap from "../components/WorldPerformanceMap";
import GlobalIndicesGrid from "../components/GlobalIndicesGrid";
import FxMatrix from "../components/FxMatrix";
import CommoditiesRow from "../components/CommoditiesRow";
import SovereignYieldGrid from "../components/SovereignYieldGrid";
import CentralBankTable from "../components/CentralBankTable";
import GlobalNewsTicker from "../components/GlobalNewsTicker";
import worldIndices from "../data/worldIndices.json";

const GREEN = "hsl(142,70%,55%)";
const DIM = "hsl(220,10%,52%)";

function buildIndexDataByCountry(marketData) {
  if (!marketData) return {};
  const byCountry = {};
  for (const idx of worldIndices) {
    const q = marketData[idx.symbol];
    if (!q || q.error) continue;
    const existing = byCountry[idx.countryCode];
    if (existing && Math.abs(existing.changePct ?? 0) >= Math.abs(q.changePct ?? 0)) continue;
    byCountry[idx.countryCode] = {
      symbol: idx.symbol,
      name: idx.name,
      price: q.price,
      changePct: q.changePct,
      flag: idx.flag,
      region: idx.region,
    };
  }
  return byCountry;
}

export default function Global() {
  const { data: marketData } = useGlobalMarketData();
  const { data: newsData } = useGlobalNews();
  const { data: yieldsData } = useGlobalYields();

  const indexByCountry = buildIndexDataByCountry(marketData);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 24, color: GREEN, letterSpacing: "0.08em", fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>
          $ GLOBAL
        </div>
        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
          — World Macro: indices, FX, commodities, yields, news
        </div>
      </div>

      <GlobalRegimeBanner marketData={marketData} />

      <div className="panel" style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
          World Performance Map — today's %
        </div>
        <WorldPerformanceMap indexData={indexByCountry} />
      </div>

      <GlobalIndicesGrid marketData={marketData} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FxMatrix marketData={marketData} />
        <CommoditiesRow marketData={marketData} />
      </div>

      <SovereignYieldGrid yields={yieldsData?.yields} stress={yieldsData?.stress} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <CentralBankTable />
        <GlobalNewsTicker items={newsData?.items} sources={newsData?.sources} errors={newsData?.errors} />
      </div>
    </div>
  );
}
