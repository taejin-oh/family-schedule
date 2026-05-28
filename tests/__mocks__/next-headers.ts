// vitest 환경에선 next/headers의 cookies가 throw. mock으로 빈 cookieStore 반환.
export const cookies = async () => ({
  get: () => undefined,
})
