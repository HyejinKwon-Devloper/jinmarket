# Jinmarket Admin Figma Import

현재 `admin-web` 구현 기준으로 만든 Figma import용 SVG 세트입니다.

## Files

- `jinmarket-admin-mobile-board.svg`
  - 관리자 전체 보드
  - 핵심 모바일 프레임 6개와 관리자용 컴포넌트 시트를 함께 봅니다.
- `frames/*.svg`
  - 화면별 개별 프레임
- `components/jinmarket-admin-components.svg`
  - 관리자용 버튼, 리스트 행, 제어 카드, 승인 패널, 이벤트 카드 패턴 시트

## Included Frames

1. Admin Login
2. Products
3. Product Detail
4. Create Product
5. Events
6. Orders

## Recommended Figma Structure

1. `11 Admin Foundations`
2. `12 Admin Components`
3. `13 Admin Mobile Frames`
4. `14 Admin Explorations`

## Import Order

1. `components/jinmarket-admin-components.svg`를 먼저 import합니다.
2. `frames` 폴더의 SVG를 각각 import합니다.
3. 리스트 행, 메타 셀, 승인 패널, 상세 제어 카드부터 `Create component`로 다시 묶습니다.
4. `jinmarket-admin-mobile-board.svg`는 전체 비교용 레퍼런스로 두는 것을 권장합니다.

## Notes

- 관리자 화면은 구매자 화면보다 정보량이 많아서 리스트 행과 제어 카드의 재사용성이 중요합니다.
- Figma에서는 `Auto layout`을 먼저 적용한 뒤 컴포넌트화하면 수정이 편합니다.
- 이 세트는 현재 구현의 핵심 흐름을 반영한 모바일 관리자 보드입니다.

## Source

- 생성 스크립트: [generate-figma-mobile-board.mjs](/C:/coding/jinmarket/scripts/generate-figma-mobile-board.mjs)
