/**
 * 학원 컬러(hex) 위에 텍스트 올릴 때 흑/백 자동 선택.
 * WCAG relative luminance 공식. 컷오프 0.5 — 파스텔(밝은) 배경은 검정, 진한 배경은 흰색.
 *
 * 참고: 정식 WCAG AA 검증(4.5:1)은 비교 대상 색이 둘 다 필요하지만,
 * 우리 케이스는 단일 hex만 받아서 "흑/백 중 가까운 게 더 대비 큼"이라는 단순 규칙으로 충분.
 */

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const raw = m[1]
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    }
  }
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  }
}

/** sRGB component → linear (gamma 보정). WCAG 공식. */
function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance (0=black, 1=white). */
function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0.5
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 배경 hex 위에 올릴 텍스트 색. 밝은 배경 → 검정, 진한 배경 → 흰색.
 * 컷오프 0.5는 일반적인 휴리스틱. 파스텔(노랑/연두/연하늘)도 검정으로 잘 분류됨.
 */
export function textOn(hex: string): 'black' | 'white' {
  return relativeLuminance(hex) > 0.5 ? 'black' : 'white'
}
