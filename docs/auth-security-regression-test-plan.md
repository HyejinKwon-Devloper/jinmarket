# Auth Security Regression Test Plan

## Goal

Threads OAuth 로그인, 관리자 2차 비밀번호, 판매자 승인, 권한 분기, 개인정보 노출 방지가 현재 의도대로 동작하는지 점검한다.

## Test Data

아래 계정을 미리 준비한다.

- `buyer_user`
  역할: `BUYER`
- `seller_candidate`
  역할: `BUYER`
- `approved_seller`
  역할: `BUYER`, `SELLER`
- `admin_user`
  역할: `BUYER`, `SELLER`, `ADMIN`
  추가 조건: `SELLER_APPROVAL_ADMIN_PASSWORD` 값을 알고 있어야 함

아래 상품 데이터도 준비한다.

- `open_normal_product`
  판매자: `approved_seller`
  상태: `OPEN`
  `isAnonymous=false`
- `open_anonymous_product`
  판매자: `approved_seller`
  상태: `OPEN`
  `isAnonymous=true`
- `sold_normal_product`
  판매자: `approved_seller`
  구매자: `buyer_user`
  상태: 주문 존재
  `isAnonymous=false`
- `sold_anonymous_product`
  판매자: `approved_seller`
  구매자: `buyer_user`
  상태: 주문 존재
  `isAnonymous=true`
- `game_product`
  판매자: `approved_seller`
  상태: `OPEN`
  `purchaseType=GAME_CHANCE`

## Smoke Checks

### A1. 구매자 로그인 페이지 노출

- 경로: `/login`
- 단계:
  1. 비로그인 상태로 접속한다.
  2. Threads 로그인 버튼을 확인한다.
- 기대 결과:
  - Threads 로그인 버튼만 노출된다.
  - 로컬 비밀번호 입력 UI는 없다.

### A2. 판매자 로그인 페이지 노출

- 경로: `/admin/login`
- 단계:
  1. 비로그인 상태로 접속한다.
  2. Threads 로그인 버튼을 확인한다.
- 기대 결과:
  - Threads 로그인 버튼만 노출된다.
  - 로컬 비밀번호 입력 UI는 없다.

### A3. Threads 로그인 성공

- 대상: `buyer_user`
- 단계:
  1. `/login?return_to=/products/<productId>` 로 진입한다.
  2. Threads OAuth를 완료한다.
- 기대 결과:
  - 로그인 후 같은 origin의 `return_to` 경로로 이동한다.
  - `/me` 응답에 현재 사용자 정보가 담긴다.

### A4. 외부 return_to 차단

- 대상: 임의 비로그인 사용자
- 단계:
  1. `/login?return_to=https://evil.example/test` 로 진입한다.
  2. Threads OAuth를 완료한다.
- 기대 결과:
  - 외부 도메인으로 이동하지 않는다.
  - 구매자 사이트 기본 경로로 이동한다.

### A5. OAuth 실패 처리

- 단계:
  1. Threads 인증 화면에서 취소하거나, callback에 에러 파라미터를 넣어 진입한다.
- 기대 결과:
  - 로그인 페이지로 돌아온다.
  - 실패 메시지가 표시된다.

## Legacy Route Blocking

### B1. 로컬 로그인 차단

- API: `POST /auth/login`
- 본문: `{ "threadsUsername": "buyer_user", "password": "whatever" }`
- 기대 결과:
  - HTTP `410`
  - `code=THREADS_AUTH_REQUIRED`

### B2. 개발용 로그인 차단

- API: `POST /auth/dev-login`
- 기대 결과:
  - HTTP `403`
  - `code=DEV_LOGIN_DISABLED`

### B3. 비밀번호 설정 차단

- API: `POST /auth/password/setup`
- 기대 결과:
  - HTTP `410`
  - `code=THREADS_AUTH_REQUIRED`

### B4. 비밀번호 재설정 차단

- API: `POST /auth/password/reset`
- 기대 결과:
  - HTTP `410`
  - `code=THREADS_AUTH_REQUIRED`

## Session And Logout

### C1. 비로그인 사용자 세션 확인

- API: `GET /me`
- 기대 결과:
  - `user=null`

### C2. 로그아웃 시 세션 제거

- 대상: 로그인된 임의 사용자
- 단계:
  1. `POST /auth/logout`
  2. 바로 `GET /me`
- 기대 결과:
  - 로그아웃 응답은 성공한다.
  - 이후 `GET /me` 는 `user=null` 이다.

### C3. 로그아웃 시 관리자 2차 인증도 제거

- 대상: `admin_user`
- 단계:
  1. 관리자 2차 비밀번호까지 인증한다.
  2. `POST /auth/logout`
  3. 다시 로그인 후 `/admin/seller-access/auth` 조회
- 기대 결과:
  - 재로그인만으로는 `verified=false`
  - 승인 목록 접근 시 다시 비밀번호 확인이 필요하다.

## Role And Access Control

### D1. 구매자는 판매자 API 접근 불가

- 대상: `buyer_user`
- API:
  - `POST /uploads/sign`
  - `GET /admin/products`
  - `GET /admin/orders`
- 기대 결과:
  - 모두 HTTP `403`
  - 판매자 승인 필요 메시지가 반환된다.

### D2. 판매자는 판매자 API 접근 가능

- 대상: `approved_seller`
- API:
  - `POST /uploads/sign`
  - `GET /admin/products`
  - `GET /admin/orders`
- 기대 결과:
  - 모두 정상 응답

### D3. 일반 사용자는 승인 관리자 아님

- 대상: `buyer_user`
- API: `GET /admin/seller-access/auth`
- 기대 결과:
  - `{ eligible: false, verified: false }`

### D4. 관리자는 2차 비밀번호 전에는 승인 목록 접근 불가

- 대상: `admin_user`
- 단계:
  1. Threads 로그인만 완료한다.
  2. `GET /admin/seller-access`
- 기대 결과:
  - HTTP `401`
  - 관리자 비밀번호 확인 필요 메시지 반환

### D5. 관리자는 올바른 2차 비밀번호 후 승인 목록 접근 가능

- 대상: `admin_user`
- 단계:
  1. `POST /admin/seller-access/auth` 로 올바른 비밀번호 전송
  2. `GET /admin/seller-access`
- 기대 결과:
  - 인증 응답은 성공한다.
  - 승인 목록이 반환된다.

### D6. 관리자 비밀번호 오입력

- 대상: `admin_user`
- 단계:
  1. `POST /admin/seller-access/auth` 로 잘못된 비밀번호 전송
- 기대 결과:
  - HTTP `401`
  - 승인 목록 쿠키가 발급되지 않는다.

## Seller Approval Flow

### E1. 판매자 승인 요청 생성

- 대상: `seller_candidate`
- 단계:
  1. `GET /admin/seller-access/me`
  2. `POST /admin/seller-access/me/request`
- 기대 결과:
  - 요청 생성 성공
  - overview의 latestRequest 상태가 `PENDING`

### E2. 중복 pending 요청 방지

- 대상: `seller_candidate`
- 단계:
  1. pending 상태에서 다시 `POST /admin/seller-access/me/request`
- 기대 결과:
  - 새 row를 추가하지 않고 기존 pending 요청을 돌려준다.

### E3. 이미 판매자인 사용자는 승인 요청 불가

- 대상: `approved_seller`
- 단계:
  1. `POST /admin/seller-access/me/request`
- 기대 결과:
  - HTTP `409`

### E4. 관리자 승인 처리

- 대상:
  - 요청자: `seller_candidate`
  - 승인자: `admin_user`
- 단계:
  1. `admin_user` 가 2차 비밀번호 인증 완료
  2. `POST /admin/seller-access/:requestId/approve`
  3. `seller_candidate` 로 다시 로그인 후 `GET /admin/seller-access/me`
- 기대 결과:
  - 요청 상태가 `APPROVED`
  - 요청자에게 `SELLER` role 이 부여된다.
  - `canSell=true`

### E5. 이미 처리된 요청 재승인 차단

- 단계:
  1. 같은 `requestId` 로 다시 approve 호출
- 기대 결과:
  - HTTP `409`

## Product Privacy

### F1. 공개 상품 목록 기본 노출

- API: `GET /products`
- 기대 결과:
  - `OPEN` 이고 판매중인 상품만 보인다.

### F2. 익명 상품은 제3자에게 sellerId 비노출

- 대상: 비로그인 사용자 또는 제3자
- API: `GET /products/:productId`
- 대상 상품: `open_anonymous_product`
- 기대 결과:
  - `sellerId=null`
  - `sellerDisplayName=null`

### F3. 익명 상품은 소유자에게 sellerId 노출

- 대상: `approved_seller`
- API: `GET /products/:productId`
- 대상 상품: `open_anonymous_product`
- 기대 결과:
  - 자신의 `sellerId` 를 볼 수 있다.

### F4. 판매 완료 상품의 구매자 정보는 제3자에게 비노출

- 대상: 비로그인 사용자 또는 제3자
- API: `GET /products/:productId`
- 대상 상품: `sold_normal_product`
- 기대 결과:
  - `soldOrder=null`

### F5. 판매 완료 상품의 구매자 정보는 구매자에게 노출

- 대상: `buyer_user`
- API: `GET /products/:productId`
- 대상 상품: `sold_normal_product`
- 기대 결과:
  - `soldOrder` 가 보인다.
  - 자신의 주문 정보만 보인다.

### F6. 판매 완료 상품의 구매자 정보는 판매자에게 노출

- 대상: `approved_seller`
- API: `GET /products/:productId`
- 대상 상품: `sold_normal_product`
- 기대 결과:
  - `soldOrder` 가 보인다.

### F7. 게임 시도 기록은 본인만 확인

- 대상:
  - `buyer_user`
  - 제3자
- API: `GET /products/:productId`
- 대상 상품: `game_product`
- 기대 결과:
  - `buyer_user` 는 자신의 `myGameAttempt` 를 본다.
  - 제3자는 `myGameAttempt=null`

## Seller Functions Regression

### G1. 판매자는 상품 생성 가능

- 대상: `approved_seller`
- API: `POST /admin/products`
- 기대 결과:
  - 상품이 생성된다.

### G2. 일반 사용자는 상품 생성 불가

- 대상: `buyer_user`
- API: `POST /admin/products`
- 기대 결과:
  - HTTP `403`

### G3. 판매자는 본인 상품만 수정 가능

- 대상:
  - `approved_seller`
  - 다른 판매자 계정
- API: `PATCH /admin/products/:productId`
- 기대 결과:
  - 본인 상품 수정은 성공
  - 타인 상품 수정은 실패

### G4. 주문 있는 상품 삭제 제한

- 대상: `approved_seller`
- 대상 상품: `sold_normal_product`
- API: `DELETE /admin/products/:productId`
- 기대 결과:
  - HTTP `409`

### G5. 가격 제안 자기 상품 금지

- 대상: `approved_seller`
- API: `POST /products/:productId/price-offers`
- 대상 상품: 자신의 상품
- 기대 결과:
  - HTTP `400`

### G6. 구매 내역은 본인 것만 확인

- 대상: `buyer_user`
- API: `GET /me/orders`
- 기대 결과:
  - 본인 주문만 보인다.

### G7. 판매 주문 내역은 본인 판매분만 확인

- 대상: `approved_seller`
- API: `GET /admin/orders`
- 기대 결과:
  - 본인 판매 상품의 주문만 보인다.

## Security Regression

### H1. 승인 목록은 API 직접 호출로도 우회 불가

- 대상: `admin_user`
- 단계:
  1. Threads 로그인만 완료
  2. 브라우저 UI를 거치지 않고 `GET /admin/seller-access`
- 기대 결과:
  - HTTP `401`

### H2. 승인 처리도 2차 비밀번호 없이는 불가

- 대상: `admin_user`
- 단계:
  1. Threads 로그인만 완료
  2. `POST /admin/seller-access/:requestId/approve`
- 기대 결과:
  - HTTP `401`

### H3. 일반 사용자는 승인 목록 우회 불가

- 대상: `buyer_user`
- API:
  - `GET /admin/seller-access`
  - `POST /admin/seller-access/auth`
  - `POST /admin/seller-access/:requestId/approve`
- 기대 결과:
  - 모두 우회 불가

### H4. 허용되지 않은 origin 차단

- 단계:
  1. allowlist에 없는 origin에서 API 호출
- 기대 결과:
  - CORS 차단
  - 서버 로그에 blocked origin 이 기록된다.

## Recommended Run Order

운영 전 최소 확인 순서는 아래를 권장한다.

1. `A1-A5`
2. `B1-B4`
3. `C1-C3`
4. `D1-D6`
5. `E1-E5`
6. `F1-F7`
7. `G1-G7`
8. `H1-H4`

## Release Gate

아래 중 하나라도 실패하면 배포 보류로 본다.

- Threads OAuth 로그인 실패
- 외부 `return_to` 로 리다이렉트 발생
- `/auth/dev-login` 또는 `/auth/login` 우회 가능
- 비관리자가 승인 목록 또는 승인 API 접근 가능
- 관리자 2차 비밀번호 없이 승인 목록 접근 가능
- 제3자가 판매 완료 상품의 구매자 정보를 볼 수 있음
- 일반 사용자가 판매자 API에 접근 가능
