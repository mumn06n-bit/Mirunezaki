import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import "./CompareScatter.css";
import { getSensorUnit } from "./compareData";
import type { CompareSettings, SensorKey } from "./compareData";
import { fetchSensorData } from "@/services/sensorData";

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

// センサーの数値項目を表す型
type SensorField = Exclude<keyof SensorData, "datetime">;

// 溶存酸素の有効範囲を判定する
const isValidOxygen = (value: number | null): value is number =>
    value !== null && value >= 0 && value <= 15;

type ScatterPoint = [number, number];

type ScatterSeries = {
    type: "scatter";
    name: string;
    data: ScatterPoint[];
    symbolSize: number;
    itemStyle: {
        color: string;
    };
};

type CorrelationAxes = {
    x: SensorKey;
    y: SensorKey;
};

type AxisRange = {
    min?: number;
    max?: number;
    interval?: number;
};

export default function CompareScatter({
    settings,
}: CompareScatterProps) {
    const [sensorData, setSensorData] = useState<
        Record<number, SensorData[]>
    >({});

    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    // センサーの並び順
    const sensorPriority: SensorKey[] = [
        "air",
        "water",
        "salt",
        "oxygen",
    ];

    // APIからデータを取得
    useEffect(() => {
        let cancelled = false;

        if (settings.periods.length === 0) {
            setSensorData({});
            setHasError(false);
            setIsLoading(false);

            return () => {
                cancelled = true;
            };
        }

        setIsLoading(true);
        setHasError(false);

        const fetchData = async () => {
            try {
                // 全期間のデータを一度取得
                const allData = await fetchSensorData();

                const results: Record<number, SensorData[]> = {};

                // 選択した期間ごとにデータを抽出
                for (const period of settings.periods) {
                    const year = String(period.year);
                    const month = String(period.month).padStart(2, "0");
                    const day = String(period.day).padStart(2, "0");

                    const targetDate = `${year}-${month}-${day}`;
                    const targetMonth = `${year}-${month}`;

                    results[period.id] = allData.filter((record) => {
                        if (settings.graphPeriod === "day") {
                            return record.datetime.slice(0, 10) === targetDate;
                        }

                        if (settings.graphPeriod === "month") {
                            return record.datetime.slice(0, 7) === targetMonth;
                        }

                        return record.datetime.slice(0, 4) === year;
                    });
                }

                if (!cancelled) {
                    setSensorData(results);
                    setHasError(false);
                }
            } catch (error) {
                console.error("相関図のセンサーデータ取得エラー:", error);

                if (!cancelled) {
                    setSensorData({});
                    setHasError(true);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            cancelled = true;
        };
    }, [settings.graphPeriod, settings.periods]);

    // 相関図のX軸・Y軸に使用するセンサーを取得
    const getCorrelationAxes = (): CorrelationAxes | null => {
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
    // DOセンサーは期間ごとの選択内容を使用
    const getSensorField = (
        sensor: SensorKey,
        period: CompareSettings["periods"][number]
    ): SensorField => {
        switch (sensor) {
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

    // DOセンサーの表示名
    const DO_NAMES: Record<
        "oxygen1" | "oxygen2" | "oxygen3",
        string
    > = {
        oxygen1: "DO1",
        oxygen2: "DO2",
        oxygen3: "DO3",
    };

    // 選択した期間の表示名
    const getPeriodText = (
        period: CompareSettings["periods"][number]
    ) => {
        let dateText = "";

        switch (settings.graphPeriod) {
            case "year":
                dateText = `${period.year}`;
                break;

            case "month":
                dateText = `${period.year}/${String(
                    period.month
                ).padStart(2, "0")}`;
                break;

            case "day":
                dateText = `${period.year}/${String(
                    period.month
                ).padStart(2, "0")}/${String(
                    period.day
                ).padStart(2, "0")}`;
                break;
        }

        // 相関図で溶存酸素を使う場合はDO番号も表示
        if (settings.correlationSensors.includes("oxygen")) {
            const oxygenSensor =
                period.oxygenSensor ?? "oxygen1";

            return `${dateText}/${DO_NAMES[oxygenSensor]}`;
        }

        return dateText;
    };

    // 数値の平均を求める
    const getAverage = (
        values: (number | null)[],
        isOxygen = false
    ): number | null => {
        const validValues = values.filter(
            (value): value is number =>
                typeof value === "number" &&
                Number.isFinite(value) &&
                (!isOxygen || isValidOxygen(value))
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

            // 溶存酸素は0～15のデータだけで平均を計算
            oxygen1: getAverage(
                records.map((item) => item.oxygen1),
                true
            ),

            oxygen2: getAverage(
                records.map((item) => item.oxygen2),
                true
            ),

            oxygen3: getAverage(
                records.map((item) => item.oxygen3),
                true
            ),
        };
    };

    // 日ごとの平均データを作る
    const createDailyAverageData = (
        data: SensorData[]
    ): SensorData[] => {
        const dailyData: SensorData[] = [];

        for (let day = 1; day <= 31; day++) {
            const targetDay = String(day).padStart(2, "0");

            const records = data.filter((item) =>
                item.datetime.includes(`-${targetDay}T`)
            );

            if (records.length === 0) {
                continue;
            }

            dailyData.push(
                createAverageRecord(targetDay, records)
            );
        }

        return dailyData;
    };

    // 月ごとの平均データを作る
    const createMonthlyAverageData = (
        data: SensorData[]
    ): SensorData[] => {
        const monthlyData: SensorData[] = [];

        for (let month = 1; month <= 12; month++) {
            const targetMonth = String(month).padStart(2, "0");

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

    // 相関図に描画するデータを作成
    const createCorrelationSeries = (
        axes: CorrelationAxes
    ): ScatterSeries[] => {
        return settings.periods.map((period) => {
            const xField = getSensorField(
                axes.x,
                period
            );

            const yField = getSensorField(
                axes.y,
                period
            );

            let periodData = sensorData[period.id] ?? [];

            /*
             * 日：30分ごとのデータを使用
             *
             * 月：1日ごとの平均を使用
             *
             * 年：1か月ごとの平均を使用
             */

            if (settings.graphPeriod === "month") {
                periodData =
                    createDailyAverageData(periodData);
            } else if (settings.graphPeriod === "year") {
                periodData =
                    createMonthlyAverageData(periodData);
            }

            const data: ScatterPoint[] = periodData
                .map((record) => {
                    const x = record[xField];
                    const y = record[yField];

                    if (
                        typeof x !== "number" ||
                        !Number.isFinite(x) ||
                        typeof y !== "number" ||
                        !Number.isFinite(y)
                    ) {
                        return null;
                    }

                    // 溶存酸素がX軸なら有効範囲を確認
                    if (
                        axes.x === "oxygen" &&
                        !isValidOxygen(x)
                    ) {
                        return null;
                    }

                    // 溶存酸素がY軸なら有効範囲を確認
                    if (
                        axes.y === "oxygen" &&
                        !isValidOxygen(y)
                    ) {
                        return null;
                    }

                    return [x, y] as ScatterPoint;
                })
                .filter(
                    (point): point is ScatterPoint =>
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
        });
    };

    // 軸の範囲を取得
    const getAxisRange = (
        sensor: SensorKey,
        series: ScatterSeries[],
        axis: "x" | "y"
    ): AxisRange => {
        // 塩分濃度は25～35に固定
        if (sensor === "salt") {
            return {
                min: 25,
                max: 35,
                interval: 1,
            };
        }

        // 溶存酸素は実際のデータに応じて調整
        if (sensor === "oxygen") {
            const values = series.flatMap((item) =>
                item.data.map((point) =>
                    axis === "x" ? point[0] : point[1]
                )
            );

            if (values.length === 0) {
                return {
                    min: 0,
                    max: 15,
                };
            }

            return {
                min: Math.max(0, Math.min(...values) - 1),
                max: Math.min(15, Math.max(...values) + 1),
            };
        }

        return {};
    };

    // 軸の数値表示を設定
    const getAxisLabelFormatter = (
        sensor: SensorKey
    ) => {
        return (value: number) =>
            sensor === "oxygen"
                ? value.toFixed(1)
                : String(value);
    };

    // 相関図のグラフ設定
    const getCorrelationChartOption = (
        axes: CorrelationAxes,
        series: ScatterSeries[]
    ) => {
        return {
            grid: {
                left: 60,
                right: 20,
                top: 30,
                bottom: 60,
            },

            xAxis: {
                type: "value" as const,
                ...getAxisRange(axes.x, series, "x"),

                name: `${getSensorNameByValue(
                    axes.x
                )} [${getSensorUnit(axes.x)}]`,

                nameLocation: "middle" as const,
                nameGap: 25,

                axisLabel: {
                    formatter: getAxisLabelFormatter(axes.x),
                },
            },

            yAxis: {
                type: "value" as const,
                ...getAxisRange(axes.y, series, "y"),

                name: `${getSensorNameByValue(
                    axes.y
                )} [${getSensorUnit(axes.y)}]`,

                nameLocation: "middle" as const,
                nameGap: 35,

                axisLabel: {
                    formatter: getAxisLabelFormatter(axes.y),
                },
            },

            series,
        };
    };

    const axes = getCorrelationAxes();

    if (!settings.correlationMode || !axes) {
        return null;
    }

    // 実際に描画する散布図データを作成
    const series = createCorrelationSeries(axes);

    // すべての期間に描画可能なデータがないか判定
    const hasNoData =
        settings.periods.length > 0 &&
        series.every((item) => item.data.length === 0);

    return (
        <div className="correlation-chart-area">
            {isLoading ? (
                <div className="correlation-chart-message">
                    <div className="compare-spinner" />
                    データを取得中...
                </div>
            ) : hasError ? (
                <div className="correlation-chart-message">
                    データを取得できませんでした
                </div>
            ) : settings.periods.length === 0 ? (
                <div className="correlation-chart-message">
                    比較する期間を選択してください
                </div>
            ) : (
                <div className="correlation-chart-with-overlay">
                    <ReactECharts
                        option={getCorrelationChartOption(
                            axes,
                            series
                        )}
                        notMerge
                        style={{
                            width: "100%",
                            height: "450px",
                        }}
                    />

                    {hasNoData && (
                        <div className="compare-error-overlay">
                            <div className="compare-error-card">
                                <p>データがありません。</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}