import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageLayout from "@/components/PageLayout";
import type { HelpStep } from "@/components/HelpOverlay";
import "./SettingPage.css";

// 設定ページのヘルプ内容
const helpSteps: HelpStep[] = [
  {
    target: "do-sensor",
    title: "DOセンサの選択",
    description: "使用する溶存酸素センサ（DO01～DO03）を選択できます。",
  },
  {
    target: "map-select",
    title: "地図選択",
    description: "地図から溶存酸素センサの位置を選択できます。",
  },
  {
    target: "optimum-values",
    title: "適正値設定",
    description: "水温・塩分濃度・溶存酸素の適正値を設定できます。",
  },
  {
    target: "save-setting",
    title: "設定の保存",
    description: "設定した内容を保存できます。",
  },
];

export default function SettingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  /*現在選択されている値を保存*/
  const [doSensor, setDoSensor] = useState("DO01");
  const [temperature, setTemperature] = useState("20.0");
  const [salinity, setSalinity] = useState("30");
  const [oxygen, setOxygen] = useState("6");

  /*ページを開いたとき、localStorageから読み込む*/
  useEffect(() => {
    const savedDosensor = localStorage.getItem("doSensor");
    const savedTemperature = localStorage.getItem("temperature");
    const savedSalinity = localStorage.getItem("salinity");
    const savedOxygen = localStorage.getItem("oxygen");
    if (savedDosensor) {
      setDoSensor(savedDosensor);
    }
    if (savedTemperature) {
      setTemperature(savedTemperature);
    }
    if (savedSalinity) {
      setSalinity(savedSalinity);
    }
    if (savedOxygen) {
      setOxygen(savedOxygen);
    }
    // 地図から戻ってきた場合
    if (location.state?.selectedSensor) {
      setDoSensor(location.state.selectedSensor);

      // 選択したセンサを保存
      localStorage.setItem(
        "doSensor",
        location.state.selectedSensor
      );
    }
  }, []);

  /* 保存ボタン*/
  const handleSave = () => {
    localStorage.setItem("doSensor", doSensor);
    localStorage.setItem("temperature", temperature);
    localStorage.setItem("salinity", salinity);
    localStorage.setItem("oxygen", oxygen);
    alert("設定を保存しました");
  };


  return (
    <PageLayout title="設定" className="setting-page" helpSteps={helpSteps}>
      <div className="setting-page-container">
        {/* DOセンサ */}
        <div className="setting-row">
          <label>DOセンサ</label>

          <div className="do-sensor-setting">
            <select
              data-help-target="do-sensor"
              value={doSensor}
              onChange={(e) => setDoSensor(e.target.value)}
            >
              <option>DO01</option>
              <option>DO02</option>
              <option>DO03</option>
            </select>

            <button
              className="map-select-button"
              data-help-target="map-select"
              onClick={() =>
                navigate("/sensor-map", {
                  state: {
                    selectedSensor: doSensor,
                  },
                })
              }
            >
              地図選択
            </button>
          </div>
        </div>

        {/* ★ここに横線を追加 */}
        <hr className="setting-divider" />

        {/* 適正値設定 */}
        <h2 className="setting-title">適正値設定</h2>

        <div data-help-target="optimum-values">
          {/* 水温 */}
          <div className="setting-row">
            <label>水温</label>
            <select
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            >
              {/* 選択肢数指定 */}
              {Array.from({ length: 41 }, (_, i) => {
                // 0.5刻みで 10.0℃から30.0℃までの値を生成(小数点第一位まで表示)
                const value = (10 + i * 0.5).toFixed(1);
                return (
                  <option key={value} value={value}>
                    {value}℃
                  </option>
                );
              })}
            </select>
          </div>

          {/* 塩分濃度 */}
          <div className="setting-row">
            <label>塩分濃度</label>
            <select
              value={salinity}
              onChange={(e) => setSalinity(e.target.value)}
            >
              {Array.from({ length: 16 }, (_, i) => {
                const value = 25 + i;
                return (
                  <option key={value} value={value}>
                    {value}‰
                  </option>
                );
              })}
            </select>
          </div>

          {/* 溶存酸素 */}
          <div className="setting-row">
            <label>溶存酸素</label>
            <select
              value={oxygen}
              onChange={(e) => setOxygen(e.target.value)}
            >
              {Array.from({ length: 31 }, (_, i) => {
                // 0.1刻みで 4.0mg/Lから7.0mg/Lまでの値を生成(小数点第一位まで表示)
                const value = (4.0 + i * 0.1).toFixed(1);
                return (
                  <option key={value} value={value}>
                    {value}mg/L
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* 保存ボタン */}
        <div className="save-button-area" data-help-target="save-setting">
          <button
            className="save-button"
            onClick={handleSave}
          >
            保存
          </button>
        </div>

      </div>
    </PageLayout>
  );
}