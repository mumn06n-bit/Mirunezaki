import { useEffect, useState } from "react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  MapContainer,
  TileLayer,
  Marker,
} from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";

import PageLayout from "@/components/PageLayout";

import "./map.css";

// 地図上のセンサ位置 ※ここは固定
const sensors = [
  {
    id: "DO01",
    latitude: 38.357483,
    longitude: 141.4206,
    type: "do",
  },

  {
    id: "DO02",
    latitude: 38.352,
    longitude: 141.412,
    type: "do",
  },

  {
    id: "DO03",
    latitude: 38.347083,
    longitude: 141.410017,
    type: "do",
  },

  {
    id: "塩分",
    latitude: 38.356,
    longitude: 141.412,
    type: "salinity",
  },
];

// APIから取得するデータ
type SensorPosition = {
  latitude: number | null;
  longitude: number | null;
  latitudeDMS: string | null;
  longitudeDMS: string | null;
};

type SensorData = {
  datetime: string;

  waterTemp: number | null;
  outsideTemp: number | null;
  salinity: number | null;

  oxygen1: number | null;
  oxygen2: number | null;
  oxygen3: number | null;

  positions: {
    salinity: SensorPosition;
    DO01: SensorPosition;
    DO02: SensorPosition;
    DO03: SensorPosition;
  };
};

export default function MapPage() {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  // 選択中のセンサ
  const initialSensor =
    location.state?.selectedSensor ??
    "DO01";

  const [
    selectedSensor,
    setSelectedSensor,
  ] = useState(
    initialSensor
  );

  // APIデータ
  const [
    sensorData,
    setSensorData,
  ] = useState<
    SensorData | null
  >(null);

  // ==================================================
  // API取得
  useEffect(() => {
    const fetchSensorData =
      async () => {
        try {
          const response =
            await fetch(
              "/api/sensors"
            );

          if (!response.ok) {
            throw new Error(
              `API Error: ${response.status}`
            );
          }

          const data:
            SensorData[] =
            await response.json();

          if (
            data.length === 0
          ) {
            console.log(
              "センサデータがありません"
            );

            return;
          }

          // 最新データ
          const latest =
            data[
            data.length - 1
            ];

          console.log(
            "最新センサデータ:",
            latest
          );

          setSensorData(
            latest
          );
        } catch (error) {
          console.error(
            "センサデータの取得に失敗しました:",
            error
          );
        }
      };

    fetchSensorData();
  }, []);

  // DOセンサ選択
  const handleSensorSelect =
    (sensorId: string) => {
      // 塩分は選択不可
      if (
        sensorId === "塩分"
      ) {
        return;
      }

      setSelectedSensor(
        sensorId
      );
    };

  // OKボタン
  const handleOk = () => {
    navigate(
      "/settings",
      {
        state: {
          selectedSensor:
            selectedSensor,
        },
      }
    );
  };

  // DOセンサアイコン
  const createDoIcon =
    (sensorId: string) => {
      const isSelected =
        sensorId ===
        selectedSensor;

      return L.divIcon({
        className:
          "sensor-marker-wrapper",

        html: `
          <div class="sensor-marker ${isSelected
            ? "selected"
            : ""
          }">
            ${sensorId}
          </div>
        `,

        iconSize: [60, 36],

        iconAnchor: [
          30,
          18,
        ],
      });
    };

  // 塩分センサアイコン
  const createSalinityIcon =
    () => {
      return L.divIcon({
        className:
          "salinity-marker-wrapper",

        html: `
          <div class="salinity-marker">
            塩分
          </div>
        `,

        iconSize: [60, 36],

        iconAnchor: [
          30,
          18,
        ],
      });
    };

  // センサ位置表示
  const renderPosition =
    (
      sensorId:
        | "DO01"
        | "DO02"
        | "DO03"
        | "salinity"
    ) => {
      if (!sensorData) {
        return (
          <>
            <span>
              緯度：取得中...
            </span>

            <span>
              経度：取得中...
            </span>
          </>
        );
      }

      const position =
        sensorData
          .positions[
        sensorId
        ];

      if (
        !position ||
        !position.latitudeDMS ||
        !position.longitudeDMS
      ) {
        return (
          <>
            <span>
              緯度：取得できません
            </span>

            <span>
              経度：取得できません
            </span>
          </>
        );
      }

      return (
        <>
          <span>
            緯度：
            {position.latitudeDMS}
          </span>

          <span>
            経度：
            {position.longitudeDMS}
          </span>
        </>
      );
    };

  // 画面
  return (
    <PageLayout
      title="地図"
      showBackButton={true}
    >
      <div className="map-page">

        {/* 地図 */}

        <div className="map-area">

          <MapContainer
            center={[
              sensors[0].latitude,
              sensors[0].longitude,
            ]}
            zoom={14}

            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            zoomControl={false}

            maxBounds={[
              [
                38.342,
                141.41,
              ],
              [
                38.362,
                141.425,
              ],
            ]}

            maxBoundsViscosity={1.0}

            className="sensor-map"
          >

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {sensors.map(
              (sensor) => (
                <Marker
                  key={
                    sensor.id
                  }

                  position={[
                    sensor.latitude,
                    sensor.longitude,
                  ]}

                  icon={
                    sensor.type ===
                      "salinity"
                      ? createSalinityIcon()
                      : createDoIcon(
                        sensor.id
                      )
                  }

                  eventHandlers={{
                    click: () =>
                      handleSensorSelect(
                        sensor.id
                      ),
                  }}
                />
              )
            )}
          </MapContainer>
        </div>

        {/* 選択中 */}

        <div className="selected-sensor">
          選択中：
          <strong>
            {selectedSensor}
          </strong>
        </div>

        {/* OK */}

        <div className="map-ok-button-area">
          <button
            className="map-ok-button"
            onClick={handleOk}
          >
            OK
          </button>
        </div>

        {/* センサ位置 */}

        <div className="sensor-location-list">

          {/* DO01 */}
          <div className="sensor-location">
            <strong>
              DO01
            </strong>
            {renderPosition(
              "DO01"
            )}
          </div>

          {/* DO02 */}
          <div className="sensor-location">
            <strong>
              DO02
            </strong>
            {renderPosition(
              "DO02"
            )}
          </div>

          {/* DO03 */}
          <div className="sensor-location">
            <strong>
              DO03
            </strong>
            {renderPosition(
              "DO03"
            )}
          </div>

          {/* 塩分 */}
          <div className="sensor-location">
            <strong>
              塩分
            </strong>
            {renderPosition(
              "salinity"
            )}

          </div>

          {/* データ取得日時 */}
          <div className="sensor-data-time">
            <strong>
              データ取得日時：
            </strong>
            {sensorData
              ? sensorData.datetime.replace("T", " ")
              : "取得中..."}
          </div>

        </div>

      </div>
    </PageLayout>
  );
}