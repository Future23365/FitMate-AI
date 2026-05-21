"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SymbolIcon } from "@/components/app/symbol-icon";
import type { Exercise } from "@/lib/exercises/types";

interface ExercisePreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
}

const placeholderImage = "https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg";

export function ExercisePreviewSheet({ isOpen, onClose, exercise }: ExercisePreviewSheetProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  // 1. 缓存最新的动作详情，防止关闭时数据突然丢失导致面板瞬间空白或动效卡顿
  const [cachedExercise, setCachedExercise] = useState<Exercise | null>(null);

  // 在 Render-phase 直接安全调整缓存状态，完美规避 react-hooks/set-state-in-effect 规则警告！
  if (exercise && exercise !== cachedExercise) {
    setCachedExercise(exercise);
  }

  // 取当前展示的数据对象（如果外部 exercise 为 null，在关闭动效的 0.5s 里使用 cachedExercise 维持渲染）
  const displayExercise = exercise || cachedExercise;

  // 客户端挂载处理，保证 SSR Safe Hydration 并通过延迟规避 Effect 同步 setState 报警
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  // 用 Render-phase 调整状态，避免在 useEffect 中同步 setState 触发 react-hooks/set-state-in-effect 警告
  const [prevExerciseId, setPrevExerciseId] = useState<string | null>(null);
  if (exercise && exercise.id !== prevExerciseId) {
    setPrevExerciseId(exercise.id);
    setActiveImageIndex(0);
  }

  // 监听 ESC 按键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 当抽屉打开时，禁用背后聊天页面的滚动穿透，并为 body 挂载 drawer-open 类以联动微缩效果
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.body.classList.add("drawer-open");
    } else {
      document.body.style.overflow = "";
      document.body.classList.remove("drawer-open");
    }
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("drawer-open");
    };
  }, [isOpen]);

  // 仅在 SSR 阶段阻断，客户端挂载后保持 Portal 常驻，消除闪烁！
  if (!mounted) return null;

  const images = displayExercise?.imageUrls && displayExercise.imageUrls.length > 0 
    ? displayExercise.imageUrls 
    : [placeholderImage];

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px] drawer-backdrop-transition ${
        isOpen && displayExercise ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      onClick={onClose}
    >
      {/* 右侧滑动抽屉面板主体 (宽度 460px，固定贴在屏幕最右侧) */}
      <div
        className={`h-full w-full sm:w-[460px] bg-slate-50 shadow-2xl flex flex-col drawer-panel-transition ${
          isOpen && displayExercise ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {displayExercise && (
          <>
            {/* 顶部固定标题栏 */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-lg py-md shrink-0 shadow-sm">
              <div className="flex items-center gap-xs">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <SymbolIcon className="text-[20px]">fitness_center</SymbolIcon>
                </span>
                <div>
                  <h3 className="font-title-md text-title-md font-bold text-slate-800 leading-snug">
                    {displayExercise.nameZh || "动作详情"}
                  </h3>
                  <p className="font-label-xs text-label-xs text-slate-400">
                    {displayExercise.nameEn}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all border border-slate-100"
                type="button"
                aria-label="关闭"
              >
                <SymbolIcon className="text-[20px]">close</SymbolIcon>
              </button>
            </div>

            {/* 内部独立的独立滚动区 (卡片化堆叠流) */}
            <div className="flex-1 overflow-y-auto p-md space-y-md custom-scrollbar">
              
              {/* 卡片一：动作视觉演示 (步骤图轮播 + 快切大按钮) */}
              <div className="bg-white shadow-sm rounded-2xl p-md border border-slate-100/60">
                <h4 className="mb-sm flex items-center gap-xs font-label-sm text-label-sm font-bold text-slate-700">
                  <SymbolIcon className="text-primary text-[16px]">visibility</SymbolIcon>
                  动作视频与图解演示
                </h4>

                {/* 大图展示区域 */}
                <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-100 shadow-inner group">
                  <img
                    src={images[activeImageIndex]}
                    alt={`${displayExercise.nameZh} 演示图`}
                    className="h-full w-full object-contain p-xs"
                    loading="lazy"
                  />

                  {/* 左右翻页按钮 */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevImage}
                        className="absolute left-sm top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md text-slate-700 hover:bg-white hover:scale-105 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                        type="button"
                      >
                        <SymbolIcon className="text-[18px]">chevron_left</SymbolIcon>
                      </button>
                      <button
                        onClick={handleNextImage}
                        className="absolute right-sm top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md text-slate-700 hover:bg-white hover:scale-105 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                        type="button"
                      >
                        <SymbolIcon className="text-[18px]">chevron_right</SymbolIcon>
                      </button>
                    </>
                  )}

                  {/* 步骤角标 */}
                  <div className="absolute right-sm bottom-sm bg-black/60 backdrop-blur-sm text-white rounded-full px-sm py-[2px] font-label-xs text-label-xs font-semibold">
                    分步 {activeImageIndex + 1} / {images.length}
                  </div>
                </div>

                {/* 一键快切步骤点按指示器 */}
                {images.length > 1 && (
                  <div className="mt-sm flex justify-center gap-xs">
                    {images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIndex(idx)}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          activeImageIndex === idx ? "w-6 bg-primary" : "w-1.5 bg-slate-200 hover:bg-slate-300"
                        }`}
                        type="button"
                        aria-label={`切换到步骤图片 ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 卡片二：核心参数与发力肌群 (舒展轻灰色网格 + 主/辅肌群徽章) */}
              <div className="bg-white shadow-sm rounded-2xl p-md border border-slate-100/60">
                <h4 className="mb-sm flex items-center gap-xs font-label-sm text-label-sm font-bold text-slate-700">
                  <SymbolIcon className="text-primary text-[16px]">tune</SymbolIcon>
                  核心参数与发力肌群
                </h4>

                {/* 参数网格 */}
                <div className="grid grid-cols-3 gap-xs mb-md">
                  <div className="rounded-xl bg-slate-50/70 p-xs text-center border border-slate-100/50">
                    <span className="block font-label-xs text-label-xs text-slate-400 font-semibold">动作难度</span>
                    <span className="mt-[2px] block font-body-sm text-body-sm font-bold text-slate-700">
                      {displayExercise.levelZh || "初级"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50/70 p-xs text-center border border-slate-100/50">
                    <span className="block font-label-xs text-label-xs text-slate-400 font-semibold">推荐器械</span>
                    <span className="mt-[2px] block font-body-sm text-body-sm font-bold text-slate-700 truncate" title={displayExercise.equipmentZh || "自重"}>
                      {displayExercise.equipmentZh || "自重"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50/70 p-xs text-center border border-slate-100/50">
                    <span className="block font-label-xs text-label-xs text-slate-400 font-semibold">动力类型</span>
                    <span className="mt-[2px] block font-body-sm text-body-sm font-bold text-slate-700">
                      {displayExercise.forceZh || "向心"}
                    </span>
                  </div>
                </div>

                {/* 肌群徽章排版 */}
                <div className="space-y-sm">
                  <div>
                    <span className="inline-flex items-center gap-[2px] font-label-xs text-label-xs font-semibold text-slate-500 mb-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      主导发力肌群
                    </span>
                    <div className="flex flex-wrap gap-xs">
                      {displayExercise.primaryMusclesZh && displayExercise.primaryMusclesZh.length > 0 ? (
                        displayExercise.primaryMusclesZh.map((muscle) => (
                          <span key={muscle} className="inline-flex items-center rounded-full bg-primary/10 px-sm py-[2px] font-label-xs text-label-xs font-bold text-primary border border-primary/10">
                            {muscle}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 font-label-xs text-label-xs">暂无明确主肌群</span>
                      )}
                    </div>
                  </div>

                  {displayExercise.secondaryMusclesZh && displayExercise.secondaryMusclesZh.length > 0 && (
                    <div>
                      <span className="inline-flex items-center gap-[2px] font-label-xs text-label-xs font-semibold text-slate-500 mb-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        辅助发力肌群
                      </span>
                      <div className="flex flex-wrap gap-xs">
                        {displayExercise.secondaryMusclesZh.map((muscle) => (
                          <span key={muscle} className="inline-flex items-center rounded-full bg-slate-100 px-sm py-[2px] font-label-xs text-label-xs font-bold text-slate-600 border border-slate-200/50">
                            {muscle}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 卡片三：标准动作要领 (大圆形数字序列引导) */}
              <div className="bg-white shadow-sm rounded-2xl p-md border border-slate-100/60">
                <h4 className="mb-sm flex items-center gap-xs font-label-sm text-label-sm font-bold text-slate-700">
                  <SymbolIcon className="text-primary text-[16px]">menu_book</SymbolIcon>
                  标准动作步骤与要领
                </h4>

                {displayExercise.instructionsZh && displayExercise.instructionsZh.length > 0 ? (
                  <ol className="space-y-sm">
                    {displayExercise.instructionsZh.map((step, idx) => (
                      <li key={idx} className="flex gap-sm items-start">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary font-black text-[10px] text-white shadow-sm mt-[2px]">
                          {idx + 1}
                        </span>
                        <p className="font-body-sm text-body-sm text-slate-600 leading-relaxed">
                          {step}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-slate-400 font-label-xs text-label-xs text-center py-md">
                    暂无中文动作说明，请结合动作视频或图片参考。
                  </p>
                )}
              </div>

              {/* 卡片四：防伤与安全防护 (极其醒目的琥珀黄色警告卡片) */}
              <div className="bg-amber-50/80 border border-amber-200/50 shadow-sm rounded-2xl p-md text-amber-900">
                <h4 className="mb-xs flex items-center gap-xs font-label-sm text-label-sm font-bold text-amber-800">
                  <SymbolIcon className="text-amber-600 text-[18px]">health_and_safety</SymbolIcon>
                  安全防护与防伤指引
                </h4>

                {/* 风险预警标签 */}
                {displayExercise.riskTags && displayExercise.riskTags.length > 0 && (
                  <div className="mb-sm flex flex-wrap gap-xs">
                    {displayExercise.riskTags.map((tag) => (
                      <span key={tag} className="inline-flex items-center rounded bg-amber-100 px-xs py-[2px] font-label-xs text-label-xs font-bold text-amber-800 border border-amber-200">
                        ⚠ {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="font-body-xs text-body-xs leading-relaxed space-y-xs font-medium">
                  <p>
                    1. 💡 <strong className="font-bold text-amber-950">姿态维持</strong>：整个运动轨迹中务必锁定核心，维持脊柱中立，严禁弓背借力甩重，避免对腰椎造成过量压迫。
                  </p>
                  <p>
                    2. 💡 <strong className="font-bold text-amber-950">循序渐进</strong>：首组推荐使用空杆或自重来激活肌肉并熟悉动作模式，掌握肌肉募集感后，再循序渐进施加负重。
                  </p>
                  <p>
                    3. 🛑 <strong className="font-bold text-amber-950">伤痛警报</strong>：肌酸微酸是正常的运动充血现象。若关节或肌韧带产生针刺感或撕裂麻木刺痛，应立即停止动作并及时康复诊疗。
                  </p>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
