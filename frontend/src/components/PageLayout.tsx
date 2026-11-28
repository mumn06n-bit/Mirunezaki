import "./PageLayout.css";

import { useState } from "react";
import Header from "./Header";
import HelpOverlay, { type HelpStep } from "./HelpOverlay.tsx";

type PageLayoutProps = {
  title: string;
  children: React.ReactNode;
  showBackButton?: boolean;
  className?: string;
  helpSteps?: HelpStep[];
};

//ヘッダーとページ内容のセットを共通化
export default function PageLayout({
  title,
  children,
  showBackButton = false,
  className = "",
  helpSteps = [],
}: PageLayoutProps) {

  // ヘルプの表示状態
  const [showHelp, setShowHelp] = useState(false);

  // ヘルプを開始
  const handleHelpClick = () => {
    if (helpSteps.length === 0) return;
    setShowHelp(true);
  };

  // ヘルプを終了
  const handleHelpClose = () => {
    setShowHelp(false);
  };
  return (
    <div className={`page ${className}`}>

      <Header title={title} showBackButton={showBackButton} onHelpClick={handleHelpClick}/>

      <main className="page-content">
        {children}
      </main>

      {/* ヘルプ表示 */}
      {showHelp && (
        <HelpOverlay
          steps={helpSteps}
          onClose={handleHelpClose}
        />
      )}

    </div>
  );
}