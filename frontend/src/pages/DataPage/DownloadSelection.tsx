import { useEffect, useState } from "react";
import Papa from "papaparse";
import PageLayout from "@/components/PageLayout";
import type { HelpStep } from "@/components/HelpOverlay";
import { supabase } from "@/services/supabase";
import "./DownloadSelection.css";

const DOWNLOAD_ITEMS = [
  { id: "outsideTemp", label: "気温" },
  { id: "waterTemp", label: "水温" },
  { id: "salinity", label: "塩分濃度" },
  { id: "oxygen1", label: "溶存酸素 DO01" },
  { id: "oxygen2", label: "溶存酸素 DO02" },
  { id: "oxygen3", label: "溶存酸素 DO03" },
] as const;

type DownloadItemId = (typeof DOWNLOAD_ITEMS)[number]["id"];

const DOWNLOAD_PERIODS = [
  { id: "all", label: "全期間" },
  { id: "month", label: "直近1ヶ月" },
  { id: "week", label: "直近1週間" },
  { id: "today", label: "今日" },
] as const;

type DownloadPeriod =
  | (typeof DOWNLOAD_PERIODS)[number]["id"]
  | "custom";

type SensorDatabaseRecord = {
  sensor_id: string | null;
  datetime: string | null;
  water_temp: number | null;
  outside_temp: number | null;
  salinity: number | null;
  do_percent: number | null;
  do_mgl: number | null;
};

const PAGE_SIZE = 1000;

// 日本時間の今日の日付を取得
const getJSTToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

// 今日から指定日数前の日付を取得
const getJSTDaysAgo = (days: number) => {
  const [year, month, day] = getJSTToday().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() - days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

// 今日から指定月数前の日付を取得
const getJSTMonthsAgo = (months: number) => {
  const [year, month, day] = getJSTToday().split("-").map(Number);

  const targetMonth = new Date(
    Date.UTC(year, month - 1 - months, 1)
  );

  const lastDay = new Date(
    Date.UTC(
      targetMonth.getUTCFullYear(),
      targetMonth.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  targetMonth.setUTCDate(Math.min(day, lastDay));

  return [
    targetMonth.getUTCFullYear(),
    String(targetMonth.getUTCMonth() + 1).padStart(2, "0"),
    String(targetMonth.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

// 日付を日本時間の開始時刻に変換
const getJSTStart = (date: string) => {
  return new Date(`${date}T00:00:00+09:00`).toISOString();
};

// 終了日の翌日、日本時間の午前0時に変換
const getJSTEndExclusive = (date: string) => {
  const nextDay = new Date(`${date}T00:00:00+09:00`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  return nextDay.toISOString();
};

// UTCの日時を日本時間（JST）に変換
const formatJST = (datetime: string | null) => {
  if (!datetime) return "";

  const date = new Date(datetime);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });

  const month = date.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
  });

  const day = date.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    day: "2-digit",
  });

  const hour = date.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false,
  });

  const minute = date.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    minute: "2-digit",
  });

  const second = date.toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    second: "2-digit",
  });

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

// CSVの作成
const createCSV = (
  records: SensorDatabaseRecord[],
  selectedItems: DownloadItemId[]
) => {
  const groupedRecords = new Map<
    string,
    {
      outsideTemp: number | null;
      waterTemp: number | null;
      salinity: number | null;
      oxygen1: SensorDatabaseRecord | null;
      oxygen2: SensorDatabaseRecord | null;
      oxygen3: SensorDatabaseRecord | null;
    }
  >();

  for (const record of records) {
    if (!record.datetime) continue;

    const key = record.datetime;

    const group = groupedRecords.get(key) ?? {
      outsideTemp: null,
      waterTemp: null,
      salinity: null,
      oxygen1: null,
      oxygen2: null,
      oxygen3: null,
    };

    if (group.outsideTemp === null && record.outside_temp !== null) {
      group.outsideTemp = record.outside_temp;
    }

    if (group.waterTemp === null && record.water_temp !== null) {
      group.waterTemp = record.water_temp;
    }

    if (group.salinity === null && record.salinity !== null) {
      group.salinity = record.salinity;
    }

    if (record.sensor_id === "do1") {
      group.oxygen1 = record;
    } else if (record.sensor_id === "do2") {
      group.oxygen2 = record;
    } else if (record.sensor_id === "do3") {
      group.oxygen3 = record;
    }

    groupedRecords.set(key, group);
  }

  const headers = ["日時"];

  if (selectedItems.includes("outsideTemp")) {
    headers.push("気温（℃）");
  }

  if (selectedItems.includes("waterTemp")) {
    headers.push("水温（℃）");
  }

  if (selectedItems.includes("salinity")) {
    headers.push("塩分濃度（‰）");
  }

  if (selectedItems.includes("oxygen1")) {
    headers.push("DO01 溶存酸素濃度（mg/L）");
    headers.push("DO01 溶存酸素割合（%）");
  }

  if (selectedItems.includes("oxygen2")) {
    headers.push("DO02 溶存酸素濃度（mg/L）");
    headers.push("DO02 溶存酸素割合（%）");
  }

  if (selectedItems.includes("oxygen3")) {
    headers.push("DO03 溶存酸素濃度（mg/L）");
    headers.push("DO03 溶存酸素割合（%）");
  }

  const csvRows = Array.from(groupedRecords.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([datetime, group]) => {
      const row: (string | number)[] = [formatJST(datetime)];

      if (selectedItems.includes("outsideTemp")) {
        row.push(group.outsideTemp ?? "");
      }

      if (selectedItems.includes("waterTemp")) {
        row.push(group.waterTemp ?? "");
      }

      if (selectedItems.includes("salinity")) {
        row.push(group.salinity ?? "");
      }

      if (selectedItems.includes("oxygen1")) {
        row.push(group.oxygen1?.do_mgl ?? "");
        row.push(group.oxygen1?.do_percent ?? "");
      }

      if (selectedItems.includes("oxygen2")) {
        row.push(group.oxygen2?.do_mgl ?? "");
        row.push(group.oxygen2?.do_percent ?? "");
      }

      if (selectedItems.includes("oxygen3")) {
        row.push(group.oxygen3?.do_mgl ?? "");
        row.push(group.oxygen3?.do_percent ?? "");
      }

      return row;
    });

  return Papa.unparse({
    fields: headers,
    data: csvRows,
  });
};

export default function DownloadSelection() {
  // 選択されているデータの種類
  const [selectedItems, setSelectedItems] = useState<DownloadItemId[]>([]);

  // データベースに存在する最も古い日付
  const [earliestDate, setEarliestDate] = useState("");

  // 選択されている期間
  const [downloadPeriod, setDownloadPeriod] =
    useState<DownloadPeriod>("all");

  // 開始日・終了日
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ダウンロード中の状態
  const [downloadLoading, setDownloadLoading] = useState(false);

  // エラーメッセージ
  const [downloadError, setDownloadError] = useState("");

  // ヘルプ内容
  const helpSteps: HelpStep[] = [
    {
      target: "download-types",
      title: "種類の選択",
      description:
        "CSVに含めたいセンサデータの種類を選択できます。複数選択も可能です。",
    },
    {
      target: "download-select-all",
      title: "一括選択",
      description:
        "全選択・全解除ボタンから、データの種類をまとめて選択・解除できます。",
    },
    {
      target: "download-period",
      title: "期間の選択",
      description:
        "全期間・直近1ヶ月・直近1週間・今日から、ダウンロードする期間を選択できます。",
    },
    {
      target: "download-date",
      title: "日付の指定",
      description:
        "開始日と終了日を個別に指定できます。日付を変更すると、期間の選択は解除されます。",
    },
    {
      target: "download-button",
      title: "ダウンロード",
      description:
        "選択したデータの種類と期間に基づいて、CSVファイルをダウンロードできます。",
    },
  ];

  // Supabaseから最も古いデータの日付を取得
  useEffect(() => {
    const loadDateRange = async () => {
      const today = getJSTToday();

      const { data, error } = await supabase
        .from("sensor_readings_duplicate")
        .select("datetime")
        .order("datetime", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(
          "最も古いデータの日付の取得に失敗しました:",
          error
        );

        setEarliestDate(today);
        setStartDate(today);
        setEndDate(today);
        return;
      }

      const oldestDate = data?.datetime
        ? formatJST(data.datetime).slice(0, 10)
        : today;

      setEarliestDate(oldestDate);
      setStartDate(oldestDate);
      setEndDate(today);
    };

    loadDateRange();
  }, []);

  // 個別選択・解除
  const handleChange = (id: DownloadItemId) => {
    setSelectedItems((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );

    setDownloadError("");
  };

  // 全選択
  const handleSelectAll = () => {
    setSelectedItems(DOWNLOAD_ITEMS.map((item) => item.id));
    setDownloadError("");
  };

  // 全解除
  const handleClearAll = () => {
    setSelectedItems([]);
    setDownloadError("");
  };

  // 期間選択
  const handlePeriodChange = (period: DownloadPeriod) => {
    setDownloadError("");

    // 選択中のボタンをもう一度押した場合は選択解除
    if (downloadPeriod === period) {
      setDownloadPeriod("custom");
      return;
    }

    const today = getJSTToday();

    setDownloadPeriod(period);

    if (period === "all") {
      setStartDate(earliestDate || today);
      setEndDate(today);
    } else if (period === "month") {
      setStartDate(getJSTMonthsAgo(1));
      setEndDate(today);
    } else if (period === "week") {
      setStartDate(getJSTDaysAgo(7));
      setEndDate(today);
    } else if (period === "today") {
      setStartDate(today);
      setEndDate(today);
    }
  };

  // CSVダウンロード
  const handleDownload = async () => {
    if (selectedItems.length === 0 || downloadLoading) return;

    // 開始日・終了日を確認
    if (!startDate || !endDate) {
      setDownloadError("開始日と終了日を選択してください。");
      return;
    }

    if (startDate > endDate) {
      setDownloadError(
        "開始日は終了日以前の日付を選択してください。"
      );
      return;
    }

    setDownloadLoading(true);
    setDownloadError("");

    try {
      const allRecords: SensorDatabaseRecord[] = [];
      let from = 0;

      // Supabaseから1000件ずつ取得
      while (true) {
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from("sensor_readings_duplicate")
          .select(
            "sensor_id, datetime, water_temp, outside_temp, salinity, do_percent, do_mgl"
          );

        // 選択された開始日・終了日で絞り込む
        query = query
          .gte("datetime", getJSTStart(startDate))
          .lt("datetime", getJSTEndExclusive(endDate));

        const { data, error } = await query
          .order("datetime", { ascending: true })
          .order("sensor_id", { ascending: true })
          .range(from, to);

        if (error) {
          console.error("Supabase取得エラー:", error);
          throw new Error(
            "Supabaseからデータを取得できませんでした。"
          );
        }

        if (!data || data.length === 0) break;

        allRecords.push(
          ...(data as unknown as SensorDatabaseRecord[])
        );

        if (data.length < PAGE_SIZE) break;

        from += PAGE_SIZE;
      }

      if (allRecords.length === 0) {
        throw new Error(
          "指定した期間に該当するデータがありません。"
        );
      }

      const csv = createCSV(allRecords, selectedItems);
      const bom = "\uFEFF";

      const blob = new Blob(
        [bom + csv],
        { type: "text/csv;charset=utf-8;" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "sensor_readings.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (error) {
      console.error("CSVダウンロードエラー:", error);

      setDownloadError(
        error instanceof Error
          ? error.message
          : "CSVのダウンロードに失敗しました。"
      );
    } finally {
      setDownloadLoading(false);
    }
  };

  const allSelected =
    selectedItems.length === DOWNLOAD_ITEMS.length;

  return (
    <PageLayout
      title="ダウンロード"
      showBackButton
      helpSteps={helpSteps}
    >
      <section className="download-selection-area">

        {/* データの種類 */}
        <div className="download-setting-section">
          <div className="download-section-header">
            <p className="download-section-title">種類</p>

            <div
              className="download-selection-controls"
              data-help-target="download-select-all"
            >
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={allSelected || downloadLoading}
              >
                全選択
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                disabled={selectedItems.length === 0 || downloadLoading}
              >
                全解除
              </button>
            </div>
          </div>

          <div
            className="download-selection-list"
            data-help-target="download-types"
          >
            {DOWNLOAD_ITEMS.map((item) => (
              <div
                key={item.id}
                className="download-selection-item"
              >
                <input
                  id={`download-item-${item.id}`}
                  type="checkbox"
                  checked={selectedItems.includes(item.id)}
                  onChange={() => handleChange(item.id)}
                  disabled={downloadLoading}
                />

                <label htmlFor={`download-item-${item.id}`}>
                  {item.label}
                </label>
              </div>
            ))}
          </div>

          <p className="download-selection-count">
            {selectedItems.length} / {DOWNLOAD_ITEMS.length} 種類選択中
          </p>
        </div>

        <hr className="download-setting-divider" />

        {/* ダウンロード期間 */}
        <div className="download-setting-section">
          <p className="download-section-title">
            期間
          </p>

          {/* 期間選択ボタン */}
          <div
            className="download-period-options"
            data-help-target="download-period"
          >
            {DOWNLOAD_PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                className={`download-period-button ${downloadPeriod === period.id ? "selected" : ""
                  }`}
                onClick={() => handlePeriodChange(period.id)}
                disabled={downloadLoading}
                aria-pressed={downloadPeriod === period.id}
              >
                {period.label}
              </button>
            ))}
          </div>

          {/* 開始日・終了日 */}
          <div data-help-target="download-date">
            {/* 開始日 */}
            <div className="download-date-field">
              <label htmlFor="download-start-date">開始日</label>

              <input
                id="download-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDownloadPeriod("custom");
                  setDownloadError("");
                }}
                disabled={downloadLoading}
              />
            </div>

            {/* 終了日 */}
            <div className="download-date-field">
              <label htmlFor="download-end-date">終了日</label>

              <input
                id="download-end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDownloadPeriod("custom");
                  setDownloadError("");
                }}
                disabled={downloadLoading}
              />
            </div>
          </div>
        </div>

        {/* エラーメッセージ */}
        {downloadError && (
          <p className="download-selection-message">
            {downloadError}
          </p>
        )}

        {/* CSVダウンロードボタン */}
        <div
          className="download-button-area"
          data-help-target="download-button"
        >
          <button
            type="button"
            className="download-selection-button"
            onClick={handleDownload}
            disabled={selectedItems.length === 0 || downloadLoading}
          >
            {downloadLoading
              ? "ダウンロード中..."
              : "CSVダウンロード"}
          </button>
        </div>

      </section>
    </PageLayout>
  );
}