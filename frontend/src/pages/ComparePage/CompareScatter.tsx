import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import "./CompareScatter.css";
import { getSensorUnit } from "./compareData";
import type { CompareSettings, SensorKey } from "./compareData";

type CompareScatterProps = {
  settings: CompareSettings;
};

type SensorData = {
  datetime: string;
  waterTemp: number | null;
  outsideTemp: number | null;
  salinity: number | null;
  oxygen1: number | null;
  oxygen2: number | null;
  oxygen3: number | null;
};

export default function CompareScatter({
  settings,
}: CompareScatterProps) {
  const [sensorData, setSensorData] = useState<
    Record<number, SensorData[]>
  >({});

  // センサーの並び順
  const sensorPriority: SensorKey[] = [
    "air",
    "water",
    "salt",
    "oxygen",
  ];

  // APIからデータを取得
  useEffect(() => {
    if (settings.periods.length === 0) {
      setSensorData({});
      return;
    }

    const fetchData = async () => {
      const results: Record<number, SensorData[]> = {};

      try {
        await Promise.all(
          settings.periods.map(async (period) => {
            let date = "";

            // 日：その日のデータを取得
            if (settings.graphPeriod === "day") {
              date = `${period.year}-${String(period.month).padStart(2, "0")}-${String(period.day).padStart(2, "0")}`;
            } else if (settings.graphPeriod === "month") {
              date = `${period.year}-${String(period.month).padStart(2, "0")}`;
            } else if (settings.graphPeriod === "year") {
              date = String(period.year);
            }

            const response = await fetch(
              `/api/sensors?date=${date}`
            );

            if (!response.ok) {
              throw new Error(
                `API error: ${response.status}`
              );
            }

            const data: SensorData[] =
              await response.json();

            results[period.id] = data;
          })
        );

        setSensorData(results);
      } catch (error) {
        console.error(
          "相関図のセンサーデータ取得エラー:",
          error
        );

        setSensorData({});
      }
    };

    fetchData();
  }, [settings.graphPeriod, settings.periods]);

  // 相関図のX軸・Y軸に使用するセンサーを取得
  const getCorrelationAxes = () => {
    if (!settings.correlationMode) {
      return null;
    }

    const sensors = settings.correlationSensors;

    if (sensors.length !== 2) {
      return null;
    }

    const sortedSensors = [...sensors].sort(
      (a, b) =>
        sensorPriority.indexOf(a) -
        sensorPriority.indexOf(b)
    );

    return {
      x: sortedSensors[0],
      y: sortedSensors[1],
    };
  };

  // センサー名を表示用に変換
  const getSensorNameByValue = (sensor: SensorKey) => {
    const names: Record<SensorKey, string> = {
      air: "気温",
      water: "水温",
      salt: "塩分濃度",
      oxygen: "溶存酸素",
    };

    return names[sensor];
  };

  // センサー名からAPIデータのフィールド名を取得
  const getSensorField = (
    sensor: SensorKey
  ): keyof Omit<SensorData, "datetime"> => {
    switch (sensor) {
      case "air":
        return "outsideTemp";
      case "water":
        return "waterTemp";
      case "salt":
        return "salinity";
      case "oxygen":
        return "oxygen1";
    }
  };

  // 選択した期間の表示名
  const getPeriodText = (period: CompareSettings["periods"][number]) => {
    switch (settings.graphPeriod) {
      case "year":
        return `${period.year}`;

      case "month":
        return `${period.year}/${String(
          period.month
        ).padStart(2, "0")}`;

      case "day":
        return `${period.year}/${String(
          period.month
        ).padStart(2, "0")}/${String(
          period.day
        ).padStart(2, "0")}`;

      default:
        return "";
    }
  };

  // 数値の平均を求める
  const getAverage = (values: (number | null)[]) => {
    const validValues = values.filter(
      (value): value is number => value !== null
    );

    if (validValues.length === 0) {
      return null;
    }

    return (
      validValues.reduce(
        (sum, value) => sum + value,
        0
      ) / validValues.length
    );
  };

  // 指定した期間の平均データを作る
  const createAverageRecord = (
    datetime: string,
    records: SensorData[]
  ): SensorData => {
    return {
      datetime,
      waterTemp: getAverage(
        records.map((item) => item.waterTemp)
      ),
      outsideTemp: getAverage(
        records.map((item) => item.outsideTemp)
      ),
      salinity: getAverage(
        records.map((item) => item.salinity)
      ),
      oxygen1: getAverage(
        records.map((item) => item.oxygen1)
      ),
      oxygen2: getAverage(
        records.map((item) => item.oxygen2)
      ),
      oxygen3: getAverage(
        records.map((item) => item.oxygen3)
      ),
    };
  };

  // 日ごとの平均データを作る
  const createDailyAverageData = (
    data: SensorData[]
  ) => {
    const dailyData: SensorData[] = [];

    for (let day = 1; day <= 31; day++) {
      const targetDay = String(day).padStart(2, "0");

      const records = data.filter((item) =>
        item.datetime.includes(`-${targetDay}T`)
      );

      if (records.length === 0) {
        continue;
      }

      dailyData.push(createAverageRecord(targetDay, records));
    }

    return dailyData;
  };

  // 月ごとの平均データを作る
  const createMonthlyAverageData = (
    data: SensorData[]
  ) => {
    const monthlyData: SensorData[] = [];

    for (let month = 1; month <= 12; month++) {
      const targetMonth = String(month).padStart(
        2,
        "0"
      );

      const records = data.filter((item) =>
        item.datetime.includes(`-${targetMonth}-`)
      );

      if (records.length === 0) {
        continue;
      }

      monthlyData.push(
        createAverageRecord(targetMonth, records)
      );
    }

    return monthlyData;
  };

  // 相関図を作成
  const getCorrelationChartOption = () => {
    const axes = getCorrelationAxes();

    if (!axes) {
      return {};
    }

    const xField = getSensorField(axes.x);
    const yField = getSensorField(axes.y);


    return {
      grid: {
        left: 60,
        right: 20,
        top: 30,
        bottom: 60,

      },

      xAxis: {
        type: "value",
        name: `${getSensorNameByValue(axes.x)} [${getSensorUnit(axes.x)}]`,
        nameLocation: "middle",
        nameGap: 35,
      },

      yAxis: {
        type: "value",
        name: `${getSensorNameByValue(axes.y)} [${getSensorUnit(axes.y)}]`,
        nameLocation: "middle",
        nameGap: 35,
      },

      series: settings.periods.map((period) => {
        let periodData =
          sensorData[period.id] ?? [];

        /*
         * 日
         * → 30分ごとのデータをそのまま使用
         *
         * 月
         * → 1日ごとの平均を使用
         *
         * 年
         * → 1か月ごとの平均を使用
         */
        if (settings.graphPeriod === "month") {
          periodData =
            createDailyAverageData(periodData);
        } else if (settings.graphPeriod === "year") {
          periodData =
            createMonthlyAverageData(periodData);
        }

        const data = periodData
          .map((record) => {
            const x = record[xField];
            const y = record[yField];

            if (x === null || y === null) {
              return null;
            }

            return [x, y];
          })
          .filter(
            (
              point
            ): point is [number, number] =>
              point !== null
          );

        return {
          type: "scatter",
          name: getPeriodText(period),
          data,
          symbolSize: 10,

          itemStyle: {
            color: period.color,
          },
        };
      }),
    };
  };

  const axes = getCorrelationAxes();

  if (!settings.correlationMode || !axes) {
    return null;
  }

  return (
    <div className="correlation-chart-area">
      <ReactECharts
        option={getCorrelationChartOption()}
        style={{
          width: "100%",
          height: "450px",
        }}
      />
    </div>
  );
}