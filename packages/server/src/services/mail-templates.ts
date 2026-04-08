type MailDetail = {
  label: string;
  value: string;
};

type TransactionalMailTemplateInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  paragraphs?: string[];
  details?: MailDetail[];
  code?: string;
  codeLabel?: string;
  footer?: string;
  accentColor?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderParagraphs(paragraphs: string[]) {
  return paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.9;color:#3f342b;">${escapeHtml(
          paragraph
        )}</p>`
    )
    .join("");
}

function renderDetails(details: MailDetail[]) {
  if (!details.length) {
    return "";
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:collapse;background:#fff8ef;border:1px solid #eadaca;border-radius:18px;overflow:hidden;">
      ${details
        .map(
          (detail, index) => `
            <tr>
              <td style="padding:14px 18px;${index ? "border-top:1px solid #eadaca;" : ""}font-size:13px;line-height:1.6;color:#7b5e45;vertical-align:top;">
                ${escapeHtml(detail.label)}
              </td>
              <td style="padding:14px 18px;${index ? "border-top:1px solid #eadaca;" : ""}font-size:14px;line-height:1.7;color:#2f241c;text-align:right;font-weight:700;vertical-align:top;">
                ${escapeHtml(detail.value)}
              </td>
            </tr>
          `
        )
        .join("")}
    </table>
  `;
}

function renderText(details: MailDetail[], input: TransactionalMailTemplateInput) {
  const lines = ["Jinmarket", "", input.eyebrow, "", input.title, "", input.intro];

  for (const paragraph of input.paragraphs ?? []) {
    lines.push("", paragraph);
  }

  if (input.code) {
    lines.push("", `${input.codeLabel ?? "인증번호"}: ${input.code}`);
  }

  if (details.length) {
    lines.push("", ...details.map((detail) => `${detail.label}: ${detail.value}`));
  }

  if (input.footer) {
    lines.push("", input.footer);
  }

  lines.push("", "Jinmarket 드림");

  return lines.join("\n");
}

export function buildTransactionalMailTemplate(input: TransactionalMailTemplateInput) {
  const accentColor = input.accentColor ?? "#0f766e";
  const details = input.details ?? [];
  const paragraphHtml = renderParagraphs(input.paragraphs ?? []);
  const detailsHtml = renderDetails(details);
  const codeHtml = input.code
    ? `
      <div style="margin-top:24px;padding:20px 16px;background:#fff7ed;border:1px solid #eadaca;border-radius:18px;text-align:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.5);">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7b5e45;">
          ${escapeHtml(input.codeLabel ?? "인증번호")}
        </div>
        <div style="margin-top:12px;font-size:34px;line-height:1.1;font-weight:800;letter-spacing:0.24em;color:#2f241c;">
          ${escapeHtml(input.code)}
        </div>
      </div>
    `
    : "";

  const footerHtml = input.footer
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.8;color:#7b5e45;">${escapeHtml(
        input.footer
      )}</p>`
    : "";

  return {
    text: renderText(details, input),
    html: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#ede7df;font-family:'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">
      ${escapeHtml(input.preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ede7df;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:separate;background:#ead8c2;border:1px solid #d3bea5;border-radius:28px;overflow:hidden;box-shadow:0 18px 48px rgba(75,56,36,0.12);">
            <tr>
              <td style="padding:24px 24px 14px;background:linear-gradient(180deg, #f3e7d7 0%, #ead8c2 100%);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="font-size:13px;line-height:1.7;color:#7b5e45;vertical-align:top;">
                      <div style="font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#3b2f26;">
                        Jinmarket Letter
                      </div>
                      <div style="margin-top:10px;">진룩시장에서 전하는 작은 거래 소식</div>
                      <div>받는 분께 안전하게 전달되는 안내 메일입니다.</div>
                    </td>
                    <td align="right" style="vertical-align:top;">
                      <div style="display:inline-block;padding:10px 12px;border:1px solid rgba(17,24,39,0.12);border-radius:14px;background:#fff8ef;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.5);">
                        <div style="width:52px;height:64px;border-radius:10px;background:linear-gradient(180deg, ${accentColor}, #f59e0b);padding:1px;">
                          <div style="height:100%;border-radius:9px;border:1px dashed rgba(255,255,255,0.7);"></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 18px 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#fffdf8;border:1px solid #dfd0bf;border-radius:24px;overflow:hidden;box-shadow:0 10px 24px rgba(70,52,35,0.08);">
                  <tr>
                    <td style="padding:0 30px;background:#fff7ed;">
                      <div style="height:14px;border-bottom:2px solid ${accentColor};"></div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px;">
                      <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#fff8ef;border:1px solid #eadaca;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accentColor};">
                        ${escapeHtml(input.eyebrow)}
                      </div>
                      <h1 style="margin:18px 0 0;font-size:30px;line-height:1.3;font-weight:800;color:#2f241c;">
                        ${escapeHtml(input.title)}
                      </h1>
                      <div style="margin-top:12px;width:72px;height:3px;background:${accentColor};border-radius:999px;"></div>
                      <p style="margin:20px 0 12px;font-size:15px;line-height:1.9;color:#3f342b;">${escapeHtml(
                        input.intro
                      )}</p>
                      ${paragraphHtml}
                      ${codeHtml}
                      ${detailsHtml}
                      ${footerHtml}
                      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #eadaca;font-size:13px;line-height:1.8;color:#7b5e45;">
                        Jinmarket 드림<br />
                        메일이 보이지 않는다면 스팸함이나 프로모션함도 함께 확인해 주세요.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  };
}
