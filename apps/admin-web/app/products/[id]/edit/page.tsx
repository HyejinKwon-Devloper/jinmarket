"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_PRODUCT_IMAGES } from "@jinmarket/shared";
import type { ProductDetail, ProductStatus, PurchaseType } from "@jinmarket/shared";

import { AnonymousRegistrationField } from "../../../../components/AnonymousRegistrationField";
import { fetchCurrentUser, requestJson, uploadImages } from "../../../../lib/api";

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
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

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [item, setItem] = useState<ProductDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceKrw, setPriceKrw] = useState("10000");
  const [status, setStatus] = useState<ProductStatus>("OPEN");
  const [isFreeShare, setIsFreeShare] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowPriceOffer, setAllowPriceOffer] = useState(false);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("INSTANT_BUY");
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [isUnlimitedSalePeriod, setIsUnlimitedSalePeriod] = useState(true);
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [replacementFiles, setReplacementFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const user = await fetchCurrentUser();

        if (!user) {
          throw new Error("로그인이 필요합니다.");
        }

        const response = await requestJson<{ item: ProductDetail }>(`/admin/products/${productId}`);

        if (!cancelled) {
          setItem(response.item);
          setTitle(response.item.title);
          setDescription(response.item.description ?? "");
          setPriceKrw(String(response.item.priceKrw));
          setStatus(response.item.status);
          setIsFreeShare(response.item.isFreeShare);
          setIsAnonymous(response.item.isAnonymous);
          setAllowPriceOffer(response.item.allowPriceOffer);
          setPurchaseType(response.item.purchaseType);
          setSaleStartsAt(toDateTimeLocalValue(response.item.saleStartsAt));
          setIsUnlimitedSalePeriod(!response.item.saleEndsAt);
          setSaleEndsAt(response.item.saleEndsAt ? toDateTimeLocalValue(response.item.saleEndsAt) : "");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "상품 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (productId) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    const urls = replacementFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [replacementFiles]);

  if (loading) {
    return <section className="panel">불러오는 중입니다...</section>;
  }

  if (!item) {
    return <section className="panel">{message ?? "상품을 찾을 수 없습니다."}</section>;
  }

  return (
    <section className="panel">
      <p className="eyebrow">Edit Product</p>
      <h1>상품 수정</h1>
      <p className="muted">
        상품 이미지도 여기서 함께 수정할 수 있습니다. 새 이미지를 저장하면 기존 이미지는 모두 교체되고, 첫 번째 이미지가 대표 이미지가 됩니다.
      </p>

      <div className="field" style={{ marginTop: 20 }}>
        <label>현재 등록된 이미지</label>
        <div className="thumbRow">
          {item.images.map((image) => (
            <img key={image.providerPublicId} className="thumb" src={image.imageUrl} alt={item.title} />
          ))}
        </div>
      </div>

      <div className="field">
        <label>이미지 교체</label>
        <input
          className="input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? []).slice(0, MAX_PRODUCT_IMAGES);
            if ((event.target.files?.length ?? 0) > MAX_PRODUCT_IMAGES) {
              setMessage(`이미지는 최대 ${MAX_PRODUCT_IMAGES}장까지 업로드할 수 있습니다.`);
            } else {
              setMessage(null);
            }
            setReplacementFiles(selectedFiles);
          }}
        />
        <p className="muted">최대 {MAX_PRODUCT_IMAGES}장까지 업로드할 수 있습니다.</p>
      </div>

      {previewUrls.length > 0 ? (
        <div className="field">
          <label>새로 교체될 이미지 미리보기</label>
          <div className="thumbRow">
            {previewUrls.map((url, index) => (
              <img key={url} className="thumb" src={url} alt={`새 이미지 ${index + 1}`} />
            ))}
          </div>
          <div className="actionRow" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="ghostButton"
              onClick={() => {
                setReplacementFiles([]);
                setMessage(null);
              }}
            >
              새 이미지 선택 취소
            </button>
          </div>
        </div>
      ) : null}

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
        <label>판매 상태</label>
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value as ProductStatus)}>
          <option value="OPEN">판매중</option>
          <option value="SOLD_OUT">품절</option>
          <option value="CANCELLED">취소</option>
          <option value="DRAFT">임시저장</option>
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
        <p className="muted">설정한 판매 기간 동안만 구매 사이트에 노출됩니다.</p>
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

      <div className="actionRow" style={{ marginTop: 20 }}>
        <button
          className="primaryButton"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setMessage(null);

            try {
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

              const payload: {
                title: string;
                description: string;
                priceKrw: number;
                status: ProductStatus;
                isFreeShare: boolean;
                isAnonymous: boolean;
                allowPriceOffer: boolean;
                purchaseType: PurchaseType;
                saleStartsAt: string;
                saleEndsAt: string | null;
                images?: ProductDetail["images"];
              } = {
                title,
                description,
                priceKrw: parsedPriceKrw,
                status,
                isFreeShare,
                isAnonymous,
                allowPriceOffer,
                purchaseType,
                saleStartsAt: saleStartsAtIso,
                saleEndsAt: saleEndsAtIso
              };

              if (replacementFiles.length > MAX_PRODUCT_IMAGES) {
                throw new Error(`이미지는 최대 ${MAX_PRODUCT_IMAGES}장까지 업로드할 수 있습니다.`);
              }

              if (replacementFiles.length > 0) {
                payload.images = await uploadImages(replacementFiles);
              }

              const response = await requestJson<{ item: ProductDetail }>(`/admin/products/${productId}`, {
                method: "PATCH",
                body: JSON.stringify(payload)
              });

              setItem(response.item);
              setReplacementFiles([]);
              setMessage("상품 정보와 이미지가 저장되었습니다.");
              router.push(`/products/${response.item.id}`);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "상품 수정에 실패했습니다.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "저장 중..." : "수정 저장"}
        </button>

        <button
          className="secondaryButton"
          disabled={deleting || Boolean(item.soldOrder)}
          onClick={async () => {
            const confirmed = window.confirm("정말 이 상품을 삭제할까요?");
            if (!confirmed) {
              return;
            }

            setDeleting(true);
            setMessage(null);

            try {
              await requestJson<{ ok: true }>(`/admin/products/${productId}`, {
                method: "DELETE"
              });
              router.push("/products");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "상품 삭제에 실패했습니다.");
            } finally {
              setDeleting(false);
            }
          }}
        >
          {deleting ? "삭제 중..." : "상품 삭제"}
        </button>

        <Link className="ghostButton" href={`/products/${productId}`}>
          상세로 돌아가기
        </Link>
      </div>

      {item.soldOrder ? <div className="message">구매 이력이 있는 상품은 삭제할 수 없습니다.</div> : null}
      {message ? <div className="message">{message}</div> : null}
    </section>
  );
}
