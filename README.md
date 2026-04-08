# Jinmarket

아이디/비밀번호 로그인, 이메일 인증 회원가입, 판매자 어드민, 구매자 쇼핑 화면을 포함한 벼룩시장 MVP입니다. 데이터베이스는 Supabase Postgres, 이미지 업로드는 Cloudinary를 사용합니다.

## Apps

- `apps/api`: 인증, 상품, 구매, 가위바위보 게임 구매 API
- `apps/shop-web`: 구매자용 웹 앱
- `apps/admin-web`: 판매자용 어드민 웹 앱

## Event + Random Game MVP

이벤트 운영 흐름은 `admin-web`과 `shop-web`로 나뉘어 동작합니다.

- `apps/admin-web/events`
  - 판매자가 이벤트를 등록합니다.
  - 등록 방식은 `직접 등록` 또는 `구매자 사이트에서 응모받기` 중 하나를 선택합니다.
  - 이벤트 명, 설명, 시작일/종료일, 이미지 4장까지 등록할 수 있습니다.
- `apps/shop-web/events`
  - 구매자 사이트의 `이벤트 존`에서 이벤트 카드 목록을 노출합니다.
  - 카드에는 대표 이미지 1장과 진행자 정보가 보입니다.
  - 상세 보기에서는 4장 이미지 캐러셀과 `응모하기` 버튼을 제공합니다.
- `apps/admin-web/random-game`
  - 판매자는 이벤트 상세에서 바로 랜덤 게임으로 진입할 수 있습니다.
  - `SHOP_ENTRY` 이벤트는 실제 응모자 리스트를 서버에서 불러와 잠금된 참가자 풀로 사용합니다.
  - `MANUAL` 이벤트는 랜덤 게임 설정 화면에서 현장 참가자를 직접 입력합니다.

구현 메모:

- 화면 흐름: `Start -> Setup -> Game -> Reveal`
- 상태 관리: `apps/admin-web/features/random-game/store`
- 도메인 로직:
  - 참가자 검증: `apps/admin-web/features/random-game/lib/participants.ts`
  - 공정 추첨: `apps/admin-web/features/random-game/lib/draw.ts`
  - 서버 추첨 라우트: `apps/admin-web/app/api/random-game/draw/route.ts`
  - 이벤트 응모자 소스: `packages/server/src/services/event-service.ts`
  - 게임 세션 생성: `apps/admin-web/features/random-game/lib/game-board.ts`
- 렌더링: UI는 Tailwind CSS, 화면 전환은 Framer Motion, 플레이 영역은 Canvas 기반
- 샘플 데이터: `apps/admin-web/features/random-game/data/sampleParticipants.ts`

구현 원칙:

- 추첨 로직은 Next.js Route Handler에서 서버 측 `crypto.randomInt` 기반으로 실행되고, 클라이언트는 결과 연출만 담당합니다.
- `SHOP_ENTRY` 이벤트는 응모 기록 ID 기준으로 서버에서 추첨하므로 같은 이름의 응모자가 있어도 정상 동작합니다.
- 결과 공개는 게임 완료 후 캐릭터 애니메이션과 중앙 당첨 카드 스태거 리빌로 이어집니다.
- `TODO` 주석으로 향후 보안 강화, 사운드, 이벤트 로깅, 관리자 모드 확장 지점을 남겨 두었습니다.

빠른 실행:

```bash
npm install
npm run dev --workspace @jinmarket/shop-web
npm run dev --workspace @jinmarket/admin-web
```

주요 확인 경로:

- 구매자 이벤트 존: `http://localhost:3000/events`
- 관리자 이벤트 목록: `https://jinmarket.test:3001/events`
- 관리자 랜덤 게임: `https://jinmarket.test:3001/random-game`

## Packages

- `packages/shared`: 공통 타입
- `packages/db`: Postgres 연결 유틸리티
- `packages/server`: API 서비스와 라우트 조합

## Environment

1. 로컬 개발은 [`.env.development.example`](C:/coding/jinmarket/.env.development.example), 배포 환경은 [`.env.example`](C:/coding/jinmarket/.env.example)를 기준으로 값을 채웁니다.
2. Supabase SQL Editor에서 [schema.sql](C:/coding/jinmarket/db/schema.sql)을 실행합니다.
3. 기존 스키마를 이미 올렸다면 [20260328_add_price_offers.sql](C:/coding/jinmarket/db/migrations/20260328_add_price_offers.sql)도 추가 적용합니다.
4. Cloudinary와 이메일 인증 메일 발송용 SMTP 값을 `.env`에 넣습니다.
5. 판매자 승인 화면을 사용할 관리자 계정의 로그인 아이디를 `SELLER_APPROVAL_ADMIN_LOGIN_ID`에, 2차 확인용 비밀번호를 `SELLER_APPROVAL_ADMIN_PASSWORD`에 설정합니다.
6. 프런트 앱은 `NEXT_PUBLIC_API_BASE_URL`을 기준으로 API에 직접 연결합니다.
7. Next의 `/api` 프록시 라우트를 계속 사용할 경우에는 `API_PROXY_TARGET`도 같은 API 주소로 맞춥니다.

환경별 권장 값:

- 로컬 개발
  - `NEXT_PUBLIC_API_BASE_URL=https://jinmarket.test:4000`
  - `API_PROXY_TARGET=https://jinmarket.test:4000`
  - `NEXT_PUBLIC_SHOP_APP_URL=https://jinmarket.test:3000`
  - `NEXT_PUBLIC_ADMIN_APP_URL=https://jinmarket.test:3001`
  - `SELLER_APPROVAL_ADMIN_LOGIN_ID=admin`
  - `SMTP_HOST=smtp.example.com`
  - `SMTP_PORT=587`
  - `SMTP_FROM_EMAIL=no-reply@example.com`
- 배포 환경
  - `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`
  - `API_PROXY_TARGET=https://api.example.com`
  - `NEXT_PUBLIC_SHOP_APP_URL=https://web.jinmarket.shop`
  - `NEXT_PUBLIC_ADMIN_APP_URL=https://management.jinmarket.shop`
  - `SELLER_APPROVAL_ADMIN_LOGIN_ID=admin`
  - `SMTP_HOST=smtp.example.com`
  - `SMTP_PORT=587`
  - `SMTP_FROM_EMAIL=no-reply@example.com`

## Local HTTPS

로컬 세션 쿠키 테스트는 `localhost` 대신 커스텀 HTTPS 도메인을 사용하는 편이 안전합니다. 현재 프로젝트 기본 도메인은 `jinmarket.test`입니다.

1. Windows `hosts` 파일에 `127.0.0.1 jinmarket.test`를 추가합니다.
2. 한 번만 `npm run dev:cert`를 실행해 로컬 HTTPS 인증서를 생성합니다.
3. SMTP 설정이 없으면 개발 환경에서는 API 콘솔 로그에 이메일 인증번호가 출력됩니다.

## Run

```bash
npm install
npm run dev:cert
npm run dev:api
npm run dev:shop
npm run dev:admin
```

접속 주소:

- 구매 사이트: `https://jinmarket.test:3000`
- 어드민 사이트: `https://jinmarket.test:3001`
- API 헬스체크: `https://jinmarket.test:4000/health`
