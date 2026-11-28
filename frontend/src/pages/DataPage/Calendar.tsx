import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Calendar from "react-calendar";
// react-calendar の基本スタイルと、カスタムスタイルのインポート
import "react-calendar/dist/Calendar.css";
import "./Calendar.css";
import PageLayout from "@/components/PageLayout";
import type { HelpStep } from "@/components/HelpOverlay";

// ヘルプ内容
const helpSteps: HelpStep[] = [
  {
    target: "calendar",
    title: "日付の選択",
    description:
      "カレンダーから確認したい日付を選択できます。今日の日付は強調表示されています。",
  },
  {
    target: "calendar-arrows",
    title: "表示期間の切り替え",
    description:
      "カレンダー上部の矢印を使って、表示する月や年を切り替えられます。",
  },
  {
    target: "calendar-ok",
    title: "日付の確定",
    description:
      "OKボタンを押すと、選択した日付を確定してデータ画面に戻ります。",
  },
];

export default function CalendarPage() {

  // ページ遷移用
  const navigate = useNavigate();
  //locationを定義
  const location = useLocation();
  const time = location.state?.time;
  // データ画面から送られてきたselectedDateを呼び出し初期値にする（データ画面と同じやり方）
  const [selectedDate, setSelectedDate] = useState(
    location.state?.selectedDate
      ? new Date(location.state.selectedDate)
      : new Date()
  );
  // カレンダー上部の矢印部分をヘルプ対象にする
  useEffect(() => {
    const navigation = document.querySelector(
      ".react-calendar__navigation"
    );

    if (navigation) {
      navigation.setAttribute(
        "data-help-target",
        "calendar-arrows"
      );
    }

    return () => {
      navigation?.removeAttribute("data-help-target");
    };
  }, []);

  // カレンダーで選択した日付を更新
  const handleDateChange = (date: any) => {
    setSelectedDate(date);
    // ここで選択された日付に対応するデータを読み込む処理を呼び出せます
    console.log("選択された日付:", date.toLocaleDateString());
  };

  return (
    <PageLayout title="日付選択" showBackButton={true} helpSteps={helpSteps}>

      {/* カレンダー表示エリア */}
      <section className="calendar-area">

        <div data-help-target="calendar">
          <Calendar
            onChange={handleDateChange}
            value={selectedDate}
            locale="ja-JP"
            formatDay={(_, date) => date.getDate().toString()} //日消去
            maxDate={new Date()}   // 今日より未来は選択不可
          />
        </div>

        <div data-help-target="calendar-ok">
          <button className="ok-button" onClick={() =>
            navigate("/data", {
              state: {
                selectedDate,
                time,
              },
            })
          }
          >
            OK
          </button>
        </div>
      </section>

    </PageLayout>
  );
}