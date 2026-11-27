import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import PageLayout from "@/components/PageLayout";
import {
  fetchLatestSensorPositions,
  type LatestSensorPositions,
} from "@/services/sensorData";

import "./map.css";

type PositionSensorId = "DO01" | "DO02" | "DO03" | "salinity";

// センサの識別情報
// 座標はここでは保持せず、取得した位置情報を使用する
const sensors: {
  id: string;
  positionKey: PositionSensorId;
  type: "do" | "salinity";
}[] = [
  {
    id: "DO01",
    positionKey: "DO01",
    type: "do",
  },
  {
    id: "DO02",
    positionKey: "DO02",
    type: "do",
  },
  {
    id: "DO03",
    positionKey: "DO03",
    type: "do",
  },
  {
    id: "塩分",
    positionKey: "salinity",
    type: "salinity",
  },
];

const sensorLabels: Record<PositionSensorId, string> = {
  DO01: "DO01",
  DO02: "DO02",
  DO03: "DO03",
  salinity: "塩分",
};

export default function MapPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedSensor, setSelectedSensor] = useState<string>(
    location.state?.selectedSensor ?? "DO01"
  );

  const [positionData, setPositionData] =
    useState<LatestSensorPositions | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const loadPositions = async () => {
      try {
        setLoading(true);

        const result = await fetchLatestSensorPositions();

        if (ignore) return;

        setPositionData(result);

        console.log("取得した最新位置情報:", result.positions);
        console.log("位置情報の取得日時:", result.positionDatetimes);
      } catch (error) {
        console.error("位置情報の取得に失敗しました:", error);

        if (!ignore) {
          setPositionData(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadPositions();

    return () => {
      ignore = true;
    };
  }, []);

  const handleSensorSelect = (sensorId: string) => {
    if (sensorId === "塩分") return;
    setSelectedSensor(sensorId);
  };

  const handleOk = () => {
    navigate("/settings", {
      state: { selectedSensor },
    });
  };

  const createDoIcon = (sensorId: string) => {
    const isSelected = sensorId === selectedSensor;

    return L.divIcon({
      className: "sensor-marker-wrapper",
      html: `<div class="sensor-marker ${
        isSelected ? "selected" : ""
      }">${sensorId}</div>`,
      iconSize: [60, 36],
      iconAnchor: [30, 18],
    });
  };

  const createSalinityIcon = () =>
    L.divIcon({
      className: "salinity-marker-wrapper",
      html: '<div class="salinity-marker">塩分</div>',
      iconSize: [60, 36],
      iconAnchor: [30, 18],
    });

  // センサの位置情報を取得
  const getSensorPosition = (sensorId: PositionSensorId) => {
    const position = positionData?.positions[sensorId];

    if (
      !position ||
      position.latitude === null ||
      position.longitude === null ||
      !Number.isFinite(position.latitude) ||
      !Number.isFinite(position.longitude)
    ) {
      return null;
    }

    return {
      latitude: position.latitude,
      longitude: position.longitude,
    };
  };

  const renderPosition = (sensorId: PositionSensorId) => {
    const position = positionData?.positions[sensorId];

    if (loading) {
      return (
        <>
          <span>緯度：取得中...</span>
          <span>経度：取得中...</span>
        </>
      );
    }

    if (
      !position ||
      position.latitudeDMS === null ||
      position.longitudeDMS === null
    ) {
      return (
        <>
          <span>緯度：取得できません</span>
          <span>経度：取得できません</span>
        </>
      );
    }

    return (
      <>
        <span>緯度：{position.latitudeDMS}</span>
        <span>経度：{position.longitudeDMS}</span>
      </>
    );
  };

  return (
    <PageLayout title="地図" showBackButton={true}>
      <div className="map-page">
        <div className="map-area">
          <MapContainer
            center={[38.350484, 141.4206]}
            zoom={14}
            minZoom={10}
            maxZoom={18}
            scrollWheelZoom={true}
            doubleClickZoom={true}
            touchZoom={true}
            zoomControl={true}
            maxBounds={[
              [38.1, 141.0],
              [38.6, 141.7],
            ]}
            maxBoundsViscosity={1.0}
            className="sensor-map"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {sensors.map((sensor) => {
              const position = getSensorPosition(sensor.positionKey);

              // 位置情報が取得できない場合はマーカーを表示しない
              if (!position) return null;

              return (
                <Marker
                  key={sensor.id}
                  position={[
                    position.latitude,
                    position.longitude,
                  ]}
                  zIndexOffset={sensor.type === "do" ? 1000 : 0}
                  icon={
                    sensor.type === "salinity"
                      ? createSalinityIcon()
                      : createDoIcon(sensor.id)
                  }
                  eventHandlers={{
                    click: () => handleSensorSelect(sensor.id),
                  }}
                />
              );
            })}
          </MapContainer>
        </div>

        <div className="selected-sensor">
          選択中：<strong>{selectedSensor}</strong>
        </div>

        <div className="map-ok-button-area">
          <button className="map-ok-button" onClick={handleOk}>
            OK
          </button>
        </div>

        <div className="sensor-location-list">
          {(
            ["DO01", "DO02", "DO03", "salinity"] as PositionSensorId[]
          ).map((sensorId) => (
            <div className="sensor-location" key={sensorId}>
              <strong>{sensorLabels[sensorId]}</strong>
              {renderPosition(sensorId)}
            </div>
          ))}

          <div className="sensor-data-time">
            <strong>位置情報の取得日時：</strong>
            {loading
              ? "取得中..."
              : positionData?.datetime
                ? positionData.datetime.replace("T", " ")
                : "取得できません"}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
