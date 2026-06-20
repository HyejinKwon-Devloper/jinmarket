"use client";

import { useEffect, useState } from "react";
import type { ProductImage } from "@jinmarket/shared";

import { getProductDetailImageProps } from "../lib/image";

type ProductImageCarouselProps = {
  title: string;
  images: ProductImage[];
  fallbackUrl?: string | null;
};

function getSlides(images: ProductImage[], fallbackUrl?: string | null) {
  const sourceSlides =
    images.length > 0
      ? images
      : [
          {
            imageUrl: fallbackUrl ?? null,
            providerPublicId: "fallback",
            sortOrder: 1,
            isPrimary: true,
          },
        ];

  const seenKeys = new Set<string>();

  return sourceSlides.filter((image) => {
    const key = `${image.providerPublicId}:${image.imageUrl}`;

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

export function ProductImageCarousel({ title, images, fallbackUrl }: ProductImageCarouselProps) {
  const slides = getSlides(images, fallbackUrl);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex((prevIndex) => Math.min(prevIndex, slides.length - 1));
  }, [slides.length]);

  function move(direction: -1 | 1) {
    setCurrentIndex((prevIndex) => {
      const nextIndex = prevIndex + direction;
      if (nextIndex < 0) {
        return slides.length - 1;
      }

      if (nextIndex >= slides.length) {
        return 0;
      }

      return nextIndex;
    });
  }

  if (slides.length <= 1) {
    const image = getProductDetailImageProps(slides[0]?.imageUrl);

    return (
      <img
        alt={title}
        className="heroImage"
        decoding="async"
        fetchPriority="high"
        height={1440}
        loading="eager"
        sizes={image.sizes}
        src={image.src}
        srcSet={image.srcSet}
        width={1440}
      />
    );
  }

  return (
    <div className="carousel">
      <div className="carouselViewport">
        <div
          aria-live="polite"
          className="carouselTrack"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {slides.map((image, index) => {
            const slideImage = getProductDetailImageProps(image.imageUrl);
            const isActive = index === currentIndex;

            return (
              <div className="carouselSlide" key={`${image.providerPublicId}-${index}`}>
                <img
                  alt={`${title} ${index + 1}`}
                  className="heroImage"
                  decoding="async"
                  fetchPriority={isActive ? "high" : "auto"}
                  height={1440}
                  loading={isActive ? "eager" : "lazy"}
                  sizes={slideImage.sizes}
                  src={slideImage.src}
                  srcSet={slideImage.srcSet}
                  width={1440}
                />
              </div>
            );
          })}
        </div>

        <button
          aria-label="이전 이미지"
          className="carouselNav carouselNavPrev"
          onClick={() => move(-1)}
          type="button"
        >
          ‹
        </button>
        <button
          aria-label="다음 이미지"
          className="carouselNav carouselNavNext"
          onClick={() => move(1)}
          type="button"
        >
          ›
        </button>
        <div className="carouselCounter">
          {currentIndex + 1} / {slides.length}
        </div>
      </div>
    </div>
  );
}
