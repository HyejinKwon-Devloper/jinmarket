# Jinmarket

Threads 계정 기반 로그인, 판매자 어드민, 구매자 쇼핑 화면을 포함한 벼룩시장 MVP입니다. 데이터베이스는 Supabase Postgres, 이미지 업로드는 Cloudinary를 사용합니다.

## Apps

- `apps/api`: 인증, 상품, 구매, 가위바위보 게임 구매 API
- `apps/shop-web`: 구매자용 웹 앱
- `apps/admin-web`: 판매자용 어드민 웹 앱

## Packages

- `packages/shared`: 공통 타입
- `packages/db`: Postgres 연결 유틸리티
- `packages/server`: API 서비스와 라우트 조합

## Environment

1. 로컬 개발은 [`.env.development.example`](C:/coding/jinmarket/.env.development.example), 배포 환경은 [`.env.example`](C:/coding/jinmarket/.env.example)를 기준으로 값을 채웁니다.
2. Supabase SQL Editor에서 [schema.sql](C:/coding/jinmarket/db/schema.sql)을 실행합니다.
3. 기존 스키마를 이미 올렸다면 [20260328_add_price_offers.sql](C:/coding/jinmarket/db/migrations/20260328_add_price_offers.sql)도 추가 적용합니다.
4. Cloudinary와 Threads OAuth 관련 값을 `.env`에 넣습니다.
5. 판매자 승인 화면을 사용할 관리자 Threads 계정의 `SELLER_APPROVAL_ADMIN_THREADS_USER_ID`와 `SELLER_APPROVAL_ADMIN_PASSWORD`를 설정합니다.
6. 프런트 앱은 `NEXT_PUBLIC_API_BASE_URL`을 기준으로 API에 직접 연결합니다.
7. Next의 `/api` 프록시 라우트를 계속 사용할 경우에는 `API_PROXY_TARGET`도 같은 API 주소로 맞춥니다.

환경별 권장 값:

- 로컬 개발
  - `NEXT_PUBLIC_API_BASE_URL=https://jinmarket.test:4000`
  - `API_PROXY_TARGET=https://jinmarket.test:4000`
  - `NEXT_PUBLIC_SHOP_APP_URL=https://jinmarket.test:3000`
  - `NEXT_PUBLIC_ADMIN_APP_URL=https://jinmarket.test:3001`
  - `THREADS_REDIRECT_URI=https://jinmarket.test:4000/auth/callback`
- 배포 환경
  - `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`
  - `API_PROXY_TARGET=https://api.example.com`
  - `NEXT_PUBLIC_SHOP_APP_URL=https://web.jinmarket.shop`
  - `NEXT_PUBLIC_ADMIN_APP_URL=https://management.jinmarket.shop`
  - `THREADS_REDIRECT_URI=https://api.example.com/auth/callback`

## Local HTTPS

Threads 로컬 OAuth 테스트는 `localhost` 대신 커스텀 HTTPS 도메인을 사용하는 편이 안전합니다. 현재 프로젝트 기본 도메인은 `jinmarket.test`입니다.

1. Windows `hosts` 파일에 `127.0.0.1 jinmarket.test`를 추가합니다.
2. 한 번만 `npm run dev:cert`를 실행해 로컬 HTTPS 인증서를 생성합니다.
3. Meta 앱 대시보드에 `https://jinmarket.test:4000/auth/callback`를 Redirect URI로 등록합니다.

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
