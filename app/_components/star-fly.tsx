'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * 카드 ✓ 위치 → 화면 상단 별 보드(StickersRow)의 다음 빈 ★ 슬롯으로
 * 별이 호를 그리며 날아가서 "붙는" 모션 (M11+).
 *
 * 구현 패턴: WAAPI FLIP — fixed position element + element.animate()로
 * viewport 절대 좌표를 계산해 정확히 도착. 외부 라이브러리 0개.
 *
 * - 주 별 ⭐ + sparkle trail ✨ 4개가 stagger로 따라감.
 * - 도착 시 별 보드 슬롯이 amber로 차오르며 1→1.4→1 pop (~320ms).
 * - prefers-reduced-motion: 비행 생략, 슬롯 색만 즉시 amber로 전환.
 *
 * 호출처는 `originRef`(보통 ✓ 동그라미 span)와 `onArrive`(별이 도착한 직후 호출 — 보통
 * form.requestSubmit() 트리거)를 전달. onArrive를 fly 끝난 후에 호출하면 페이지 reload가
 * fly 모션을 잘라먹지 않아서 연속 클릭에도 모든 별이 끝까지 보임.
 */
export function StarFly({
  originRef,
  onArrive,
}: {
  originRef: RefObject<HTMLElement | null>
  onArrive?: () => void
}) {
  const [done, setDone] = useState(false)
  const starRef = useRef<HTMLSpanElement>(null)
  const sparkleRefs = useRef<(HTMLSpanElement | null)[]>([])

  // 시작 좌표(viewport) — 마운트 즉시 측정.
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const el = originRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }, [originRef])

  // 별 보드 도착 슬롯 좌표 + WAAPI 비행.
  useEffect(() => {
    if (!origin) return
    const star = starRef.current
    if (!star) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const target = document.querySelector<HTMLElement>('[data-star-slot][data-empty="true"]')
    const targetRect = target?.getBoundingClientRect()
    const endX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth - 60
    const endY = targetRect ? targetRect.top + targetRect.height / 2 : 80

    if (reduced) {
      // 모션 감소 선호: 비행 생략, 도착 슬롯만 짧게 amber pop.
      if (target) {
        target.animate(
          [{ opacity: 0.4 }, { opacity: 1 }],
          { duration: 200, easing: 'ease-out', fill: 'forwards' },
        )
      }
      const t = setTimeout(() => {
        onArrive?.()
        setDone(true)
      }, 220)
      return () => clearTimeout(t)
    }

    const dx = endX - origin.x
    const dy = endY - origin.y
    // 호: 중간점에서 위로 80px 더 솟구쳤다가 도착 — 포물선.
    const midX = dx * 0.45
    const midY = dy * 0.25 - 80

    // 거리 비례 duration. 짧은 비행도 너무 빨라 안 보이지 않게 최소값 보장.
    const dist = Math.hypot(dx, dy)
    const duration = Math.max(950, Math.min(1300, 800 + dist * 0.7))

    const flyAnim = star.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)', opacity: 0, offset: 0 },
        { transform: 'translate(-50%, calc(-50% - 10px)) scale(1.6) rotate(60deg)', opacity: 1, offset: 0.13 },
        { transform: `translate(calc(-50% + ${midX}px), calc(-50% + ${midY}px)) scale(1.3) rotate(380deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7) rotate(740deg)`, opacity: 0, offset: 1 },
      ],
      { duration, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' },
    )

    // sparkle trail: 메인 별 path의 부분 구간을 stagger로 따라가다 작아지며 사라짐.
    const sparkleDuration = Math.max(700, duration * 0.8)
    sparkleRefs.current.forEach((sparkle, i) => {
      if (!sparkle) return
      const delay = 80 + i * 70
      const jitterX = (i - 1.5) * 14
      const jitterY = (i % 2 === 0 ? -1 : 1) * 10
      sparkle.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0)', opacity: 0, offset: 0 },
          { transform: `translate(calc(-50% + ${jitterX}px), calc(-50% + ${jitterY - 20}px)) scale(1.3) rotate(45deg)`, opacity: 1, offset: 0.4 },
          { transform: `translate(calc(-50% + ${dx * 0.55 + jitterX}px), calc(-50% + ${dy * 0.55 + jitterY}px)) scale(0.9) rotate(180deg)`, opacity: 0.7, offset: 0.8 },
          { transform: `translate(calc(-50% + ${dx * 0.9}px), calc(-50% + ${dy * 0.9}px)) scale(0) rotate(360deg)`, opacity: 0, offset: 1 },
        ],
        { duration: sparkleDuration, delay, easing: 'ease-out', fill: 'forwards' },
      )
    })

    flyAnim.onfinish = () => {
      // 도착 슬롯에 1→1.5→1 amber pop + glow.
      if (target) {
        target.animate(
          [
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(1.5)', filter: 'brightness(1.5) drop-shadow(0 0 8px rgb(251 191 36))', offset: 0.4 },
            { transform: 'scale(1)', filter: 'brightness(1)' },
          ],
          { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        )
      }
      // fly 다 끝난 시점에 호출처에 알림 → form submit 트리거 → 페이지 reload가 fly를 안 잘라먹음.
      onArrive?.()
      setDone(true)
    }
  }, [origin, onArrive])

  if (done || !origin) {
    // origin 아직 안 잡힌 매우 짧은 프레임에는 안 보이게 — 첫 paint에서 잘못된 위치 노출 방지.
    if (done) return null
    // origin 측정 직전이라도 컴포넌트는 mount되어 ref 잡혀야 하므로 wrapper만 그림.
  }

  const visibility = origin ? 'visible' : 'hidden'

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 select-none"
      style={{ visibility }}
    >
      <span
        ref={starRef}
        className="block absolute text-[32px] leading-none will-change-transform"
        style={{
          left: origin?.x ?? 0,
          top: origin?.y ?? 0,
          // 초기 transform은 keyframes의 offset 0에서 잡힘.
        }}
      >
        ⭐
      </span>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          ref={(el) => {
            sparkleRefs.current[i] = el
          }}
          className="block absolute text-[18px] leading-none will-change-transform"
          style={{
            left: origin?.x ?? 0,
            top: origin?.y ?? 0,
          }}
        >
          ✨
        </span>
      ))}
    </div>
  )
}
