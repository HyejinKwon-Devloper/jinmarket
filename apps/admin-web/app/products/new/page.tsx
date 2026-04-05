"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MAX_PRODUCT_IMAGES } from "@jinmarket/shared";
import type { ProductDetail, PurchaseType, SellerAccessOverview, SessionUser } from "@jinmarket/shared";

import { AnonymousRegistrationField } from "../../../components/AnonymousRegistrationField";
import { ManagedSellerAccessStatusPanel } from "../../../components/ManagedSellerAccessStatusPanel";
import { fetchCurrentUser, fetchSellerAccessOverview, hasSellerAccess, requestJson, uploadImages } from "../../../lib/api";

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function getDefaultSaleStartValue() {
  return toDateTimeLocalValue(new Date().toISOString());
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function sanitizePriceInput(value: string) {
  const digitsOnly = value.replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  return digitsOnly.replace(/^0+(?=\d)/, "");
}

function parsePriceKrwOrThrow(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error("가격은 숫자만 입력해 주세요.");
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error("가격은 숫자만 입력해 주세요.");
  }

  return parsed;
}

export default function NewProductPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null | undefined>(undefined);
  const [sellerAccessOverview, setSellerAccessOverview] = useState<SellerAccessOverview | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceKrw, setPriceKrw] = useState("10000");
  const [isFreeShare, setIsFreeShare] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowPriceOffer, setAllowPriceOffer] = useState(false);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("INSTANT_BUY");
  const [saleStartsAt, setSaleStartsAt] = useState(getDefaultSaleStartValue());
  const [isUnlimitedSalePeriod, setIsUnlimitedSalePeriod] = useState(true);
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);

  const loadUser = useCallback(async (cancelledRef?: { current: boolean }) => {
    const user = await fetchCurrentUser();

    if (cancelledRef?.current) {
      return;
    }

    setCurrentUser(user);

    if (!user) {
      setSellerAccessOverview(null);
      setMessage("로그인 후 상품을 등록할 수 있습니다.");
      return;
    }

    if (hasSellerAccess(user)) {
      setSellerAccessOverview({
        canSell: true,
        isAdmin: user.roles.includes("ADMIN"),
        latestRequest: null
      });
      setMessage(null);
      return;
    }

    const overview = await fetchSellerAccessOverview();

    if (cancelledRef?.current) {
      return;
    }

    setSellerAccessOverview(overview);
    setMessage(null);
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };

    void loadUser(cancelledRef).catch(() => {
      if (!cancelledRef.current) {
        setCurrentUser(null);
        setMessage("로그인 상태를 확인할 수 없습니다.");
      }
    });

    function handleRefresh() {
      void loadUser().catch(() => {
        setCurrentUser(null);
        setMessage("로그인 상태를 확인할 수 없습니다.");
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        handleRefresh();
      }
    }

    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelledRef.current = true;
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadUser]);

  function toggleFreeShare(checked: boolean) {
    setIsFreeShare(checked);

    if (checked) {
      setPriceKrw("0");
      setAllowPriceOffer(false);
      return;
    }

    if (priceKrw === "0") {
      setPriceKrw("1000");
    }
  }

  if (currentUser === undefined) {
    return <section className="panel">로그인 상태를 확인하는 중입니다...</section>;
  }

  if (!currentUser) {
    return (
      <section className="panel">
        <p className="eyebrow">Create Product</p>
        <h1>상품 등록</h1>
        <p className="muted">로그인한 판매자만 새 상품을 등록할 수 있습니다.</p>
        <div className="actionRow" style={{ marginTop: 18 }}>
          <button className="primaryButton" disabled type="button">
            상품 등록
          </button>
          <Link className="secondaryButton" href="/login?return_to=/products/new">
            로그인
          </Link>
        </div>
        {message ? <div className="message">{message}</div> : null}
      </section>
    );
  }

  if (!hasSellerAccess(currentUser) && !sellerAccessOverview?.canSell) {
    return (
      <ManagedSellerAccessStatusPanel
        overview={sellerAccessOverview}
        requesting={requestingApproval}
        onRequest={async () => {
          if (requestingApproval) {
            return;
          }

          try {
            setRequestingApproval(true);
            const response = await requestJson<{
              item: NonNullable<SellerAccessOverview["latestRequest"]>;
              message: string;
            }>("/admin/seller-access/me/request", { method: "POST" });
            setSellerAccessOverview((previous) => ({
              canSell: false,
              isAdmin: previous?.isAdmin ?? false,
              latestRequest: response.item
            }));
            setMessage(response.message);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "판매자 승인 신청에 실패했습니다.");
          } finally {
            setRequestingApproval(false);
          }
        }}
      />
    );
  }

  return (
    <>
      {message ? <div className="message">{message}</div> : null}
      <section className="panel">
        <p className="eyebrow">Create Product</p>
        <h1>상품 등록</h1>
        <p className="muted">첫 번째 이미지는 대표 이미지로 사용됩니다.</p>

      <div className="field">
        <label>상품명</label>
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>

      <div className="field">
        <label>설명</label>
        <textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={isFreeShare}
            onChange={(event) => toggleFreeShare(event.target.checked)}
          />
          무료 나눔 상품으로 등록하기
        </label>
        <p className="muted">무료 나눔으로 등록하면 가격은 0원으로 저장되고 가격 제안은 받을 수 없습니다.</p>
      </div>

      <AnonymousRegistrationField
        checked={isAnonymous}
        onChange={setIsAnonymous}
        helperText="활성화하면 구매자 사이트 목록과 상세에서 판매자 이름이 표시되지 않습니다."
      />

      <div className="field">
        <label>가격</label>
        <input
          className="input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="예: 7000"
          value={priceKrw}
          disabled={isFreeShare}
          onChange={(event) => setPriceKrw(sanitizePriceInput(event.target.value))}
        />
        <p className="muted">숫자만 입력하면 됩니다. 예: 7000</p>
      </div>

      <div className="field">
        <label>판매 방식</label>
        <select
          className="select"
          value={purchaseType}
          onChange={(event) => setPurchaseType(event.target.value as PurchaseType)}
        >
          <option value="INSTANT_BUY">즉시 구매로 판매하기</option>
          <option value="GAME_CHANCE">가위바위보로 판매하기</option>
        </select>
      </div>

      <div className="field">
        <label>판매 기간</label>
        <div className="field" style={{ marginTop: 10 }}>
          <label>판매 시작 일시</label>
          <input
            className="input"
            type="datetime-local"
            value={saleStartsAt}
            onChange={(event) => setSaleStartsAt(event.target.value)}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <input
            type="checkbox"
            checked={isUnlimitedSalePeriod}
            onChange={(event) => {
              setIsUnlimitedSalePeriod(event.target.checked);
              if (event.target.checked) {
                setSaleEndsAt("");
              }
            }}
          />
          무기한 판매
        </label>
        {!isUnlimitedSalePeriod ? (
          <div className="field" style={{ marginTop: 10 }}>
            <label>판매 종료 일시</label>
            <input
              className="input"
              type="datetime-local"
              value={saleEndsAt}
              onChange={(event) => setSaleEndsAt(event.target.value)}
            />
          </div>
        ) : null}
        <p className="muted">무기한을 끄면 구매 사이트에는 설정한 기간 동안만 상품이 노출됩니다.</p>
      </div>

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={allowPriceOffer}
            disabled={isFreeShare}
            onChange={(event) => setAllowPriceOffer(event.target.checked)}
          />
          네고 제안 받기
        </label>
      </div>

      <div className="field">
        <label>이미지 업로드</label>
        <input
          className="input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const nextFiles = Array.from(event.target.files ?? []).slice(0, MAX_PRODUCT_IMAGES);
            if ((event.target.files?.length ?? 0) > MAX_PRODUCT_IMAGES) {
              setMessage(`이미지는 최대 ${MAX_PRODUCT_IMAGES}장까지 업로드할 수 있습니다.`);
            } else {
              setMessage(null);
            }
            setFiles(nextFiles);
          }}
        />
        <p className="muted">최대 {MAX_PRODUCT_IMAGES}장까지 등록할 수 있습니다.</p>
      </div>

      <div className="actionRow" style={{ marginTop: 18 }}>
        <button
          className="primaryButton"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            setMessage(null);

            try {
              const user = await fetchCurrentUser();

              if (!user) {
                throw new Error("로그인이 필요합니다.");
              }

              if (files.length === 0) {
                throw new Error("이미지를 1장 이상 선택해 주세요.");
              }

              if (files.length > MAX_PRODUCT_IMAGES) {
                throw new Error(`이미지는 최대 ${MAX_PRODUCT_IMAGES}장까지 업로드할 수 있습니다.`);
              }

              const parsedPriceKrw = isFreeShare ? 0 : parsePriceKrwOrThrow(priceKrw);

              if (!isFreeShare && parsedPriceKrw <= 0) {
                throw new Error("무료 나눔이 아닌 상품 가격은 1원 이상으로 입력해 주세요.");
              }

              const saleStartsAtIso = toIsoDateTime(saleStartsAt);
              const saleEndsAtIso = isUnlimitedSalePeriod ? null : toIsoDateTime(saleEndsAt);

              if (!saleStartsAtIso) {
                throw new Error("판매 시작 일시를 입력해 주세요.");
              }

              if (!isUnlimitedSalePeriod && !saleEndsAtIso) {
                throw new Error("무기한 판매가 아니라면 판매 종료 일시를 입력해 주세요.");
              }

              if (saleEndsAtIso && new Date(saleEndsAtIso).getTime() <= new Date(saleStartsAtIso).getTime()) {
                throw new Error("판매 종료 일시는 판매 시작 일시보다 뒤여야 합니다.");
              }

              const images = await uploadImages(files);
              const response = await requestJson<{ item: ProductDetail }>("/admin/products", {
                method: "POST",
                body: JSON.stringify({
                  title,
                  description,
                  priceKrw: parsedPriceKrw,
                  isFreeShare,
                  isAnonymous,
                  allowPriceOffer,
                  purchaseType,
                  saleStartsAt: saleStartsAtIso,
                  saleEndsAt: saleEndsAtIso,
                  images
                })
              });

              router.push(`/products/${response.item.id}`);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "상품 등록에 실패했습니다.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "등록 중..." : "상품 등록"}
        </button>
      </div>

        {message ? <div className="message">{message}</div> : null}
      </section>
    </>
  );
}
