const cloudinaryHostSuffix = "res.cloudinary.com";
const cloudinaryUploadMarker = "/image/upload/";

type CloudinaryImageProps = {
  fallbackSrc: string;
  sizes?: string;
  src: string;
  srcSet?: string;
};

type CloudinaryTransformOptions = {
  crop?: string;
  format?: string;
  gravity?: string;
  height?: number;
  quality?: string;
  width?: number;
};

function isCloudinaryUrl(url: URL) {
  return url.hostname === cloudinaryHostSuffix || url.hostname.endsWith(`.${cloudinaryHostSuffix}`);
}

function hasCloudinaryTransformation(pathnameAfterUpload: string) {
  const firstSegment = pathnameAfterUpload.split("/")[0] ?? "";
  return /(^|,)[a-z]{1,4}_/i.test(firstSegment);
}

function buildCloudinaryImageUrl(imageUrl: string, options: CloudinaryTransformOptions) {
  try {
    const parsed = new URL(imageUrl);

    if (!isCloudinaryUrl(parsed)) {
      return imageUrl;
    }

    const uploadMarkerIndex = parsed.pathname.indexOf(cloudinaryUploadMarker);
    if (uploadMarkerIndex < 0) {
      return imageUrl;
    }

    const uploadPathPrefix = parsed.pathname.slice(0, uploadMarkerIndex + cloudinaryUploadMarker.length);
    const pathnameAfterUpload = parsed.pathname.slice(uploadMarkerIndex + cloudinaryUploadMarker.length);

    if (hasCloudinaryTransformation(pathnameAfterUpload)) {
      return imageUrl;
    }

    const transformationParts = [
      options.crop ? `c_${options.crop}` : null,
      options.gravity ? `g_${options.gravity}` : null,
      options.width ? `w_${options.width}` : null,
      options.height ? `h_${options.height}` : null,
      options.format ? `f_${options.format}` : null,
      options.quality ? `q_${options.quality}` : null
    ].filter((value): value is string => Boolean(value));

    if (transformationParts.length === 0) {
      return imageUrl;
    }

    parsed.pathname = `${uploadPathPrefix}${transformationParts.join(",")}/${pathnameAfterUpload}`;
    return parsed.toString();
  } catch {
    return imageUrl;
  }
}

function buildPlaceholderDataUrl(label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720" fill="none">
      <rect width="720" height="720" rx="48" fill="#EAF4FA" />
      <rect x="180" y="180" width="360" height="360" rx="36" fill="#DCECF7" />
      <path d="M270 450L345 360L405 420L450 375L540 510H180L270 450Z" fill="#5FA8D3" opacity="0.55" />
      <circle cx="300" cy="285" r="30" fill="#1F4E79" opacity="0.28" />
      <text x="360" y="580" text-anchor="middle" fill="#16324F" font-size="38" font-family="Pretendard, Arial, sans-serif" font-weight="700">
        ${label}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const defaultProductCardImage = buildPlaceholderDataUrl("No Image");
const defaultEventCardImage = buildPlaceholderDataUrl("Event");

function buildResponsiveImageProps({
  imageUrl,
  fallbackSrc,
  responsiveWidths,
  sizes,
  transform,
}: {
  imageUrl?: string | null;
  fallbackSrc: string;
  responsiveWidths: number[];
  sizes: string;
  transform: Omit<CloudinaryTransformOptions, "width" | "height"> & {
    crop: string;
    gravity?: string;
    height?: number;
  };
}): CloudinaryImageProps {
  if (!imageUrl) {
    return {
      fallbackSrc,
      sizes,
      src: fallbackSrc,
    };
  }

  const variants = responsiveWidths.map((width) => ({
    url: buildCloudinaryImageUrl(imageUrl, {
      ...transform,
      width,
      height: transform.height ?? width,
    }),
    width,
  }));

  return {
    fallbackSrc,
    sizes,
    src: variants[variants.length - 1].url,
    srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(", "),
  };
}

export function getProductCardImageProps(imageUrl?: string | null): CloudinaryImageProps {
  return buildResponsiveImageProps({
    imageUrl,
    fallbackSrc: defaultProductCardImage,
    responsiveWidths: [240, 360, 540],
    sizes: "(min-width: 1100px) 240px, (min-width: 640px) 33vw, 50vw",
    transform: {
      crop: "fill",
      format: "auto",
      gravity: "auto",
      quality: "auto",
    },
  });
}

export function getEventCardImageProps(imageUrl?: string | null): CloudinaryImageProps {
  return buildResponsiveImageProps({
    imageUrl,
    fallbackSrc: defaultEventCardImage,
    responsiveWidths: [320, 640],
    sizes: "(min-width: 1100px) 320px, (min-width: 700px) 50vw, 50vw",
    transform: {
      crop: "fill",
      format: "auto",
      gravity: "auto",
      quality: "auto",
    },
  });
}

export function getProductDetailImageProps(imageUrl?: string | null): CloudinaryImageProps {
  return buildResponsiveImageProps({
    imageUrl,
    fallbackSrc: defaultProductCardImage,
    responsiveWidths: [640, 960, 1280],
    sizes: "(min-width: 960px) 52vw, 100vw",
    transform: {
      crop: "limit",
      format: "auto",
      quality: "auto",
    },
  });
}
