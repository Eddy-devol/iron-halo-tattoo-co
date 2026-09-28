"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ArtistPortraitProps = {
  src: string | null;
  alt: string;
  className: string;
  sizes?: string;
};

export default function ArtistPortrait({
  src,
  alt,
  className,
  sizes = "100vw",
}: ArtistPortraitProps) {
  const [unavailable, setUnavailable] = useState(false);
  const showFallback = !src || unavailable;

  useEffect(() => {
    setUnavailable(false);
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden bg-graphite ${className}`}
      aria-hidden={alt ? undefined : true}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      {showFallback ? (
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-graphite text-bone/45">
          <span className="font-display text-xs tracking-[.2em]">IRON HALO</span>
          <span className="h-px w-8 bg-rust/70" />
        </div>
      ) : (
        <Image
          src={src}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          className="artwork-image object-cover"
          onError={() => setUnavailable(true)}
        />
      )}
    </div>
  );
}
