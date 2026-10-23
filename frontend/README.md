#狐崎みる（テスト用）
## 概要

狐崎浜周辺の海洋情報をわかりやすく確認できることを目的として開発したWebサイトです。
気温・水温・塩分濃度・溶存酸素の情報を確認・比較する機能を提供します。

## 主な機能

- 海洋情報の取得・確認
- 日時ごとのデータ管理
- データのグラフ・散布図表示

## 必要なパッケージ

- react-router-dom
- lucide-react
- -D vite-tsconfig-paths
- react-calendar
- echarts echarts-for-react
- tslib
- leaflet react-leaflet
- D @types/leaflet
- --save-dev @types/node

## パッケージ導入方法

ターミナルで “npm.cmd 各パッケージ名”

## 使用技術

フロントエンド：React、TypeScript

## ディレクトリ構成

Web_protoType/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
└── README.md

### frontendフォルダ内の詳細は以下

frontend/
├── api/                              **サーバー側（Vercel Functions）**
│   └── sensors.ts                    **統合API：元のAPIをまとめて取得し、1つのJSONにして返す**
└── src/
├── assets/                       **画像**
├── components/                   **共通部品**
│   ├── BottomNavigation.tsx      **下部ナビゲーション**
│   ├── BottomNavigation.css
│   ├── colors.css                **色の設定**
│   ├── Header.tsx                **ヘッダー**
│   ├── Header.css
│   ├── materials.tsx             **アイコンなどの素材**
│   ├── PageLayout.tsx            **各画面共通のレイアウト**
│   └── PageLayout.css
├── pages/                        **各画面**
│   ├── ComparePage/              **比較画面**
│   │   ├── ComparePage.tsx　　**比較画面本体**
│   │   ├── ComparePage.css
│   │   ├── CompareChart.tsx      **比較グラフ描画**
│   │   ├── CompareChart.css
│   │   ├── CompareScatter.tsx    **散布図描画**
│   │   ├── CompareScatter.css
│   │   ├── CompareSetting.tsx    **比較設定**
│   │   ├── CompareSetting.css
│   │   └── compareData.ts        **比較用のデータ処理**
│   ├── DataPage/                 **データ画面**
│   │   ├── DataPage.tsx　　**データ画面本体**
│   │   ├── DataPage.css
│   │   ├── Calendar.tsx          **カレンダー画面**
│   │   └── Calendar.css
│   ├── GraphPage/                **グラフ画面**
│   │   ├── GraphPage.tsx　　**グラフ画面本体**
│   │   ├── GraphPage.css
│   │   ├── GraphChart.tsx        **グラフ描画処理**
│   │   └── GraphChart.css
│   └── SettingPage/              **設定画面**
│       ├── SettingPage.tsx
│       ├── SettingPage.css
│       ├── map.tsx               **地図でセンサを選ぶ画面**
│       └── map.css
├── services/
│   └── sensorData.ts            **統合API(/api/sensors)からのデータ取得、グラフ用データへの変換**
├── App.tsx
├── App.css
├── index.css
└── main.tsx                      **アプリの入口**

