# 뉴스·동향 운영 경계

## 현재 상태
- `/news-trends/`는 기존 정책 검색 게시판의 표시·검색·페이지 규칙을 따릅니다. 정책 페이지는 변경하지 않았습니다.
- `src/data/news.js`의 운영 배열은 비어 있습니다. 승인 전 실제·가상 기사를 게시하지 않습니다.
- 승인 주제: 재취업지원 / 중장년고용 / 퇴직/전직지원 / 기업경력지원.
- 개인정보와 신청자 사례는 익명화 여부와 관계없이 금지합니다. 초안도 이 저장소에 넣지 않습니다.

## 개별 게시 승인
1. 원문·발표기관·발표일·URL을 검토하고 제목·요약·본문을 자체 문장으로 작성합니다. 출처의 이미지·기사 전문을 복제하지 않습니다.
2. 공개할 **정확한 항목별 문안**에 대한 사용자의 명시적 승인을 확보합니다. 메뉴 구현 승인은 기사 게시 승인이 아닙니다.
3. 승인 기록 원본은 비공개 운영 기록에 보관합니다. 저장소에는 개인정보 없는 참조 ID만 넣습니다. 개인정보·신청자 사례 부재는 사람이 문안 전체를 점검해야 합니다. 코드의 boolean은 자동 개인정보 탐지기가 아닙니다.
4. `newsEntries`에 고유 `id`, ASCII `slug`, `status`, `category`, `title`, `summary`, `source`, `sourceTitle`, HTTPS `sourceUrl`, `sourceDate`, 실제 `publishedAt`/`modifiedAt`, `checkedAt`, `sections: [{ heading, paragraphs: [] }]`를 사용합니다. 모든 날짜는 YYYY-MM-DD입니다.
5. `approval`은 `decision: 'approved'`, 비공개 승인기록 `reference`, 승인 `date`, `noPersonalData: true`, `noApplicantStories: true`, `contentDigest(entry)`의 해시를 가져야 합니다. 해시 생성 자체는 승인이 아닙니다. 실제 승인 없이 이를 채우지 않습니다. 문안이 바뀌면 해시가 무효화되므로 다시 승인받습니다.
6. `status: 'published'` 항목에 승인/검증이 없으면 빌드가 실패합니다. 다른 상태는 목록·검색·상세 경로·사이트맵에서 제외됩니다. llms.txt는 목록 URL만 안내하여 초안 개별 링크가 자동 노출되지 않습니다.
7. 게시 후 사용할 날짜와 기사별 사이트맵 lastmod는 실제 게시/수정일이어야 합니다. 목록 내용이 바뀌면 `astro.config.mjs`의 목록 lastmod도 갱신합니다.
8. build/검색/상세/반응형/독립검토 통과 후 별도의 push·PR·배포 승인을 받습니다. 현재 작업은 로컬 전용입니다.

## 검증
```sh
npm ci
npm run build
npm run check:search-ai
NEWS_EVIDENCE_DIR=/absolute/evidence/path node scripts/check-news-trends.mjs
```

테스트는 운영 배열이 비어 있는 현재 출시 전 상태를 명시적으로 검증합니다. 첫 실제 승인 게시 때 이 단언을 승인된 기사 수/ID 명세로 바꾸고 검토해야 합니다. 시험용 문구는 TEST ONLY로 표시하며 `NEWS_EVIDENCE_DIR/fixture-site-*` 별도 복사본에서만 빌드합니다. 운영 src/dist에 주입하지 않습니다. 시험 결과물을 배포하지 않습니다. 운영 데이터에는 테스트 모드나 환경변수 우회 경로가 없습니다.

상세는 공통 `NewsArticle.astro`를 이용하여 정책 상세의 CSS, 출처 박스, breadcrumb, Article JSON-LD를 재사용합니다. 목록은 정책 템플릿을 범위 분리하여 복제했으므로 정책 게시판의 후속 접근성/동작 변경 시 양쪽 회귀검사를 실행합니다.
