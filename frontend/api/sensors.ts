import Papa from "papaparse";

// 塩分センサ・DOセンサの元APIをまとめて取得し、日時ごとに1つのJSONへ統合して返す
//   GET /api/sensors             … 全期間
//   GET /api/sensors?date=YYYY-MM-DD … 指定日（日本時間）のみ

type SensorRecord = {
  datetime: string; // 日本時間 "YYYY-MM-DDTHH:mm:00"
  waterTemp: number | null;
  outsideTemp: number | null;
  salinity: number | null;
  oxygen1: number | null;
  oxygen2: number | null;
  oxygen3: number | null;
};

type ValueKey = Exclude<keyof SensorRecord, "datetime">;

// 元APIごとの設定：CSVの何列目をどの項目に入れるか
const SOURCES: { name: string; url: string | undefined; columns: Partial<Record<ValueKey, number>> }[] = [
  {
    name: "salinity",
    url: process.env.SALINITY_API_URL,
    columns: { outsideTemp: 3, waterTemp: 4, salinity: 6 },
  },

  {
    name: "do1",
    url: process.env.DO1_API_URL,
    columns: { oxygen1: 6 },
  },

  // DO2号機のAPIができたら、ここに追加する
  {
    name: "do2",
    url: process.env.DO2_API_URL,
    columns: { oxygen2: 6 },
  },

  {
    name: "do3",
    url: process.env.DO3_API_URL,
    columns: { oxygen3: 6 },
  },
];

// UTCの日時文字列 → 日本時間 "YYYY-MM-DDTHH:mm:00"（分単位で揃えて、センサ間の秒ずれを吸収）
const toJstKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16) + ":00";
};

const toNumber = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const fetchCsvRows = async (url: string) => {
  const apiResponse = await fetch(url, {
    headers: { "User-Agent": "api_test/1.0" },
  });

  if (!apiResponse.ok) {
    throw new Error(`upstream status ${apiResponse.status}`);
  }

  const parsed = Papa.parse<string[]>(await apiResponse.text(), {
    header: false,
    skipEmptyLines: true,
  });
  return parsed.data;
};

// Vercel の request / response のうち、ここで使う部分だけの型
type ApiRequest = { query?: Record<string, string | string[] | undefined> };
type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  setHeader(name: string, value: string): void;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const dateParam = request.query?.date;
  const date = typeof dateParam === "string" ? dateParam : undefined;

  // 全ての元APIを並列で取得（1つ失敗しても他のデータは返す）
  const results = await Promise.allSettled(
    SOURCES.map((source) => {
      if (!source.url) {
        return Promise.reject(new Error(`${source.name} のAPI URLが設定されていません。`));
      }
      return fetchCsvRows(source.url);
    })
  );

  // 日時をキーにして統合
  const records = new Map<string, SensorRecord>();

  results.forEach((result, i) => {
    const source = SOURCES[i];

    if (result.status === "rejected") {
      console.error(`${source.name} の取得に失敗しました:`, result.reason);
      return;
    }

    for (const row of result.value) {
      if (!row[1]) continue;

      const key = toJstKey(row[1]);
      if (!key) continue; // ヘッダー行など
      if (date && !key.startsWith(date)) continue;

      let record = records.get(key);
      if (!record) {
        record = {
          datetime: key,
          waterTemp: null,
          outsideTemp: null,
          salinity: null,
          oxygen1: null,
          oxygen2: null,
          oxygen3: null,
        };
        records.set(key, record);
      }

      for (const [field, column] of Object.entries(source.columns)) {
        record[field as ValueKey] = toNumber(row[column as number]);
      }
    }
  });

  // 全部失敗したらエラー
  if (results.every((result) => result.status === "rejected")) {
    return response.status(502).json({ error: "元APIからのデータ取得に失敗しました。" });
  }

  const body = [...records.values()].sort((a, b) => a.datetime.localeCompare(b.datetime));

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET");
  // Vercelのキャッシュに60秒保持（各画面から何度呼ばれても元APIへのアクセスは抑えられる）
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  return response.status(200).json(body);
}