import { requestJson } from "./api";

/**
 * 현재 브라우저(서비스워커)에 남아있는 웹 푸시 구독을 해제한다.
 *
 * endpoint는 로그인 계정이 아니라 브라우저에 귀속되므로, 로그아웃 시 정리하지 않으면
 * 같은 기기에서 다른 계정이 로그인할 때 이전 계정의 구독 행이 그대로 남아 푸시가
 * 잘못 전달될 수 있다. 로그아웃 시 서버 구독 행을 삭제하고 브라우저 구독도 해제한다.
 *
 * 세션이 아직 유효할 때(즉 /auth/logout 호출 이전) 실행해야 DELETE 요청이 인증된다.
 * 실패 시 예외를 던지므로, 호출부에서 사용자 피드백/무시 여부를 결정한다.
 */
export async function unsubscribeLocalPush() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();

  if (!registration) {
    return;
  }

  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  await requestJson("/me/push-subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
