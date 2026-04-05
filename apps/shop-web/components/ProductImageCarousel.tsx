"use client";

import { useEffect, useState } from "react";
import type { ProductImage } from "@jinmarket/shared";

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
            imageUrl: fallbackUrl ?? "https://placehold.co/800x800?text=No+Image",
            providerPublicId: "fallback",
            sortOrder: 1,
            isPrimary: true
          }
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
    const image = slides[0];
    return <img className="heroImage" src={image.imageUrl} alt={title} />;
  }

  return (
    <div className="carousel">
      <div className="carouselViewport">
        <div
          className="carouselTrack"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          aria-live="polite"
        >
          {slides.map((image, index) => (
            <div className="carouselSlide" key={`${image.providerPublicId}-${index}`}>
              <img className="heroImage" src={image.imageUrl} alt={`${title} ${index + 1}`} />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="carouselNav carouselNavPrev"
          aria-label="이전 이미지"
          onClick={() => move(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="carouselNav carouselNavNext"
          aria-label="다음 이미지"
          onClick={() => move(1)}
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
