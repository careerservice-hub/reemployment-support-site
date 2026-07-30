# careerservice.co.kr Technical Hotfix Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 공개 사이트의 문의 유효성, 접근성, favicon, SNS 공유 메타를 작은 PR로 수정하고, 같은 저장소의 Worker 보안 및 응답 보안 헤더도 함께 검증한다.

**Architecture:** Astro 정적 사이트와 문의 API Worker 소스가 같은 저장소에 있으므로 사이트·Worker 계약을 함께 수정하고 비외부 회귀 테스트로 검증한다. Cloudflare edge 설정처럼 저장소 밖의 운영 설정만 권한·현재 설정을 먼저 확인한 뒤 독립 변경으로 처리한다. 모든 변경은 fresh `origin/main` 작업공간, 복구 태그, 로컬 빌드, Playwright/Lighthouse, 실서비스 확인 순으로 진행한다.

**Tech Stack:** Astro, GitHub Pages, CSS, vanilla JavaScript, Cloudflare Worker/Cloudflare edge configuration, Playwright, Lighthouse

---

## 0. 범위와 완료 기준

### 이번 핫픽스에 포함

1. 전화번호 형식의 브라우저 검증과 오류 안내
2. 폼 주요 필드 길이 제한
3. CTA 색상 대비 WCAG AA 충족
4. 푸터 인증 링크의 접근성 이름 수정
5. `/favicon.ico` 200 응답
6. `og:image`, `twitter:image`, `summary_large_image` 적용
7. Worker 서버 검증·Origin·best-effort KV throttle의 별도 확인 및 보완
8. Cloudflare를 통한 HTTP 보안 헤더 적용 가능성 확인 및 별도 반영

### 제외

- 홈페이지 문구·서비스 구조·디자인 전면 개편
- 개인정보 저장 DB 신설
- 상담 알림 채널 변경
- 다운로드 양식 내용 수정
- 기존 팝오버 구조 리팩터링

### 완료 기준

- 잘못된 연락처 `abc`가 Worker 요청 전에 차단됨
- 정상 전화번호와 이메일은 기존 흐름을 유지함
- Worker 장애 시 성공 메시지가 나오지 않고 기존 이메일 fallback이 유지됨
- Lighthouse 접근성 98점 이상, 대비·접근성 이름 실패 0건을 목표로 함
- `/favicon.ico`, 공유 이미지 URL, 다운로드 4개가 모두 HTTP 200
- 390/768/1280px에서 가로 overflow와 팝오버 경계 이탈 없음
- 금지 footer 문구가 빌드 결과와 실서비스에 없음
- 기존 sitemap·robots·canonical·JSON-LD·404 동작이 유지됨

---

## Task 1. 복구 경로와 작업공간 준비

**Objective:** 현재 main을 보호하고 다른 작업과 충돌하지 않는 핫픽스 작업공간을 만든다.

**Files:** 변경 없음

1. `git fetch origin --prune`
2. 현재 checkout의 `git status --short --branch` 확인
3. `origin/main`에 시각이 포함된 복구 태그 생성: `restore/pre-careerservice-tech-hotfix-YYYYMMDD-HHMMSS`
4. fresh worktree와 브랜치 생성: `hotfix/careerservice-technical-qa-20260730`
5. 변경 전 `npm ci && npm run build && npm run check:popovers` 실행
6. 주요 live URL과 다운로드 4개의 HTTP 상태를 기준선 파일에 기록

**검증:** 기준선 build와 popover check가 통과해야 다음 작업으로 진행한다.

---

## Task 2. 문의 폼 전화번호·길이 검증

**Objective:** 무효 연락처와 과도한 입력을 브라우저에서 차단하되 기존 Worker 및 mailto fallback을 보존한다.

**Files:**
- Modify: `src/pages/contact.astro:63-78, 156-164, 275-318`
- Create: `scripts/check-contact-form.mjs`
- Modify: `package.json`

### 구현

1. `phone`에 `inputmode="tel"`, 합리적인 `maxlength`, 국내 전화 형식을 허용하는 검증 규칙을 추가한다.
2. 하이픈·공백·괄호를 제거한 뒤 9~11자리 숫자인지 확인하는 단일 `isValidKoreanPhone()` 함수를 inline script에 추가한다.
3. `name`, `company`, `phone`, `email`, `preferredSchedule`, `message`에 Worker와 일치하는 `maxlength`를 둔다.
4. `form.checkValidity()` 다음에 전화번호 사용자 정의 오류를 적용한다.
5. 오류 시 `#formStatus`에 구체적인 안내를 표시하고 Worker fetch를 실행하지 않는다.
6. 기존 `response.ok && result.ok`, 성공 시 reset, 실패 시 mailto fallback은 변경하지 않는다.
7. Playwright 점검 스크립트로 다음을 검증한다.
   - `abc` → fetch 0건, 오류 안내
   - 빈 필수값 → fetch 0건
   - 잘못된 이메일 → fetch 0건
   - 정상 형식 → 요청을 브라우저에서 abort하고 실패 안내/mailto 분기 확인(실제 제출 금지)

**검증 명령:**
- `npm run build`
- `npm run check:contact-form`

**중단 조건:** 정상값까지 차단하거나 mailto fallback에 개인정보가 의도와 다르게 추가되면 수정 후 재검증한다.

---

## Task 3. CTA 색상 대비 수정

**Objective:** 모바일·데스크톱 CTA의 흰색 글자 대비를 4.5:1 이상으로 맞춘다.

**Files:**
- Modify: `src/styles/global.css:1538-1546, 1878-1890, 2376-2387, 2430-2452, 685-690`

### 구현

1. `#007aff` 기반 흰색 CTA를 기존 접근성 기준을 충족하는 더 어두운 공통 색상 토큰으로 통일한다.
2. `.nav-cta`, `.ty-inline-link`, `.mobile-choice-grid a`, `.mobile-quick-card.service > a`, `.consultation-submit`의 기본·hover·focus 상태를 함께 조정한다.
3. 커리어플래닝 두 번째 녹색 CTA는 별도로 대비를 측정하고 기준 미달일 때만 수정한다.
4. 디자인 전면 변경 없이 색상만 최소 수정한다.

**검증:**
- Lighthouse 모바일에서 color-contrast 실패 0건
- 390/768/1280px 실제 화면에서 버튼 위계와 focus ring 확인
- `npm run check:popovers`

---

## Task 4. 푸터 인증 카드 접근성 수정

**Objective:** 보이는 링크 문구와 accessible name을 일치시킨다.

**Files:**
- Modify: `src/components/Footer.astro:18-25`

### 구현

1. 현재 포괄적 `aria-label`을 제거하거나 실제 표시 문구가 포함된 이름으로 변경한다.
2. 새 창 안내는 화면낭독기 전용 문구로 제공한다.
3. 이미지 alt와 링크 전체 이름이 중복 낭독되지 않는지 확인한다.

**검증:** Lighthouse `label-content-name-mismatch` 0건, 키보드 Tab 접근 및 새 창 동작 정상.

---

## Task 5. favicon과 SNS 공유 이미지 추가

**Objective:** 브라우저 favicon 404를 없애고 공유 카드에 대표 이미지를 제공한다.

**Files:**
- Create: `public/favicon.ico`
- Create: `public/assets/careerservice-og-cover.png` (1200×630)
- Modify: `src/layouts/BaseLayout.astro:6-28`

### 구현

1. 공식 K·JOBS 로고와 현재 사이트 색상만 사용한 정적인 1200×630 대표 이미지를 만든다.
2. 이미지에는 과도한 정책 문구·기관 로고·확정되지 않은 지원 표현을 넣지 않는다.
3. BaseLayout에 favicon link, `og:image`, 크기, alt, `twitter:image`, `summary_large_image`를 추가한다.
4. URL은 `https://www.careerservice.co.kr/assets/careerservice-og-cover.png` 절대주소를 사용한다.

**검증:**
- build 결과 모든 주요 페이지에 메타가 존재
- favicon·OG 이미지 HTTP 200
- 1200×630 실제 크기 확인
- 카카오/텔레그램 공유 캐시는 배포 후 URL 또는 디버거로 별도 확인

---

## Task 6. 정적 사이트 회귀 검증과 1차 PR

**Objective:** 사이트 내부 핫픽스만 한 PR로 배포한다.

**Files:** Task 2~5 변경 파일만 포함

### 검증 명령

1. `npm ci`
2. `npm run build`
3. `npm run check:popovers`
4. `npm run check:contact-form`
5. built HTML에서 금지 문구 검색
6. 390/768/1280px 홈·문의·커리어플래닝·기업컨설팅 스크린샷 확인
7. Lighthouse 모바일 재실행
8. `git diff --check` 및 변경 파일 범위 확인

### 배포 게이트

- PR 생성 후 Actions 성공 확인
- 병합 후 custom domain에 cache-busting query로 확인
- `/`, `/contact/`, `/career-planning/`, `/favicon.ico`, OG 이미지, 다운로드 4개 확인
- 실서비스 문의는 테스트용 실제 제출 없이 요청 차단 방식으로 검증

---

## Task 7. Cloudflare Worker 서버 검증 별도 핫픽스

**Objective:** 클라이언트를 우회한 직접 요청도 차단한다.

**Files:** Worker 저장소/경로 확인 후 결정. 현재 Astro 저장소에 Worker 소스가 확인되지 않았으므로 추측하여 수정하지 않는다.

### 사전 확인

1. `kjobs-consultation-alert.kjobs-alert.workers.dev`의 소스 저장소와 배포 계정 확인
2. 현재 Origin allowlist, 필드 길이, 전화·이메일 검증, honeypot, rate limit, 로그·보관 정책 확인
3. Telegram 비밀값은 Cloudflare secret에만 존재하는지 확인

### 최소 보완

- 허용 Origin: `https://www.careerservice.co.kr` 중심
- POST + JSON만 허용
- 필수 필드·허용 enum·privacyConsent 검증
- 전화·이메일 형식과 필드 길이 제한
- honeypot 거부
- IP/시간 기준 best-effort KV throttle (KV get/put은 비원자적이며 강한 rate limit 보장이 아님)
- 오류 응답은 개인정보나 내부 구현을 노출하지 않음
- 로그에 상담 본문·연락처 전체를 장기 저장하지 않음

### 현재 방어 계층과 잔여 위험

- 현재 방어는 Origin allowlist, honeypot, payload/필드 길이·형식 검증, best-effort KV throttle을 계층적으로 적용한다.
- KV 카운터의 read-modify-write는 원자적이지 않으므로 동시 burst 요청은 동일 카운터를 읽어 제한을 초과할 수 있다. 이 핫픽스에서 atomic enforcement를 주장하지 않는다.
- 강한 동시 요청 제한은 후속 작업에서 Cloudflare native rate limiting 또는 Durable Object로 구현해야 한다.

### 검증

- 허용 Origin 정상 요청은 저장/전송 대신 테스트 환경 또는 dry-run으로 검증
- 잘못된 Origin, 전화, 이메일, 과대 payload, 반복 요청은 4xx/429
- 실제 Telegram 전달 1건이 필요할 경우 사용자 승인 후 별도 수행

**배포:** 사이트 PR과 분리하고 Worker rollback 버전 또는 배포 이력을 확보한다.

---

## Task 8. HTTP 보안 헤더 별도 운영 변경

**Objective:** GitHub Pages 앞단에서 브라우저 보안 헤더를 적용한다.

**영향 시스템:** Cloudflare DNS/Proxy 또는 Cloudflare Pages. Astro 메타 CSP만으로 HSTS·nosniff·frame-ancestors를 대체하지 않는다.

### 사전 확인

1. 현재 DNS·프록시 상태 및 메일 MX 영향 확인
2. Cloudflare 프록시 전환이 필요한지 확인
3. 기존 `<meta http-equiv="Content-Security-Policy">`와 YouTube·Worker 연결 호환성 확인

### 단계 적용

1. `X-Content-Type-Options: nosniff`
2. `Referrer-Policy: strict-origin-when-cross-origin`
3. `Permissions-Policy`에서 사용하지 않는 camera/microphone/geolocation 제한
4. CSP는 Report-Only로 먼저 관찰 후 enforce
5. `frame-ancestors 'none'` 또는 필요한 최소 범위
6. HTTPS 전체 경로 확인 후 HSTS 적용

### 검증

- 메인·YouTube iframe·문의 Worker·이미지·다운로드가 정상
- `curl -I`에서 헤더 확인
- 브라우저 콘솔 CSP 오류 0건
- MX/DNS 및 기존 custom domain 연결 영향 없음

---

## 권장 PR 순서

1. **PR 1 — 사이트 코드 핫픽스:** 전화번호 검증, 접근성, favicon, OG 이미지
2. **PR 2 — Worker 보안:** Worker 소스·권한 확인 후 서버 검증과 best-effort KV throttle
3. **운영 변경 1 — 보안 헤더:** Cloudflare 상태 확인 후 Report-Only → enforce

서로 다른 시스템을 한 번에 변경하지 않는다. PR 1 배포·검증 후 PR 2, 마지막으로 보안 헤더를 적용한다.

## 최종 보고 항목

- 변경 파일과 시스템
- build/Playwright/Lighthouse 결과
- live URL·asset·download HTTP 결과
- Worker 검증 결과와 실제 제출 여부
- 보안 헤더 적용값
- 복구 태그·PR·배포 상태
- 남은 위험
