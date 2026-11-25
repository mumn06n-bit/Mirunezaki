
import { useState, useEffect, useMemo } from "react";
import {
    fetchSensorData,
    makeGraphPoints,
    type SensorRecord,
} from "@/services/sensorData";
import ReactECharts from "echarts-for-react";
import type { ECharts } from "echarts";
import "./GraphChart.css";

// 横軸ラベルを作る関数
// 日モード：時刻
// 月モード：上段に月、下段に日
// 年モード：上段に年、下段に月
const makeXAxisFormatter = (
    xData: string[],
    graphMode: string,
    startIndex: number
) => {
    const firstShown = xData[startIndex];

    return (value: string) => {
        if (graphMode === "日") {
            const time = value.slice(11, 16);

            // 30分のデータはラベルを表示しない
            return time.endsWith(":30") ? "" : time;
        }

        const month = Number(value.slice(5, 7));

        if (graphMode === "月") {
            const day = Number(value.slice(8, 10));
            //const year = value.slice(0, 4);

            const isFirstDay = day === 1 || value === firstShown;
            const isNewYear =
                month === 1 ||
                value === firstShown;

            const top = isFirstDay
                ? isNewYear
                    ? `${month}月`
                    : `${month}月`
                : " ";

            return `${top}\n${day}`;
        }

        const top =
            month === 1 || value === firstShown
                ? `${value.slice(0, 4)}年`
                : " ";

        return `${top}\n${month}`;
    };
};

// 日モード：日付用の横軸ラベル
// 表示範囲の先頭と、日付が変わる位置にだけ表示する
const makeDateFormatter = (
    xData: string[],
    startIndex: number
) => {
    const firstShown = xData[startIndex];

    return (value: string) => {
        const date = value.slice(0, 10);
        const index = xData.indexOf(value);

        const previousDate =
            index > 0
                ? xData[index - 1].slice(0, 10)
                : "";

        if (value === firstShown || date !== previousDate) {
            const [, month, day] = date.split("-");

            return `${Number(month)}/${Number(day)}`;
        }

        return "";
    };
};

const NO_RECORDS: SensorRecord[] = [];

const MODE_CONFIG: Record<
    string,
    { kind: string; xUnit: string; pc: number; sp: number }
> = {
    日: { kind: "all", xUnit: "時", pc: 24, sp: 9 },
    月: { kind: "all", xUnit: "日", pc: 31, sp: 9 },
    年: { kind: "all", xUnit: "月", pc: 12, sp: 12 },
};

type Props = {
    graphType: string;
    graphMode: string;
    unit: string;
    targetValue: number | null;
};

export default function GraphChart({
    graphType,
    graphMode,
    unit,
    targetValue,
}: Props) {
    const [fetched, setFetched] = useState<{
        kind: string;
        records: SensorRecord[];
    }>({
        kind: "",
        records: NO_RECORDS,
    });

    const [currentDate] = useState(() => new Date());
    const [errorKind, setErrorKind] = useState<string | null>(null);

    const { kind, xUnit, pc, sp } = MODE_CONFIG[graphMode];

    // 溶存酸素の3種類を共通判定
    const isOxygenGraph = graphType.startsWith("溶存酸素");

    // データ取得
    useEffect(() => {
        let ignore = false;

        fetchSensorData()
            .then((data) => {
                if (!ignore) {
                    setFetched({ kind, records: data });
                    setErrorKind(null);
                }
            })
            .catch((e) => {
                console.error("グラフ用データの取得に失敗しました:", e);

                if (!ignore) {
                    setErrorKind(kind);
                }
            });

        return () => {
            ignore = true;
        };
    }, [kind]);

    const error = errorKind === kind;
    const isLoading = fetched.kind !== kind;
    const records = isLoading ? NO_RECORDS : fetched.records;

    // グラフ用データを作成
    const graphData = useMemo(
        () => makeGraphPoints(records, graphType, graphMode, currentDate),
        [records, graphType, graphMode, currentDate]
    );

    // 溶存酸素：0～15 mg/Lの範囲外を除外
    const displayGraphData = useMemo(() => {
        if (!isOxygenGraph) {
            return graphData;
        }

        return graphData.map((d) => ({
            ...d,
            value:
                d.value !== null && d.value >= 0 && d.value <= 15
                    ? d.value
                    : null,
        }));
    }, [graphData, isOxygenGraph]);

    // 横軸データ
    const xData = useMemo(
        () => graphData.map((d) => d.label),
        [graphData]
    );

    // スマホなど画面が狭いか
    const isNarrow = window.innerWidth < 600;

    // 1画面に表示する点の数（PC / スマホ）
    const visibleCount = isNarrow ? sp : pc;

    // 最後に有効なデータがある位置
    const lastDataIndex = displayGraphData.findLastIndex(
        (d) => d.value !== null
    );

    // 値が1つもない場合
    const hasNoData = lastDataIndex === -1;

    // 最初に表示する範囲の右端
    const initialEndIndex =
        lastDataIndex >= 0
            ? lastDataIndex
            : xData.length - 1;

    // 最初に表示する範囲の左端
    const initialStartIndex = Math.max(
        0,
        initialEndIndex - (visibleCount - 1)
    );

    // ユーザーが変更した表示範囲
    const [range, setRange] = useState<{
        graphMode: string;
        initialStartIndex: number;
        initialEndIndex: number;
        start: number;
        end: number;
    } | null>(null);

    // 保存した範囲が現在の表示条件と一致しているか
    const isRangeCurrent =
        range !== null &&
        range.graphMode === graphMode &&
        range.initialStartIndex === initialStartIndex &&
        range.initialEndIndex === initialEndIndex;

    // 現在表示している範囲
    const rangeStart = isRangeCurrent
        ? range.start
        : initialStartIndex;

    const rangeEnd = isRangeCurrent
        ? range.end
        : initialEndIndex;

    // 24時間分のデータ件数（30分刻み）
    const MOVE_COUNT = 48;

    // 移動できる最後の左端位置
    const maxStartIndex = Math.max(
        0,
        lastDataIndex - (visibleCount - 1)
    );

    // 前後24時間へ移動
    const moveRange = (direction: -1 | 1) => {
        const nextStart = Math.max(
            0,
            Math.min(
                maxStartIndex,
                rangeStart + MOVE_COUNT * direction
            )
        );

        const nextEnd = Math.min(
            lastDataIndex,
            nextStart + visibleCount - 1
        );

        setRange({
            graphMode,
            initialStartIndex,
            initialEndIndex,
            start: nextStart,
            end: nextEnd,
        });
    };

    // 有効な溶存酸素データだけを取り出す
    const oxygenValues = displayGraphData
        .map((d) => d.value)
        .filter(
            (value): value is number =>
                isOxygenGraph && value !== null
        );

    // 溶存酸素の縦軸を自動計算
    const oxygenMin =
        oxygenValues.length > 0
            ? Math.max(0, Math.min(...oxygenValues) - 1)
            : 0;

    const oxygenMax =
        oxygenValues.length > 0
            ? Math.min(15, Math.max(...oxygenValues) + 1)
            : 15;

    // スクロール時の処理
    const onEvents = useMemo(
        () => ({
            dataZoom: (_: unknown, chart: ECharts) => {
                const [dataZoom] = chart.getOption().dataZoom as {
                    startValue: number;
                    endValue: number;
                }[];

                const startIndex = Number(dataZoom.startValue);
                const endIndex = Number(dataZoom.endValue);

                if (
                    Number.isFinite(startIndex) &&
                    Number.isFinite(endIndex)
                ) {
                    setRange((prev) => {
                        if (
                            prev !== null &&
                            prev.graphMode === graphMode &&
                            prev.initialStartIndex === initialStartIndex &&
                            prev.initialEndIndex === initialEndIndex &&
                            prev.start === startIndex &&
                            prev.end === endIndex
                        ) {
                            return prev;
                        }

                        return {
                            graphMode,
                            initialStartIndex,
                            initialEndIndex,
                            start: startIndex,
                            end: endIndex,
                        };
                    });
                }

                if (graphMode === "日") {
                    chart.setOption({
                        xAxis: [
                            {
                                // xAxis[0]：日付
                                axisLabel: {
                                    formatter: makeDateFormatter(
                                        xData,
                                        startIndex
                                    ),
                                },
                            },
                            {
                                // xAxis[1]：時間
                                axisLabel: {
                                    formatter: makeXAxisFormatter(
                                        xData,
                                        graphMode,
                                        startIndex
                                    ),
                                },
                            },
                        ],
                    });

                    return;
                }

                chart.setOption({
                    xAxis: {
                        axisLabel: {
                            formatter: makeXAxisFormatter(
                                xData,
                                graphMode,
                                startIndex
                            ),
                        },
                    },
                });
            },
        }),
        [
            xData,
            graphMode,
            initialStartIndex,
            initialEndIndex,
        ]
    );

    // グラフ設定
    const option = useMemo(
        () => ({
            grid: {
                left: 30,
                right: 30,
                top: 40,
                bottom: 20,
            },

            xAxis:
                graphMode === "日"
                    ? [
                        // 日付軸：グラフ境界線のすぐ下
                        {
                            type: "category",
                            data: xData,
                            position: "bottom",
                            axisLine: {
                                show: true,
                            },
                            axisTick: {
                                show: false,
                            },
                            axisLabel: {
                                formatter: makeDateFormatter(
                                    xData,
                                    rangeStart
                                ),
                                interval: 0,
                                margin: 8,
                            },
                        },

                        // 時間軸：日付軸より下
                        {
                            type: "category",
                            data: xData,
                            position: "bottom",
                            offset: 15,
                            axisLine: {
                                show: false,
                            },
                            axisTick: {
                                show: false,
                            },
                            axisLabel: {
                                formatter: makeXAxisFormatter(
                                    xData,
                                    graphMode,
                                    rangeStart
                                ),
                                interval: 0,
                                margin: 8,
                            },
                        },
                    ]
                    : {
                        type: "category",
                        data: xData,
                        axisLabel: {
                            formatter: makeXAxisFormatter(
                                xData,
                                graphMode,
                                rangeStart
                            ),
                            interval: 0,
                        },
                    },

            yAxis: {
                type: "value",

                min:
                    graphType === "塩分濃度"
                        ? 25
                        : isOxygenGraph
                            ? oxygenMin
                            : hasNoData
                                ? 0
                                : undefined,

                max:
                    graphType === "塩分濃度"
                        ? 35
                        : isOxygenGraph
                            ? oxygenMax
                            : hasNoData
                                ? 30
                                : undefined,

                interval:
                    graphType === "塩分濃度"
                        ? 1
                        : undefined,

                splitNumber:
                    graphType === "塩分濃度"
                        ? 10
                        : isOxygenGraph
                            ? 6
                            : undefined,

                axisLabel: {
                    formatter: (value: number) =>
                        isOxygenGraph
                            ? value.toFixed(1)
                            : value,
                },

                name: `[${unit}]`,
                nameLocation: "end",
                nameTextStyle: {
                    align: "left",
                },
            },

            series: [
                {
                    type: "line",
                    smooth: true,

                    // 溶存酸素は0～15の範囲内の値だけ表示
                    data: displayGraphData.map((d) => d.value),

                    symbol: "circle",
                    symbolSize: 12,
                    color: "#4A90E2",

                    emphasis: {
                        label: {
                            show: true,
                            position: "top",
                            distance: 10,
                            formatter: (params: any) =>
                                `${params.value}${unit}`,
                            fontSize: 14,
                            fontWeight: "bold",
                            color: "#333",
                        },
                    },

                    markLine:
                        targetValue === null || hasNoData
                            ? undefined
                            : {
                                silent: true,
                                symbol: ["none", "none"],
                                label: {
                                    position: "end",
                                    color: "#2ecc71",
                                    fontWeight: "bold",
                                    formatter: `${targetValue}`,
                                },
                                lineStyle: {
                                    color: "#2ecc71",
                                    type: "solid",
                                    width: 2,
                                },
                                data: [{ yAxis: targetValue }],
                            },
                },
            ],

            dataZoom: [
                {
                    type: "inside",
                    xAxisIndex:
                        graphMode === "日"
                            ? [0, 1]
                            : 0,
                    startValue: rangeStart,
                    endValue: rangeEnd,
                    zoomLock: true,
                    moveOnMouseMove: true,
                    moveOnMouseWheel: false,
                },
            ],

            graphic: [
                // 横軸の一番右に単位を表示
                {
                    type: "text",
                    right: 5,
                    bottom: 15,
                    silent: true,
                    style: {
                        text: `[${xUnit}]`,
                        fill: "#666",
                        fontSize: 12,
                        textAlign: "right",
                        textVerticalAlign: "middle",
                    },
                },

                // データがない場合のメッセージ
                ...(hasNoData && graphMode === "日"
                    ? [
                        {
                            type: "text",
                            left: "center",
                            top: "44%",
                            silent: true,
                            style: {
                                text: "データがありません",
                                fill: "#383838",
                                fontSize: 14,
                            },
                        },
                    ]
                    : []),
            ],
        }),
        [
            displayGraphData,
            xData,
            graphMode,
            xUnit,
            unit,
            targetValue,
            rangeStart,
            rangeEnd,
            hasNoData,
            graphType,
            isOxygenGraph,
            oxygenMin,
            oxygenMax,
        ]
    );

    return (
        <div className="graph-chart">
            {error ? (
                // 取得エラー：データ画面と同じエラーカード
                <div className="graph-error-overlay">
                    <div className="error-message-card">
                        <p>データを取得できませんでした</p>
                    </div>
                </div>
            ) : isLoading ? (
                <div className="graph-message">
                    <div className="graph-spinner" />
                    <p>データを取得中...</p>
                </div>
            ) : (
                <>
                    <div className="graph-chart__plot">
                        <ReactECharts
                            key={graphMode}
                            option={option}
                            notMerge
                            onEvents={onEvents}
                            style={{ width: "100%", height: "100%" }}
                        />
                    </div>

                    {graphMode === "日" && (
                        <div className="graph-chart__navigation">
                            <button
                                type="button"
                                onClick={() => moveRange(-1)}
                                disabled={hasNoData || rangeStart <= 0}
                            >
                                24時間前
                            </button>

                            <button
                                type="button"
                                onClick={() => moveRange(1)}
                                disabled={
                                    hasNoData ||
                                    rangeStart >= maxStartIndex
                                }
                            >
                                24時間後
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
