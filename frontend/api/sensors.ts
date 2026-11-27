import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// GET /api/sensors                         … 全期間のセンサーデータ
// GET /api/sensors?date=YYYY-MM-DD         … 指定日（日本時間）のデータ
// GET /api/sensors?positionsOnly=1         … センサーごとの最新位置だけ
//
// データはDB（Supabaseの sensor_readings）から読む。元APIには触れない。

type SensorPosition = {
  latitude: number | null;
  longitude: number | null;
  latitudeDMS: string | null;
  longitudeDMS: string | null;
};

type PositionKey = "salinity" | "DO01" | "DO02" | "DO03";

type SensorRecord = {
  datetime: string;
  waterTemp: number | null;
  outsideTemp: number | null;
  salinity: number | null;
  oxygen1: number | null;
  oxygen2: number | null;
  oxygen3: number | null;
  positions: Record<PositionKey, SensorPosition>;
};

// DBの sensor_readings 1行
type DbRow = {
  sensor_id: string;
  datetime: string;
  outside_temp: number | null;
  water_temp: number | null;
  salinity: number | null;
  do_mgl: number | null;
  pos1: number | null;
  pos2: number | null;
  pos3: number | null;
};

// DBの sensor_id → 画面側の位置キー
const POSITION_KEYS: Record<string, PositionKey> = {
  salinity: "salinity",
  do1: "DO01",
  do2: "DO02",
  do3: "DO03",
};

const COLUMNS =
  "sensor_id,datetime,outside_temp,water_temp,salinity,do_mgl,pos1,pos2,pos3";

// Supabaseは1回で最大1000行までしか返さないため、ページに分けて読む
const PAGE_SIZE = 1000;

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

const toPosition = (
  a: number | null,
  b: number | null,
  c: number | null
): SensorPosition => {
  if (a === null || b === null || c === null) return emptyPosition();

  const gps = convertGPS(a, b, c);
  return {
    latitude: gps.latitudeDecimal,
    longitude: gps.longitudeDecimal,
    latitudeDMS: gps.latitudeDMS,
    longitudeDMS: gps.longitudeDMS,
  };
};

// 日時 → 日本時間の「YYYY-MM-DDTHH:MM:00」（秒は切り捨て）
const toJstKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16) + ":00";
};

const fetchRows = async (
  supabase: SupabaseClient,
  range?: { from: string; to: string }
) => {
  const rows: DbRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from("sensor_readings").select(COLUMNS);
    if (range) query = query.gte("datetime", range.from).lt("datetime", range.to);

    const { data, error } = await query
      .order("datetime", { ascending: true })
      .order("sensor_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as DbRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
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

  const positionsOnly = request.query?.positionsOnly === "1";

  // 日付の形式チェックと、日本時間の1日分の範囲づくり
  let range: { from: string; to: string } | undefined;
  if (date) {
    const start = new Date(`${date}T00:00:00+09:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(start.getTime())) {
      return response
        .status(400)
        .json({ error: "date は YYYY-MM-DD 形式で指定してください。" });
    }
    range = {
      from: start.toISOString(),
      to: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return response
      .status(500)
      .json({ error: "DBの接続情報が設定されていません。" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // キャッシュ：過去の日付は10分、それ以外は1分（DBは30分ごとにしか更新されない）
  const todayJst = toJstKey(new Date().toISOString())?.slice(0, 10);
  const isPastDate = !!date && !!todayJst && date < todayJst;
  response.setHeader(
    "Cache-Control",
    isPastDate ? "s-maxage=600" : "s-maxage=60, stale-while-revalidate=300"
  );

  try {
    // 地図用：センサーごとに最新の有効な位置だけを返す
    if (positionsOnly) {
      const latestPositions: Record<PositionKey, SensorPosition> = {
        salinity: emptyPosition(),
        DO01: emptyPosition(),
        DO02: emptyPosition(),
        DO03: emptyPosition(),
      };
      const latestTimes: Partial<Record<PositionKey, string>> = {};

      await Promise.all(
        Object.entries(POSITION_KEYS).map(async ([sensorId, key]) => {
          const { data, error } = await supabase
            .from("sensor_readings")
            .select("datetime,pos1,pos2,pos3")
            .eq("sensor_id", sensorId)
            .not("pos1", "is", null)
            .not("pos2", "is", null)
            .not("pos3", "is", null)
            .order("datetime", { ascending: false })
            .limit(1);

          if (error) throw new Error(error.message);

          const row = data?.[0] as
            | Pick<DbRow, "datetime" | "pos1" | "pos2" | "pos3">
            | undefined;
          if (!row) return;

          latestPositions[key] = toPosition(row.pos1, row.pos2, row.pos3);
          const jstKey = toJstKey(row.datetime);
          if (jstKey) latestTimes[key] = jstKey;
        })
      );

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

    // 通常：DBの行を、日時（日本時間・分まで）ごとに1つのレコードにまとめる
    const rows = await fetchRows(supabase, range);
    const records = new Map<string, SensorRecord>();

    for (const row of rows) {
      const key = toJstKey(row.datetime);
      if (!key) continue;

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

      if (row.sensor_id === "salinity") {
        record.outsideTemp = row.outside_temp;
        record.waterTemp = row.water_temp;
        record.salinity = row.salinity;
      } else if (row.sensor_id === "do1") {
        record.oxygen1 = row.do_mgl;
      } else if (row.sensor_id === "do2") {
        record.oxygen2 = row.do_mgl;
      } else if (row.sensor_id === "do3") {
        record.oxygen3 = row.do_mgl;
      }

      const positionKey = POSITION_KEYS[row.sensor_id];
      if (positionKey) {
        const position = toPosition(row.pos1, row.pos2, row.pos3);
        if (position.latitude !== null) record.positions[positionKey] = position;
      }
    }

    const body = [...records.values()].sort((a, b) =>
      a.datetime.localeCompare(b.datetime)
    );

    return response.status(200).json(body);
  } catch (error) {
    console.error("DBからの読み出しに失敗しました:", error);
    response.setHeader("Cache-Control", "no-store");
    return response
      .status(500)
      .json({ error: "DBからのデータ取得に失敗しました。" });
  }
}
