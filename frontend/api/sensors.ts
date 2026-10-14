
import Papa from "papaparse";

// GET /api/sensors                         … 全期間のセンサーデータ
// GET /api/sensors?date=YYYY-MM-DD         … 指定日のデータ
// GET /api/sensors?positionsOnly=1         … センサーごとの最新位置だけ

type SensorPosition = {
  latitude: number | null;
  longitude: number | null;
  latitudeDMS: string | null;
  longitudeDMS: string | null;
};

type PositionKey = "salinity" | "DO01" | "DO02" | "DO03";

// GPS情報
type SensorPosition = {
  latitude: number | null;
  longitude: number | null;
  latitudeDMS: string | null;
  longitudeDMS: string | null;
};

type PositionKey = "salinity" | "DO01" | "DO02" | "DO03";

type SensorRecord = {
  datetime: string; // 日本時間 "YYYY-MM-DDTHH:mm:00"

  waterTemp: number | null;
  outsideTemp: number | null;
  salinity: number | null;

  oxygen1: number | null;
  oxygen2: number | null;
  oxygen3: number | null;

  // センサごとの位置
  positions: Record<PositionKey, SensorPosition>;
};

type ValueKey = Exclude<keyof SensorRecord, "datetime" | "positions">;

const SLOT_MS = 30 * 60 * 1000;

// 元APIごとの設定：CSVの何列目をどの項目に入れるか
const SOURCES: {
  name: string;
  url: string | undefined;
  columns: Partial<Record<ValueKey, number>>;
  positionKey: PositionKey;
}[] = [
  {
    name: "salinity",
    url: process.env.SALINITY_API_URL,
    columns: { outsideTemp: 3, waterTemp: 4, salinity: 6 },
    positionKey: "salinity",
  },
  {
    name: "do1",
    url: process.env.DO1_API_URL,
    columns: { oxygen1: 6 },
    positionKey: "DO01",
  },

  {
    name: "do2",
    url: process.env.DO2_API_URL,
    columns: { oxygen2: 6 },
    positionKey: "DO02",
  },
  {
    name: "do3",
    url: process.env.DO3_API_URL,
    columns: { oxygen3: 6 },
    positionKey: "DO03",
  },
];

function convertGPS(a: number, b: number, c: number) {
  const value = Math.round(a * 100);

  const latitudeDegree = Math.floor(value / 256);
  const longitudeDegree = value % 256;

  const latitudeMinute = b / 10;
  const longitudeMinute = c / 10;

  const latitudeDecimal = latitudeDegree + latitudeMinute / 60;
  const longitudeDecimal = longitudeDegree + longitudeMinute / 60;

  return {
    latitudeDecimal,
    longitudeDecimal,
    latitudeDMS: `${latitudeDegree}°${latitudeMinute.toFixed(3)}'N`,
    longitudeDMS: `${longitudeDegree}°${longitudeMinute.toFixed(3)}'E`,
  };
}

const emptyPosition = (): SensorPosition => ({
  latitude: null,
  longitude: null,
  latitudeDMS: null,
  longitudeDMS: null,
});

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

const fetchWithRetry = async (url: string, retries = 1) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, {
        headers: { "User-Agent": "api_test/1.0" },
        signal: AbortSignal.timeout(30_000), // 30秒で打ち切り
      });
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
};

const fetchCsvRows = async (url: string) => {
  const apiResponse = await fetchWithRetry(url);

  if (!apiResponse.ok) {
    throw new Error(`upstream status ${apiResponse.status}`);
  }

  const parsed = Papa.parse<string[]>(await apiResponse.text(), {
    header: false,
    skipEmptyLines: true,
  });

  return parsed.data;
};

type ApiRequest = {
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  setHeader(name: string, value: string): void;
};

export default async function handler(
  request: ApiRequest,
  response: ApiResponse
) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET");

  const dateParam = request.query?.date;
  const date = typeof dateParam === "string" ? dateParam : undefined;

  const positionsOnlyParam = request.query?.positionsOnly;
  const positionsOnly = positionsOnlyParam === "1";

  const activeSources = SOURCES.filter((source) => source.url);

  const results = await Promise.allSettled(
    activeSources.map((source) => fetchCsvRows(source.url as string))
  );

  const records = new Map<string, SensorRecord>();
  const failedSources: string[] = [];

  results.forEach((result, i) => {
    const source = activeSources[i];

    if (result.status === "rejected") {
      console.error(`${source.name} の取得に失敗しました:`, result.reason);
      failedSources.push(source.name);
      return;
    }

    for (const row of result.value) {
      if (!row[1]) continue;

      const key = toJstKey(row[1]);
      if (!key) continue;
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

          positions: {
            salinity: emptyPosition(),
            DO01: emptyPosition(),
            DO02: emptyPosition(),
            DO03: emptyPosition(),
          },
        };

        records.set(key, record);
      }

      // 水温・塩分・DOなどの値
      for (const [field, column] of Object.entries(source.columns)) {
        record[field as ValueKey] = toNumber(row[column as number]);
      }

      // GPS（7・8・9列目）
      const a = toNumber(row[7]);
      const b = toNumber(row[8]);
      const c = toNumber(row[9]);

      if (a !== null && b !== null && c !== null) {
        const gps = convertGPS(a, b, c);

        record.positions[source.positionKey] = {
          latitude: gps.latitudeDecimal,
          longitude: gps.longitudeDecimal,
          latitudeDMS: gps.latitudeDMS,
          longitudeDMS: gps.longitudeDMS,
        };
      }
    }
  });

  if (results.every((result) => result.status === "rejected")) {
    return response.status(502).json({
      error: "元APIからのデータ取得に失敗しました。",
    });
  }

  const body = [...records.values()].sort((a, b) =>
    a.datetime.localeCompare(b.datetime)
  );

  const now = Date.now();
  const slotStart = Math.floor(now / SLOT_MS) * SLOT_MS;
  const currentSlotKey = toJstKey(new Date(slotStart).toISOString());
  const todayJst = currentSlotKey?.slice(0, 10);

  let sMaxAge: number;

  if (failedSources.length > 0) {
    response.setHeader("X-Failed-Sources", failedSources.join(","));
    sMaxAge = 10;
  } else if (date && todayJst && date < todayJst) {
    sMaxAge = 600;
  } else {
    // 今の30分枠のデータが、使っている全センサ分そろっているか（GPSは判定に含めない）
    const requiredFields = activeSources.flatMap(
      (source) => Object.keys(source.columns) as ValueKey[]
    );

    const current = currentSlotKey
      ? records.get(currentSlotKey)
      : undefined;

    const isComplete =
      !!current &&
      requiredFields.every((field) => current[field] !== null);

    if (isComplete) {
      sMaxAge = Math.ceil((slotStart + SLOT_MS - now) / 1000) + 5;
    } else {
      sMaxAge = 30;
    }
  }

  response.setHeader("Cache-Control", `s-maxage=${sMaxAge}`);

  // 地図用：センサーごとに最新の有効な位置だけを返す
  if (positionsOnly) {
    const positionKeys: PositionKey[] = [
      "salinity",
      "DO01",
      "DO02",
      "DO03",
    ];

    const latestPositions: Record<PositionKey, SensorPosition> = {
      salinity: emptyPosition(),
      DO01: emptyPosition(),
      DO02: emptyPosition(),
      DO03: emptyPosition(),
    };

    const latestTimes: Partial<Record<PositionKey, string>> = {};

    // 新しい日時から確認し、センサーごとに最初の有効な位置を採用
    for (const record of [...body].reverse()) {
      for (const key of positionKeys) {
        if (latestTimes[key]) continue;

        const position = record.positions[key];

        if (
          position.latitude !== null &&
          position.longitude !== null &&
          position.latitudeDMS !== null &&
          position.longitudeDMS !== null
        ) {
          latestPositions[key] = position;
          latestTimes[key] = record.datetime;
        }
      }

      if (positionKeys.every((key) => latestTimes[key])) break;
    }

    const latestDatetime =
      Object.values(latestTimes)
        .filter((value): value is string => value !== undefined)
        .sort()
        .at(-1) ?? null;

    return response.status(200).json({
      positions: latestPositions,
      datetime: latestDatetime,
      positionDatetimes: latestTimes,
    });
  }

  // 既存の呼び出しには従来どおり全データを返す
  return response.status(200).json(body);
}