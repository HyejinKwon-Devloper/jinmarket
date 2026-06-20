# Jinmarket Figma Import

현재 `shop-web` 구현 기준으로 Figma에 바로 가져갈 수 있게 만든 SVG 세트입니다.

## Files

- `jinmarket-shop-mobile-board.svg`
  - 전체 보드
  - 화면 프레임 6개와 컴포넌트 시트를 한 번에 봐야 할 때 사용
- `frames/*.svg`
  - 화면별 개별 프레임
  - Figma에서 각각 독립 프레임으로 다루기 좋음
- `components/jinmarket-shop-components.svg`
  - 버튼, 배지, 카드, 컬러, 타이포, 간격 기준 시트

## Recommended Figma Structure

1. `01 Foundations`
2. `02 Components`
3. `03 Mobile Frames`
4. `04 Explorations`

## Import Order

1. `components/jinmarket-shop-components.svg`를 먼저 import합니다.
2. `frames` 폴더의 SVG를 각각 import합니다.
3. 화면별로 필요한 버튼, 배지, 카드 블록을 복사해 새 컴포넌트로 만듭니다.
4. 마지막에 `jinmarket-shop-mobile-board.svg`는 전체 비교용 레퍼런스로만 두는 것을 권장합니다.

## Figma Work Tips

- SVG import 후 한 번만 정리해서 `Frame`으로 감싸면 이후 수정이 편합니다.
- 버튼, 배지, 카드, 입력 필드는 각각 `Create component`로 다시 묶는 것을 권장합니다.
- 텍스트와 간격을 손보기 전에 `Auto layout`을 먼저 적용하면 재조합이 쉬워집니다.
- 현재 SVG는 모바일 구매자 사이트 흐름 기준입니다.
  - 홈
  - 메뉴 열린 상태
  - 상품 상세
  - 내 구매
  - 로그인
  - 가위바위보 모달

## Source

- 생성 스크립트: [generate-figma-mobile-board.mjs](/C:/coding/jinmarket/scripts/generate-figma-mobile-board.mjs)
