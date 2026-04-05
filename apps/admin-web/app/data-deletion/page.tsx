export const metadata = {
  title: "데이터 삭제 안내 | 진의 벼룩시장 판매자 사이트",
  description: "진의 벼룩시장 판매자 사이트 계정 및 데이터 삭제 요청 안내",
};

export default function DataDeletionPage() {
  return (
    <section className="panel legalPage">
      <p className="eyebrow">Data Deletion</p>
      <h1>데이터 삭제 안내</h1>
      <p className="legalMeta">최종 업데이트: 2026년 3월 29일</p>

      <p>
        서비스 이용자는 Threads 로그인으로 생성된 계정 정보와 판매자 사이트에서
        생성된 데이터 삭제를 요청할 수 있습니다.
      </p>

      <h2>1. 삭제 요청 대상</h2>
      <ul>
        <li>Threads 로그인으로 생성된 계정 정보</li>
        <li>등록한 상품 정보와 이미지 메타데이터</li>
        <li>주문 정보, 가격 제안 기록, 가위바위보 도전 기록</li>
      </ul>

      <h2>2. 요청 방법</h2>
      <ul>
        <li>
          운영자에게 Threads username 또는 계정 식별 정보를 포함해 삭제를
          요청합니다.
        </li>
        <li>본인 확인 후 관련 데이터 삭제 또는 비식별화 절차를 진행합니다.</li>
      </ul>

      <h2>3. 처리 시 유의사항</h2>
      <ul>
        <li>
          거래 분쟁 대응이나 법적 의무가 있는 데이터는 즉시 삭제되지 않을 수
          있습니다.
        </li>
        <li>
          삭제가 완료되면 동일 Threads 계정으로 다시 로그인할 때 새 계정처럼
          처리될 수 있습니다.
        </li>
      </ul>

      <h2>4. 문의</h2>
      <p>
        삭제 요청 이메일: <strong>hanj8980@naver.com</strong>
      </p>
    </section>
  );
}
