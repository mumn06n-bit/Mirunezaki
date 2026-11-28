import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import GraphChart from "./GraphChart";
import "./GraphPage.css";
import type { HelpStep } from "@/components/HelpOverlay";

// グラフページのヘルプ内容
const helpSteps: HelpStep[] = [
  {
    target: "graph-type",
    title: "データの選択",
    description: "表示したいセンサデータの種類を選択できます。",
  },
  {
    target: "graph-range",
    title: "表示期間の切り替え",
    description: "日・月・年から、グラフの表示期間を切り替えられます。",
  },
  {
    target: "graph-chart",
    title: "グラフの見方",
    description: "選択したデータの変化をグラフで確認できます。グラフをスクロールすることで任意の日時になります。",
  },
];

// データ種類ごとの単位と目標値
const GRAPH_TYPES: Record<
  string,
  { unit: string; target: { key: string; default: number } | null }
> = {
  気温: { unit: "℃", target: null },
  水温: { unit: "℃", target: { key: "temperature", default: 20 } },
  塩分濃度: { unit: "‰", target: { key: "salinity", default: 30 } },
  "溶存酸素(DO01)": {
    unit: "mg/L",
    target: { key: "oxygen", default: 3.5 },
  },
  "溶存酸素(DO02)": {
    unit: "mg/L",
    target: { key: "oxygen", default: 3.5 },
  },
  "溶存酸素(DO03)": {
    unit: "mg/L",
    target: { key: "oxygen", default: 3.5 },
  },
};

const GRAPH_MODES = ["日", "月", "年"];

export default function GraphPage() {
  const [graphType, setGraphType] = useState(() => {
    const savedType = localStorage.getItem("graphType") ?? "水温";

    // 以前の「溶存酸素」はDO01として引き継ぐ
    return savedType === "溶存酸素"
      ? "溶存酸素(DO01)"
      : savedType;
  });

  const [graphMode, setGraphMode] = useState(
    () => localStorage.getItem("graphMode") ?? "月"
  );

  const { unit, target } = GRAPH_TYPES[graphType];
  const targetValue = target
    ? Number(localStorage.getItem(target.key) ?? target.default)
    : null;

  const handleGraphTypeChange = (type: string) => {
    setGraphType(type);
    localStorage.setItem("graphType", type);
  };

  const handleGraphModeChange = (mode: string) => {
    setGraphMode(mode);
    localStorage.setItem("graphMode", mode);
  };

  return (
    <PageLayout title="グラフ" helpSteps={helpSteps}>
      <section className="graph-menu">
        <div className="graph-select-area" data-help-target="graph-type">
          <select
            className="graph-select-button"
            value={graphType}
            onChange={(e) => handleGraphTypeChange(e.target.value)}
          >
            {Object.keys(GRAPH_TYPES).map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="graph-range-area" data-help-target="graph-range">
          {GRAPH_MODES.map((mode) => (
            <button
              key={mode}
              className={`graph-range-button ${
                graphMode === mode ? "active" : ""
              }`}
              onClick={() => handleGraphModeChange(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      <section className="graph-area" data-help-target="graph-chart">
        <GraphChart
          graphType={graphType}
          graphMode={graphMode}
          unit={unit}
          targetValue={targetValue}
        />
      </section>
    </PageLayout>
  );
}
