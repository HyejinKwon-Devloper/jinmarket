import nodemailer from "nodemailer";

import { env } from "../env.js";
import { buildTransactionalMailTemplate } from "./mail-templates.js";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS
        }
      : undefined
  });

  return transporter;
}

async function sendMail(message: nodemailer.SendMailOptions, fallbackLog: string) {
  if (!env.SMTP_HOST || !env.SMTP_FROM_EMAIL) {
    console.info(fallbackLog);
    return { delivered: false as const };
  }

  await getTransporter().sendMail({
    from: env.SMTP_FROM_NAME
      ? `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`
      : env.SMTP_FROM_EMAIL,
    ...message
  });

  return { delivered: true as const };
}

function buildCodeMail(input: {
  eyebrow: string;
  title: string;
  intro: string;
  code: string;
  loginId?: string | null;
  accentColor: string;
}) {
  return buildTransactionalMailTemplate({
    preheader: `${input.title} 안내 메일입니다.`,
    eyebrow: input.eyebrow,
    title: input.title,
    intro: input.intro,
    paragraphs: ["아래 인증번호를 입력하면 다음 단계로 안전하게 진행할 수 있습니다."],
    code: input.code,
    codeLabel: "인증번호",
    details: [
      ...(input.loginId
        ? [
            {
              label: "로그인 아이디",
              value: input.loginId
            }
          ]
        : []),
      {
        label: "유효 시간",
        value: `${env.SIGNUP_VERIFICATION_CODE_TTL_MINUTES}분`
      }
    ],
    footer: "본인이 요청한 메일이 아니라면 아무 조치 없이 이 메일을 무시하셔도 됩니다.",
    accentColor: input.accentColor
  });
}

export async function sendSignupVerificationCode(input: {
  email: string;
  loginId: string;
  displayName: string;
  code: string;
}) {
  const template = buildCodeMail({
    eyebrow: "회원가입 인증",
    title: "회원가입 인증번호",
    intro: `${input.displayName}님, Jinmarket 회원가입을 마무리하려면 아래 인증번호를 입력해 주세요.`,
    code: input.code,
    loginId: input.loginId,
    accentColor: "#0f766e"
  });

  return sendMail(
    {
      to: input.email,
      subject: "[Jinmarket] 회원가입 인증번호 안내",
      text: template.text,
      html: template.html
    },
    `[signup-verification] skipped email=${input.email} loginId=${input.loginId} reason=smtp-not-configured`
  );
}

export async function sendSellerPortalVerificationCode(input: {
  email: string;
  loginId?: string | null;
  displayName: string;
  code: string;
}) {
  const template = buildCodeMail({
    eyebrow: "판매자 이메일 인증",
    title: "판매자 이메일 인증번호",
    intro: `${input.displayName}님, 판매자 사이트 이용을 위해 이메일 인증을 완료해 주세요.`,
    code: input.code,
    loginId: input.loginId,
    accentColor: "#1d4ed8"
  });

  return sendMail(
    {
      to: input.email,
      subject: "[Jinmarket] 판매자 이메일 인증번호 안내",
      text: template.text,
      html: template.html
    },
    `[seller-email-verification] skipped email=${input.email} loginId=${input.loginId ?? ""} reason=smtp-not-configured`
  );
}

export async function sendBuyerEmailVerificationCode(input: {
  email: string;
  loginId?: string | null;
  displayName: string;
  code: string;
}) {
  const template = buildCodeMail({
    eyebrow: "구매자 이메일 인증",
    title: "복구 이메일 인증번호",
    intro: `${input.displayName}님, 구매자 계정에 복구 이메일을 등록하려면 아래 인증번호를 입력해 주세요.`,
    code: input.code,
    loginId: input.loginId,
    accentColor: "#0f766e"
  });

  return sendMail(
    {
      to: input.email,
      subject: "[Jinmarket] 복구 이메일 인증번호 안내",
      text: template.text,
      html: template.html
    },
    `[buyer-email-verification] skipped email=${input.email} loginId=${input.loginId ?? ""} reason=smtp-not-configured`
  );
}

export async function sendBuyerAccountActivationCode(input: {
  email: string;
  loginId: string;
  displayName: string;
  code: string;
}) {
  const template = buildCodeMail({
    eyebrow: "계정 복구",
    title: "계정 복구 인증번호",
    intro: `${input.displayName}님, 계정에 이메일을 등록하거나 비밀번호를 설정 또는 재설정하려면 아래 인증번호를 입력해 주세요.`,
    code: input.code,
    loginId: input.loginId,
    accentColor: "#0f766e"
  });

  return sendMail(
    {
      to: input.email,
      subject: "[Jinmarket] 계정 복구 인증번호",
      text: template.text,
      html: template.html
    },
    `[buyer-account-activation] skipped email=${input.email} loginId=${input.loginId} reason=smtp-not-configured`
  );
}

export async function sendPasswordResetCode(input: {
  email: string;
  loginId?: string | null;
  displayName: string;
  code: string;
}) {
  const template = buildCodeMail({
    eyebrow: "비밀번호 재설정",
    title: "비밀번호 재설정 인증번호",
    intro: `${input.displayName}님, 비밀번호를 다시 설정하려면 아래 인증번호를 입력해 주세요.`,
    code: input.code,
    loginId: input.loginId,
    accentColor: "#b45309"
  });

  return sendMail(
    {
      to: input.email,
      subject: "[Jinmarket] 비밀번호 재설정 인증번호",
      text: template.text,
      html: template.html
    },
    `[password-reset] skipped email=${input.email} loginId=${input.loginId ?? ""} reason=smtp-not-configured`
  );
}

export async function sendLegacyAccountActivationCode(input: {
  email: string;
  loginId: string;
  displayName: string;
  code: string;
}) {
  const template = buildCodeMail({
    eyebrow: "기존 계정 전환",
    title: "기존 계정 전환 인증번호",
    intro: `${input.displayName}님, 기존 Threads 계정을 새 로그인 방식으로 전환하려면 아래 인증번호를 입력해 주세요.`,
    code: input.code,
    loginId: input.loginId,
    accentColor: "#7c3aed"
  });

  return sendMail(
    {
      to: input.email,
      subject: "[Jinmarket] 기존 계정 전환 인증번호",
      text: template.text,
      html: template.html
    },
    `[legacy-account-activation] skipped email=${input.email} loginId=${input.loginId} reason=smtp-not-configured`
  );
}

export async function sendSellerOrderNotification(input: {
  sellerEmail: string | null;
  sellerDisplayName: string;
  sellerLoginId?: string | null;
  buyerDisplayName: string;
  buyerLoginId?: string | null;
  productTitle: string;
  orderTypeLabel: string;
  orderedAt: string;
  isFreeShare: boolean;
}) {
  if (!input.sellerEmail) {
    return { delivered: false as const };
  }

  const buyerLabel =
    input.buyerLoginId && input.buyerLoginId !== input.buyerDisplayName
      ? `${input.buyerLoginId} (${input.buyerDisplayName})`
      : input.buyerLoginId ?? input.buyerDisplayName;

  const template = buildTransactionalMailTemplate({
    preheader: input.isFreeShare
      ? "새 무료나눔 요청이 도착했습니다."
      : "새 구매 요청이 도착했습니다.",
    eyebrow: input.isFreeShare ? "무료나눔 요청" : "구매 요청",
    title: input.isFreeShare ? "새 무료나눔 요청이 도착했어요" : "새 구매 요청이 도착했어요",
    intro: `${input.sellerDisplayName}님, 등록한 상품에 새로운 요청이 들어왔습니다.`,
    paragraphs: [
      input.isFreeShare
        ? "판매자 사이트에서 무료나눔 요청 내용을 확인하고 진행해 주세요."
        : "판매자 사이트에서 주문 내용을 확인하고 이어서 처리해 주세요."
    ],
    details: [
      {
        label: "상품명",
        value: input.productTitle
      },
      {
        label: "요청 유형",
        value: input.orderTypeLabel
      },
      {
        label: "구매자",
        value: buyerLabel
      },
      {
        label: "요청 시각",
        value: new Date(input.orderedAt).toLocaleString("ko-KR")
      },
      ...(input.sellerLoginId
        ? [
            {
              label: "판매자 계정",
              value: input.sellerLoginId
            }
          ]
        : [])
    ],
    footer: "판매자 사이트의 주문 관리 화면에서 이어서 처리할 수 있습니다.",
    accentColor: input.isFreeShare ? "#7c3aed" : "#0f766e"
  });

  return sendMail(
    {
      to: input.sellerEmail,
      subject: input.isFreeShare
        ? `[Jinmarket] 무료나눔 요청 도착 - ${input.productTitle}`
        : `[Jinmarket] 구매 요청 도착 - ${input.productTitle}`,
      text: template.text,
      html: template.html
    },
    `[seller-order-notification] skipped sellerEmail=${input.sellerEmail} productTitle=${input.productTitle} buyer=${buyerLabel} reason=smtp-not-configured`
  );
}
