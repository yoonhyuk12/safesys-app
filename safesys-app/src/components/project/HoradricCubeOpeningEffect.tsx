'use client'
// 자재 수불부 진입 전에 화면 흡입과 나무 보관함 개방을 연출하는 전체 화면 시네마틱 효과.

import Image from 'next/image'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'

const CINEMATIC_SPARKS = [
  { id: 'spark-1', left: '33%', delay: '1190ms', duration: '610ms', drift: '-54px' },
  { id: 'spark-2', left: '39%', delay: '1310ms', duration: '570ms', drift: '30px' },
  { id: 'spark-3', left: '45%', delay: '1240ms', duration: '660ms', drift: '-22px' },
  { id: 'spark-4', left: '51%', delay: '1380ms', duration: '520ms', drift: '48px' },
  { id: 'spark-5', left: '57%', delay: '1210ms', duration: '680ms', drift: '-38px' },
  { id: 'spark-6', left: '63%', delay: '1400ms', duration: '500ms', drift: '24px' },
  { id: 'spark-7', left: '69%', delay: '1270ms', duration: '620ms', drift: '56px' },
] as const

export function HoradricCubeOpeningEffect() {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="material-ledger-cinematic-overlay fixed inset-0 z-[2147483646] overflow-hidden"
      aria-hidden="true"
    >
      <div className="material-ledger-cinematic-iris absolute inset-0" />
      <div className="material-ledger-cinematic-vignette absolute inset-0" />
      <div className="material-ledger-cinematic-tunnel absolute left-1/2 top-1/2" />

      <div className="material-ledger-chest-stage absolute inset-0 flex items-center justify-center [perspective:1200px]">
        <div className="material-ledger-chest relative size-[min(88vw,680px)] min-h-[280px] min-w-[280px] [transform-style:preserve-3d]">
          <div className="material-ledger-chest-shadow absolute bottom-[10%] left-[12%] h-[13%] w-[76%] rounded-[50%]" />

          <div className="material-ledger-open-chest absolute inset-0">
            <Image
              src="/images/material-ledger-chest-open.png"
              alt=""
              width={1536}
              height={1536}
              sizes="(max-width: 768px) 88vw, 680px"
              loading="eager"
              unoptimized
              draggable={false}
              className="h-full w-full select-none object-contain"
            />
          </div>

          <div className="material-ledger-closed-chest absolute left-[11%] top-[34%] h-[43%] w-[78%] [transform-style:preserve-3d]">
            <div className="material-ledger-closed-body absolute bottom-0 left-0 h-[68%] w-full overflow-hidden rounded-[3%]">
              <span className="material-ledger-gold-band absolute inset-y-0 left-[11%] w-[8%]" />
              <span className="material-ledger-gold-band absolute inset-y-0 right-[11%] w-[8%]" />
              <span className="material-ledger-horizontal-band absolute inset-x-0 top-[8%] h-[15%]" />
              <span className="material-ledger-chest-lock absolute left-1/2 top-[43%] h-[34%] w-[17%] -translate-x-1/2" />
            </div>

            <div className="material-ledger-closed-lid absolute left-0 top-0 h-[45%] w-full overflow-hidden rounded-[48%_48%_5%_5%/32%_32%_6%_6%]">
              <span className="material-ledger-lid-inlay absolute inset-[9%] rounded-[45%_45%_4%_4%/32%_32%_5%_5%]" />
              <span className="material-ledger-gold-band absolute inset-y-0 left-[11%] w-[8%]" />
              <span className="material-ledger-gold-band absolute inset-y-0 right-[11%] w-[8%]" />
              <span className="material-ledger-lid-clasp absolute left-1/2 top-0 h-[84%] w-[10%] -translate-x-1/2" />
            </div>
          </div>

          <div className="material-ledger-chest-light absolute left-1/2 top-[49%] h-[31%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full" />

          <div className="material-ledger-chest-sparks absolute inset-0">
            {CINEMATIC_SPARKS.map((spark) => (
              <span
                key={spark.id}
                className="material-ledger-chest-spark absolute top-[53%] h-1.5 w-1.5 rounded-full"
                style={{
                  left: spark.left,
                  animationDelay: spark.delay,
                  animationDuration: spark.duration,
                  '--material-ledger-spark-drift': spark.drift,
                } as CSSProperties}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="material-ledger-cinematic-whiteout absolute inset-0" />

      <style jsx global>{`
        body.material-ledger-cinematic-active {
          overflow: hidden;
          overscroll-behavior: none;
        }

        body.material-ledger-cinematic-active > div.min-h-screen {
          transform-origin: var(--material-ledger-origin-x, 50vw) var(--material-ledger-origin-y, 50vh);
          animation: material-ledger-page-suction 1950ms cubic-bezier(0.16, 0.82, 0.2, 1) both;
          will-change: transform, filter;
        }

        .material-ledger-cinematic-overlay {
          isolation: isolate;
          pointer-events: auto;
        }

        .material-ledger-cinematic-iris {
          z-index: 1;
          background: #000;
          clip-path: circle(0 at var(--material-ledger-origin-x, 50vw) var(--material-ledger-origin-y, 50vh));
          animation: material-ledger-iris-spread 1950ms cubic-bezier(0.4, 0, 0.16, 1) both;
        }

        .material-ledger-cinematic-vignette {
          z-index: 2;
          background: radial-gradient(
            circle at var(--material-ledger-origin-x, 50vw) var(--material-ledger-origin-y, 50vh),
            transparent 0,
            rgba(0, 0, 0, 0.3) 14vmin,
            rgba(0, 0, 0, 0.94) 72vmax
          );
          animation: material-ledger-vignette-close 1950ms ease-in both;
        }

        .material-ledger-cinematic-tunnel {
          z-index: 3;
          width: 170vmax;
          height: 170vmax;
          border-radius: 50%;
          background:
            repeating-conic-gradient(from 10deg, rgba(255, 211, 105, 0.17) 0deg 2deg, transparent 3deg 14deg, rgba(151, 87, 20, 0.2) 15deg 17deg, transparent 18deg 30deg),
            radial-gradient(circle, transparent 0 12%, rgba(111, 69, 20, 0.2) 28%, rgba(221, 155, 45, 0.16) 47%, transparent 68%);
          mask-image: radial-gradient(circle, transparent 0 7%, #000 19%, rgba(0, 0, 0, 0.72) 46%, transparent 72%);
          transform: translate(-50%, -50%);
          animation: material-ledger-tunnel-rush 1950ms cubic-bezier(0.16, 0.72, 0.2, 1) both;
        }

        .material-ledger-chest-stage { z-index: 5; }

        .material-ledger-chest {
          animation: material-ledger-chest-approach 1950ms cubic-bezier(0.12, 0.72, 0.18, 1) both;
          will-change: transform, opacity, filter;
        }

        .material-ledger-chest-shadow {
          background: rgba(0, 0, 0, 0.92);
          filter: blur(16px);
          transform: rotateX(68deg) translateZ(-30px);
        }

        .material-ledger-open-chest {
          z-index: 5;
          filter: drop-shadow(0 22px 26px rgba(0, 0, 0, 0.8)) saturate(1.08);
          animation: material-ledger-open-chest-reveal 1950ms ease-out both;
        }

        .material-ledger-closed-chest {
          z-index: 6;
          filter: drop-shadow(0 18px 20px rgba(0, 0, 0, 0.85));
          animation: material-ledger-closed-chest-fade 1950ms ease-out both;
        }

        .material-ledger-closed-body,
        .material-ledger-closed-lid {
          border: clamp(3px, 0.7vw, 7px) solid #f5bf3d;
          background:
            repeating-linear-gradient(3deg, rgba(74, 27, 4, 0.24) 0 2px, transparent 2px 11px),
            linear-gradient(90deg, #6e2605 0%, #b94c0b 24%, #7b2805 50%, #bd500d 76%, #672104 100%);
          box-shadow: inset 0 0 16px rgba(74, 21, 0, 0.72), inset 0 3px 3px rgba(255, 197, 85, 0.38), 0 0 5px #ffd65e;
        }

        .material-ledger-closed-body {
          clip-path: polygon(2% 0, 98% 0, 100% 100%, 0 100%);
        }

        .material-ledger-closed-lid {
          z-index: 2;
          transform-origin: 50% 100%;
          backface-visibility: visible;
          animation: material-ledger-bright-lid-open 1950ms cubic-bezier(0.16, 0.8, 0.18, 1) both;
        }

        .material-ledger-lid-inlay {
          border: 2px solid rgba(255, 213, 91, 0.86);
          box-shadow: inset 0 0 13px rgba(91, 28, 1, 0.72), 0 0 5px rgba(255, 228, 137, 0.7);
        }

        .material-ledger-gold-band,
        .material-ledger-horizontal-band,
        .material-ledger-lid-clasp {
          border: 1px solid #8e4c08;
          background: linear-gradient(90deg, #a95a0a, #ffea7a 33%, #e5a51f 61%, #8b4505);
          box-shadow: inset 0 0 5px rgba(255, 255, 220, 0.72), 0 0 5px rgba(73, 29, 0, 0.72);
        }

        .material-ledger-horizontal-band {
          background: linear-gradient(180deg, #9f5007, #ffe878 34%, #da9115 70%, #7d3703);
        }

        .material-ledger-chest-lock {
          z-index: 3;
          border: 2px solid #fff0a0;
          border-radius: 10% 10% 42% 42%;
          background:
            radial-gradient(ellipse at 50% 53%, #291202 0 8%, transparent 9%),
            linear-gradient(115deg, #9e5508, #fff08b 35%, #e3a31f 62%, #8e4805);
          box-shadow: inset 0 0 7px rgba(255, 255, 225, 0.76), 0 3px 8px rgba(55, 19, 0, 0.78), 0 0 8px rgba(255, 208, 75, 0.62);
        }

        .material-ledger-chest-lock::before {
          content: '';
          position: absolute;
          left: 24%;
          right: 24%;
          top: -44%;
          height: 58%;
          border: clamp(2px, 0.45vw, 5px) solid #e5a82a;
          border-bottom: 0;
          border-radius: 50% 50% 0 0;
        }

        .material-ledger-chest-light {
          z-index: 8;
          background: radial-gradient(circle, #fff 0%, #fff 18%, #fff8c9 36%, rgba(255, 203, 62, 0.86) 58%, transparent 76%);
          filter: blur(8px);
          mix-blend-mode: screen;
          animation: material-ledger-chest-light-burst 1950ms cubic-bezier(0.2, 0.7, 0.18, 1) both;
        }

        .material-ledger-chest-sparks { z-index: 9; }

        .material-ledger-chest-spark {
          background: #fffde8;
          box-shadow: 0 0 5px #fff, 0 0 12px #ffe56d, 0 0 20px #f0a51e;
          animation-name: material-ledger-chest-spark-rise;
          animation-timing-function: ease-out;
          animation-fill-mode: both;
        }

        .material-ledger-cinematic-whiteout {
          z-index: 20;
          background: radial-gradient(circle at center, #fff 0%, #fff 31%, #fffce9 56%, #ffe9a6 77%, #fff 100%);
          transform-origin: center;
          animation: material-ledger-whiteout 1950ms cubic-bezier(0.44, 0, 0.7, 1) both;
        }

        @keyframes material-ledger-page-suction {
          0%, 4% { transform: scale(1) rotate(0); filter: blur(0) brightness(1) saturate(1); }
          14% { transform: scale(1.06) rotate(-0.12deg); filter: blur(1px) brightness(0.9) saturate(1.08); }
          27% { transform: scale(1.34) rotate(0.45deg); filter: blur(4px) brightness(0.58) saturate(1.22); }
          38%, 100% { transform: scale(2.65) rotate(1.2deg); filter: blur(17px) brightness(0) saturate(1.35); }
        }

        @keyframes material-ledger-iris-spread {
          0%, 3% { clip-path: circle(0 at var(--material-ledger-origin-x, 50vw) var(--material-ledger-origin-y, 50vh)); }
          15% { clip-path: circle(9vmax at var(--material-ledger-origin-x, 50vw) var(--material-ledger-origin-y, 50vh)); }
          36%, 100% { clip-path: circle(160vmax at var(--material-ledger-origin-x, 50vw) var(--material-ledger-origin-y, 50vh)); }
        }

        @keyframes material-ledger-vignette-close {
          0% { opacity: 0; transform: scale(1.08); }
          20% { opacity: 0.72; transform: scale(1); }
          38%, 100% { opacity: 1; transform: scale(0.9); }
        }

        @keyframes material-ledger-tunnel-rush {
          0%, 31% { opacity: 0; transform: translate(-50%, -50%) rotate(0deg) scale(1.7); filter: blur(10px); }
          42% { opacity: 0.66; }
          67% { opacity: 0.52; transform: translate(-50%, -50%) rotate(34deg) scale(0.72); filter: blur(2px); }
          84%, 100% { opacity: 0; transform: translate(-50%, -50%) rotate(56deg) scale(0.28); filter: blur(7px); }
        }

        @keyframes material-ledger-chest-approach {
          0%, 32% { opacity: 0; transform: translateY(6vh) translateZ(-760px) scale(0.07) rotateX(-7deg); filter: blur(10px); }
          38% { opacity: 1; }
          61% { transform: translateY(1vh) translateZ(-190px) scale(0.57) rotateX(-2deg); filter: blur(1px); }
          82% { opacity: 1; transform: translateY(0) translateZ(60px) scale(1.02) rotateX(0); filter: blur(0); }
          100% { opacity: 0.25; transform: translateY(0) translateZ(170px) scale(1.3) rotateX(0); filter: blur(4px); }
        }

        @keyframes material-ledger-closed-chest-fade {
          0%, 62% { opacity: 1; }
          75%, 100% { opacity: 0; }
        }

        @keyframes material-ledger-bright-lid-open {
          0%, 57% { transform: translateZ(18px) rotateX(0); }
          73% { transform: translateY(-7%) translateZ(10px) rotateX(113deg); opacity: 0.9; }
          82%, 100% { transform: translateY(-9%) translateZ(6px) rotateX(119deg); opacity: 0; }
        }

        @keyframes material-ledger-open-chest-reveal {
          0%, 59% { opacity: 0; transform: scale(0.94); filter: brightness(0.55) saturate(1.08); }
          73% { opacity: 1; transform: scale(1); filter: brightness(1.08) saturate(1.12); }
          100% { opacity: 1; transform: scale(1.04); filter: brightness(1.32) saturate(1.05); }
        }

        @keyframes material-ledger-chest-light-burst {
          0%, 61% { opacity: 0; transform: translate(-50%, -50%) scale(0.08); }
          73% { opacity: 0.9; transform: translate(-50%, -50%) scale(1.08); }
          89% { opacity: 1; transform: translate(-50%, -50%) scale(5.2); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(11); }
        }

        @keyframes material-ledger-chest-spark-rise {
          0% { opacity: 0; transform: translate(0, 0) scale(0.25); }
          22% { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--material-ledger-spark-drift), -170px) scale(0); }
        }

        @keyframes material-ledger-whiteout {
          0%, 78% { opacity: 0; transform: scale(0.08); }
          89% { opacity: 0.34; transform: scale(0.72); }
          96%, 100% { opacity: 1; transform: scale(1.5); }
        }

        @keyframes material-ledger-reduced-page-fade {
          0% { filter: brightness(1); opacity: 1; }
          58% { filter: brightness(0); opacity: 0.12; }
          100% { filter: brightness(4); opacity: 0; }
        }

        @keyframes material-ledger-reduced-backdrop {
          0% { background-color: rgba(0, 0, 0, 0); }
          58%, 100% { background-color: #000; }
        }

        @keyframes material-ledger-reduced-whiteout {
          0%, 62% { opacity: 0; }
          100% { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          body.material-ledger-cinematic-active > div.min-h-screen {
            animation: material-ledger-reduced-page-fade 220ms ease-in both;
          }

          .material-ledger-cinematic-overlay {
            animation: material-ledger-reduced-backdrop 220ms ease-in both;
          }

          .material-ledger-cinematic-iris,
          .material-ledger-cinematic-vignette,
          .material-ledger-cinematic-tunnel,
          .material-ledger-chest-stage {
            display: none;
          }

          .material-ledger-cinematic-whiteout {
            transform: none;
            animation: material-ledger-reduced-whiteout 220ms ease-in both;
          }
        }
      `}</style>
    </div>,
    document.body,
  )
}
