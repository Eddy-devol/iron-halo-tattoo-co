"use client";

import Image from "next/image";
import { useState } from "react";

type ArchiveArtworkImageProps = {
  src: string;
  alt: string;
  sizes: string;
  className: string;
  imageClassName?: string;
  priority?: boolean;
  decorative?: boolean;
};

export default function ArchiveArtworkImage({
  src,
  alt,
  sizes,
  className,
  imageClassName,
  priority = false,
  decorative = false,
}: ArchiveArtworkImageProps) {
  const [unavailable, setUnavailable] = useState(false);

  return (
    <div
      className={`archive-artwork-frame ${className}`}
      aria-hidden={decorative || unavailable ? true : undefined}
      role={!decorative && unavailable ? "img" : undefined}
      aria-label={!decorative && unavailable ? `Artwork: ${alt}` : undefined}
    >
      {!unavailable ? (
        <Image
          src={src}
          alt={decorative ? "" : alt}
          fill
          priority={priority}
          sizes={sizes}
          unoptimized
          className={imageClassName}
          onError={() => setUnavailable(true)}
        />
      ) : (
        <div className="archive-artwork-fallback" aria-hidden="true">
          <span>IRON HALO</span>
          <span>STUDIO ARCHIVE</span>
        </div>
      )}
    </div>
  );
}
