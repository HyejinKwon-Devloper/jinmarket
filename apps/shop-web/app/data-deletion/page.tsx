export const metadata = {
  title: "데이터 삭제 안내 | 진의 벼룩시장",
  description: "진의 벼룩시장 계정 및 데이터 삭제 요청 안내"
};

export default function DataDeletionPage() {
  return (
    <section className="panel legalPage">
      <p className="eyebrow">Data Deletion</p>
      <h1>데이터 삭제 안내</h1>
      <p className="legalMeta">최종 업데이트: 2026년 4월 8일</p>

      <p>
        서비스 이용자는 이메일 인증을 거쳐 생성된 계정 정보와 서비스 내 거래 데이터를 삭제 요청할 수 있습니다.
      </p>

      <h2>1. 삭제 요청 대상</h2>
      <ul>
        <li>아이디/비밀번호 로그인 계정 정보</li>
        <li>등록한 상품 정보와 이미지</li>
        <li>주문 정보, 가격 제안 기록, 게임 구매 기록</li>
      </ul>

      <h2>2. 요청 방법</h2>
      <ul>
        <li>운영자에게 로그인 아이디, 가입 이메일, 계정 식별 정보를 포함해 삭제를 요청합니다.</li>
        <li>본인 확인 후 관련 데이터를 삭제하거나 비식별화 처리합니다.</li>
      </ul>

      <h2>3. 처리 시 유의사항</h2>
      <ul>
        <li>거래 분쟁 대응이나 법적 보관 의무가 있는 데이터는 즉시 삭제되지 않을 수 있습니다.</li>
        <li>삭제가 완료되면 동일한 아이디나 이메일로 다시 가입하더라도 새 계정으로 처리됩니다.</li>
      </ul>

      <h2>4. 문의</h2>
      <p>
        삭제 요청 이메일: <strong>hanj8980@naver.com</strong>
      </p>
    </section>
  );
}
