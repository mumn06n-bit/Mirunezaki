import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import {
  getSensorUnit,
  type CompareSettings,
} from "@/pages/ComparePage/compareData";
import "./CompareChart.css";

type SensorData = {
  datetime: string;
  waterTemp: number | null;
  outsideTemp: number | null;
  salinity: number | null;
  oxygen1: number | null;
  oxygen2: number | null;
  oxygen3: number | null;
};

// センサーの数値項目を表す型
type SensorField = Exclude<keyof SensorData, "datetime">;

// センサー値の平均を計算する
const getAverage = (
  records: SensorData[],
  sensorField: SensorField
) => {
  const values = records
    .map((record) => record[sensorField])
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const createLineSettings = (
  period: CompareSettings["periods"][number],
  symbolSize: number
) => ({
  type: "line" as const,
  smooth: true,
  symbol: "circle",
  symbolSize,
  connectNulls: false,
  color: period.color,
  itemStyle: { color: period.color },
});

// 指定した時刻のセンサーデータを取得する
const getRecordByTime = (
  records: SensorData[],
  time: string
) =>
  records.find((item) =>
    item.datetime.includes(`T${time}:`)
  );

// 指定した日または月に一致するデータを抽出する
const getRecordsByDate = (
  records: SensorData[],
  datePart: string,
  mode: "day" | "month"
) =>
  records.filter((item) =>
    mode === "day"
      ? item.datetime.includes(`-${datePart}T`)
      : item.datetime.includes(`-${datePart}-`)
  );

export default function CompareChart({
  settings,
}: {
  settings: CompareSettings;
}) {
  const { sensorType, graphPeriod, periods } = settings;
  const unit = getSensorUnit(sensorType);

const getSensorField = (
  period: CompareSettings["periods"][number]
): SensorField => {
  switch (sensorType) {
    case "air":
      return "outsideTemp";
    case "water":
      return "waterTemp";
    case "salt":
      return "salinity";
    case "oxygen":
      return period.oxygenSensor ?? "oxygen1";
  }
};

  const [sensorData, setSensorData] = useState<
    Record<number, SensorData[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  // 日付指定のとき、選択された各日の実データを取得
  useEffect(() => {
    const getDateQuery = (
      period: CompareSettings["periods"][number]
    ) => {
      const year = period.year;
      const month = String(period.month).padStart(2, "0");
      const day = String(period.day).padStart(2, "0");

      if (graphPeriod === "day") {
        return `${year}-${month}-${day}`;
      } else if (graphPeriod === "month") {
        return `${year}-${month}`;
      } else {
        return String(year);
      }
    };
    if (periods.length === 0) {
      setSensorData({});
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const fetchData = async () => {
      const results: Record<number, SensorData[]> = {};

      try {
        await Promise.all(
          periods.map(async (period) => {
            const date = getDateQuery(period);
            const response = await fetch(`/api/sensors?date=${date}`);

            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }

            const data: SensorData[] = await response.json();
            results[period.id] = data;
          })
        );

        setSensorData(results);
      } catch (error) {
        console.error("センサーデータ取得エラー:", error);
        setSensorData({});
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [graphPeriod, periods]);

  let series: NonNullable<EChartsOption["series"]>;
  const labels =
    graphPeriod === "month"
      ? Array.from({ length: 31 }, (_, i) => `${i + 1}`)
      : graphPeriod === "year"
        ? Array.from({ length: 12 }, (_, i) => `${i + 1}`)
        : Array.from({ length: 48 }, (_, i) => {
          const hour = Math.floor(i / 2);
          const minute = i % 2 === 0 ? "00" : "30";
          return `${String(hour).padStart(2, "0")}:${minute}`;
        });

  if (graphPeriod === "month") {
    // 月選択
    series = periods.map((period) => {
      const periodData = sensorData[period.id] ?? [];

      return {
        ...createLineSettings(period, 8),

        data: labels.map((day) => {
          const targetDay = String(day).padStart(2, "0");

          const records = getRecordsByDate(
            periodData,
            targetDay,
            "day"
          );

          return getAverage(records, getSensorField(period));
        }),
      };
    });
  } else if (graphPeriod === "year") {
    // 年選択
    // 1月～12月
    series = periods.map((period) => {
      const periodData = sensorData[period.id] ?? [];

      return {
        ...createLineSettings(period, 8),

        data: labels.map((month) => {
          const targetMonth = String(month).padStart(2, "0");

          // その月のデータだけ取得
          const records = getRecordsByDate(
            periodData,
            targetMonth,
            "month"
          );

          // センサーの値だけ取り出す
          return getAverage(records, getSensorField(period));
        }),
      };
    });
  } else {
    // 日選択：00:00～23:30の48点
    series = periods.map((period) => {
      const periodData = sensorData[period.id] ?? [];

      return {
        ...createLineSettings(period, 5),

        data: labels.map((time) => {
          const record = getRecordByTime(periodData, time);

          return record
            ? record[getSensorField(period)]
            : null;
        }),
      };
    });
  }

  const xUnit =
    graphPeriod === "month"
      ? "日"
      : graphPeriod === "year"
        ? "月"
        : "時間";

  const option = {
    grid: {
      left: 35,
      right: 20,
      top: 35,
      bottom: 70,
    },

    xAxis: {
      type: "category",
      data: labels,
      name: `[${xUnit}]`,
      nameLocation: "end",
      nameGap: 15,

      axisLabel: {
        interval: window.innerWidth <= 768 ? 0 : "auto",
      },
    },

    yAxis: {
      type: "value",
      name: `[${unit}]`,
      nameLocation: "end",
      nameGap: 15,
    },

    series,
  };

  return (
    <div className="compare-chart-scroll">
      <div className="compare-chart">
        {isLoading ? null : (
          <ReactECharts
            option={option}
            notMerge={true}
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        )}
      </div>
    </div>
  );
}
