import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

// POST /api/ingest           … 元APIの新しいデータだけをDB（sensor_readings）に追加
// POST /api/ingest?full=1    … 元APIの全データをDBに追加（過去分の取り直し用）
// 認証: Authorization: Bearer <INGEST_SECRET>
//
// 元APIのCSV（ヘッダーなし）の列
//   塩分: 0=機器ID 1=日時(UTC) 2=バッテリ 3=外気温 4=水温 5=電気伝導度 6=塩分 7〜9=位置情報1〜3
//   DO  : 0=機器ID 1=日時(UTC) 2=バッテリ 3=外気温 4=水温 5=DO(%) 6=DO(mg/L) 7〜9=位置情報1〜3

type SourceKind = "salinity" | "do";

const SOURCES: {
  sensorId: string;
  url: string | undefined;
  kind: SourceKind;
}[] = [
  { sensorId: "salinity", url: process.env.SALINITY_API_URL, kind: "salinity" },
  { sensorId: "do1", url: process.env.DO1_API_URL, kind: "do" },
  { sensorId: "do2", url: process.env.DO2_API_URL, kind: "do" },
  { sensorId: "do3", url: process.env.DO3_API_URL, kind: "do" },
];

// 日時は「2026-10-16T13:30:22Z」の形（UTC）の行だけを取り込む。
// 古い形式の行や文字化けした行は、列の意味が違うため捨てる
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type Reading = {
  sensor_id: string;
  datetime: string;
  outside_temp: number | null;
  water_temp: number | null;
  salinity: number | null;
  do_percent: number | null;
  do_mgl: number | null;
  pos1: number | null;
  pos2: number | null;
  pos3: number | null;
};

const MARGIN_MS = 24 * 60 * 60 * 1000; // 最新時刻より1日前から取り直す（取りこぼし対策）
const CHUNK_SIZE = 500;

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
        signal: AbortSignal.timeout(30_000),
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

// CSVの1行 → DBの1行。日時が読めない行（文字化けなど）は null を返して捨てる
const toReading = (
  sensorId: string,
  kind: SourceKind,
  row: string[]
): Reading | null => {
  if (!row[1] || !ISO_UTC.test(row[1].trim())) return null;

  const time = new Date(row[1].trim());
  if (Number.isNaN(time.getTime())) return null;

  return {
    sensor_id: sensorId,
    datetime: time.toISOString(),
    outside_temp: toNumber(row[3]),
    water_temp: toNumber(row[4]),
    salinity: kind === "salinity" ? toNumber(row[6]) : null,
    do_percent: kind === "do" ? toNumber(row[5]) : null,
    do_mgl: kind === "do" ? toNumber(row[6]) : null,
    pos1: toNumber(row[7]),
    pos2: toNumber(row[8]),
    pos3: toNumber(row[9]),
  };
};

// 合言葉の比較（長さと中身を最後まで確認する）
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
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
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    return response.status(405).json({ error: "POSTで呼び出してください。" });
  }

  // --- 認証 ---
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return response
      .status(500)
      .json({ error: "INGEST_SECRET が設定されていません。" });
  }

  const authHeader = request.headers?.authorization;
  const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!authValue || !safeEqual(authValue, `Bearer ${secret}`)) {
    return response.status(401).json({ error: "認証に失敗しました。" });
  }

  // --- DB接続 ---
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return response
      .status(500)
      .json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません。" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const full = request.query?.full === "1";
  const activeSources = SOURCES.filter((source) => source.url);

  // センサーごとに「取得 → 新しい分だけ選ぶ → DBに追加」を並行して行う
  const results = await Promise.all(
    activeSources.map(async (source) => {
      try {
        const rows = await fetchCsvRows(source.url as string);

        // 同じ日時が重複していたら1つにまとめる
        const readings = new Map<string, Reading>();
        let skipped = 0;
        for (const row of rows) {
          const reading = toReading(source.sensorId, source.kind, row);
          if (reading) readings.set(reading.datetime, reading);
          else skipped++;
        }

        // DBにある最新の日時を調べ、その1日前以降だけを追加対象にする
        let cutoff = 0;
        if (!full) {
          const { data, error } = await supabase
            .from("sensor_readings")
            .select("datetime")
            .eq("sensor_id", source.sensorId)
            .order("datetime", { ascending: false })
            .limit(1);

          if (error) throw new Error(`DB読み出しに失敗: ${error.message}`);

          const latest = data?.[0]?.datetime;
          if (latest) cutoff = new Date(latest).getTime() - MARGIN_MS;
        }

        const targets = [...readings.values()].filter(
          (reading) => new Date(reading.datetime).getTime() >= cutoff
        );

        // 500件ずつ追加。同じ（センサ, 日時）の行がすでにあれば何もしない
        for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
          const { error } = await supabase
            .from("sensor_readings")
            .upsert(targets.slice(i, i + CHUNK_SIZE), {
              onConflict: "sensor_id,datetime",
              ignoreDuplicates: true,
            });

          if (error) throw new Error(`DB書き込みに失敗: ${error.message}`);
        }

        return {
          sensor: source.sensorId,
          ok: true,
          fetched: readings.size,
          skipped, // 日時の形式が違うなどで取り込まなかった行数
          sent: targets.length,
        };
      } catch (error) {
        console.error(`${source.sensorId} の取り込みに失敗しました:`, error);
        return {
          sensor: source.sensorId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  // どれか失敗したら500を返す（GitHub Actionsの実行が失敗扱いになり、気付ける）
  const hasFailure = results.some((result) => !result.ok);
  return response.status(hasFailure ? 500 : 200).json({ full, results });
}
