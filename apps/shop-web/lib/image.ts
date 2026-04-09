const cloudinaryHostSuffix = "res.cloudinary.com";
const cloudinaryUploadMarker = "/image/upload/";
const defaultProductCardImage = "https://placehold.co/720x720?text=No+Image";

type CloudinaryImageProps = {
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

export function getProductCardImageProps(imageUrl?: string | null): CloudinaryImageProps {
  if (!imageUrl) {
    return {
      src: defaultProductCardImage
    };
  }

  const responsiveWidths = [360, 720];
  const variants = responsiveWidths.map((width) => ({
    url: buildCloudinaryImageUrl(imageUrl, {
      crop: "fill",
      format: "auto",
      gravity: "auto",
      height: width,
      quality: "auto",
      width
    }),
    width
  }));

  return {
    sizes: "(min-width: 1100px) 360px, (min-width: 700px) 50vw, 50vw",
    src: variants[variants.length - 1].url,
    srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(", ")
  };
}
