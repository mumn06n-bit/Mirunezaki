import "./HelpOverlay.css";
import {
    useLayoutEffect,
    useRef,
    useState,
} from "react";

export type HelpStep = {
    target: string;
    title: string;
    description: string;
};

type HelpOverlayProps = {
    steps: HelpStep[];
    onClose: () => void;
};

type BubblePosition = {
    top: number;
    left: number;
    arrow: "top" | "bottom" | "left" | "right" | "none";
    arrowOffset: number;
};

export default function HelpOverlay({
    steps,
    onClose,
}: HelpOverlayProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    const [position, setPosition] = useState<BubblePosition>({
        top: 16,
        left: 16,
        arrow: "none",
        arrowOffset: 0,
    });

    const bubbleRef = useRef<HTMLDivElement>(null);

    const currentStep = steps[currentIndex];

    // 吹き出しの位置を計算
    useLayoutEffect(() => {
        if (!currentStep) return;

        const updatePosition = () => {
            const target = document.querySelector(
                `[data-help-target="${currentStep.target}"]`
            );

            const bubble = bubbleRef.current;

            if (!bubble) return;

            const bubbleRect = bubble.getBoundingClientRect();

            const bubbleWidth = bubbleRect.width;
            const bubbleHeight = bubbleRect.height;

            const gap = 16;
            const margin = 16;

            // 説明対象が見つからない場合
            if (!target) {
                setPosition({
                    top: Math.max(
                        margin,
                        (window.innerHeight - bubbleHeight) / 2
                    ),
                    left: Math.max(
                        margin,
                        (window.innerWidth - bubbleWidth) / 2
                    ),
                    arrow: "none",
                    arrowOffset: 0,
                });

                return;
            }

            const rect = target.getBoundingClientRect();

            // 上下左右の配置候補
            const candidates = [
                {
                    arrow: "top" as const,
                    top: rect.bottom + gap,
                    left: rect.left + rect.width / 2 - bubbleWidth / 2,
                    available: window.innerHeight - rect.bottom - gap - margin,
                    required: bubbleHeight,
                },
                {
                    arrow: "bottom" as const,
                    top: rect.top - bubbleHeight - gap,
                    left: rect.left + rect.width / 2 - bubbleWidth / 2,
                    available: rect.top - gap - margin,
                    required: bubbleHeight,
                },
                {
                    arrow: "left" as const,
                    top: rect.top + rect.height / 2 - bubbleHeight / 2,
                    left: rect.right + gap,
                    available: window.innerWidth - rect.right - gap - margin,
                    required: bubbleWidth,
                },
                {
                    arrow: "right" as const,
                    top: rect.top + rect.height / 2 - bubbleHeight / 2,
                    left: rect.left - bubbleWidth - gap,
                    available: rect.left - gap - margin,
                    required: bubbleWidth,
                },
            ];

            // 画面内に収まる配置を優先
            const selected =
                candidates.find(
                    (candidate) =>
                        candidate.available >= candidate.required
                ) ??
                candidates.reduce((best, candidate) =>
                    candidate.available > best.available
                        ? candidate
                        : best
                );

            // 画面外にはみ出さないように調整
            const maxLeft = Math.max(
                margin,
                window.innerWidth - bubbleWidth - margin
            );

            const maxTop = Math.max(
                margin,
                window.innerHeight - bubbleHeight - margin
            );

            const left = Math.max(
                margin,
                Math.min(selected.left, maxLeft)
            );

            const top = Math.max(
                margin,
                Math.min(selected.top, maxTop)
            );

            // 三角形を対象の中心に向ける
            let arrowOffset = 0;

            if (
                selected.arrow === "top" ||
                selected.arrow === "bottom"
            ) {
                const targetCenter = rect.left + rect.width / 2;

                arrowOffset = Math.max(
                    18,
                    Math.min(targetCenter - left, bubbleWidth - 18)
                );
            } else {
                const targetCenter = rect.top + rect.height / 2;

                arrowOffset = Math.max(
                    18,
                    Math.min(targetCenter - top, bubbleHeight - 18)
                );
            }

            // 「設定の確定」だけ三角形を右にずらす
            if (
                currentStep.target === "compare-setting-save" &&
                (selected.arrow === "top" || selected.arrow === "bottom")
            ) {
                arrowOffset = Math.min(
                    arrowOffset + 110,
                    bubbleWidth - 18
                );
            }

            // 「ダウンロード」だけ三角形を右にずらす
            if (
                currentStep.target === "download-button" &&
                (selected.arrow === "top" || selected.arrow === "bottom")
            ) {
                arrowOffset = Math.min(
                    arrowOffset + 110,
                    bubbleWidth - 18
                );
            }

            setPosition({
                top,
                left,
                arrow: selected.arrow,
                arrowOffset,
            });
        };

        updatePosition();

        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);

        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [currentStep]);

    // 次の説明へ進む
    const handleNext = () => {
        if (currentIndex === steps.length - 1) {
            onClose();
            return;
        }

        setCurrentIndex((index) => index + 1);
    };

    if (!currentStep) return null;

    return (
        <div className="help-overlay" onClick={handleNext}>
            <div
                ref={bubbleRef}
                className={`help-bubble arrow-${position.arrow}`}
                style={{
                    top: position.top,
                    left: position.left,
                    "--arrow-offset": `${position.arrowOffset}px`,
                } as React.CSSProperties}
            >
                <button
                    className="help-close"
                    onClick={(event) => {
                        event.stopPropagation();
                        onClose();
                    }}
                    aria-label="ヘルプを閉じる"
                >
                    ×
                </button>

                <h3>{currentStep.title}</h3>
                <p>{currentStep.description}</p>
            </div>
        </div>
    );
}