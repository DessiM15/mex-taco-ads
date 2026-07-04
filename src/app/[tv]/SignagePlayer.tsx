"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AdItem {
  src: string;
  type: "image" | "video";
}

const IMAGE_DURATION = 9000;
const VIDEO_TIMEOUT = 30000;
const CROSSFADE_DURATION = 500;
const RELOAD_HOUR = 4;
const CST_OFFSET = -6;

function getCSThour(): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  let cstHour = utcHour + CST_OFFSET;
  if (cstHour < 0) cstHour += 24;
  return cstHour + utcMinutes / 60;
}

function scheduleNightlyReload() {
  let reloadedToday = false;
  const check = () => {
    const cstHour = getCSThour();
    if (cstHour >= RELOAD_HOUR && cstHour < RELOAD_HOUR + 2 / 60 && !reloadedToday) {
      reloadedToday = true;
      window.location.reload();
    }
    // Reset flag after the window passes
    if (cstHour >= RELOAD_HOUR + 2 / 60) {
      reloadedToday = false;
    }
  };
  setInterval(check, 30000);
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      let wakeLock = await (navigator as any).wakeLock.request("screen");
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
          try {
            wakeLock = await (navigator as any).wakeLock.request("screen");
          } catch {}
        }
      });
    }
  } catch {}
}

export default function SignagePlayer({ tv }: { tv: string }) {
  const [ads, setAds] = useState<AdItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancingRef = useRef(false);

  // Load ad manifest
  useEffect(() => {
    fetch(`/ads/${tv}/manifest.json`)
      .then((r) => r.json())
      .then((manifest: string[]) => {
        const items = manifest
          .map((filename): AdItem | null => {
            const ext = filename.split(".").pop()?.toLowerCase();
            if (!ext) return null;
            if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
              return { src: `/ads/${tv}/${filename}`, type: "image" };
            }
            if (["mp4", "webm"].includes(ext)) {
              return { src: `/ads/${tv}/${filename}`, type: "video" };
            }
            return null;
          })
          .filter((item): item is AdItem => item !== null);
        setAds(items);
      })
      .catch(() => {
        setTimeout(() => window.location.reload(), 10000);
      });
  }, [tv]);

  // Wake lock and nightly reload
  useEffect(() => {
    requestWakeLock();
    scheduleNightlyReload();
  }, []);

  const advance = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    // Fade out
    setOpacity(0);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % ads.length);
      // Small delay then fade in
      setTimeout(() => {
        setOpacity(1);
        advancingRef.current = false;
      }, 50);
    }, CROSSFADE_DURATION);
  }, [ads.length]);

  // Handle timing for current ad
  useEffect(() => {
    if (ads.length === 0) return;
    const currentAd = ads[currentIndex];

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);

    if (currentAd.type === "image") {
      timeoutRef.current = setTimeout(advance, IMAGE_DURATION);
    } else if (currentAd.type === "video") {
      videoTimeoutRef.current = setTimeout(advance, VIDEO_TIMEOUT);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
    };
  }, [currentIndex, ads, advance]);

  const handleVideoEnd = () => {
    if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
    advance();
  };

  const handleImageError = () => {
    advance();
  };

  if (ads.length === 0) {
    return <div style={{ width: "100vw", height: "100vh", background: "#000" }} />;
  }

  const currentAd = ads[currentIndex];

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {currentAd.type === "image" ? (
        <img
          key={`${currentIndex}-${currentAd.src}`}
          src={currentAd.src}
          alt=""
          onError={handleImageError}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity,
            transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      ) : (
        <video
          key={`${currentIndex}-${currentAd.src}`}
          ref={videoRef}
          src={currentAd.src}
          autoPlay
          muted
          playsInline
          onEnded={handleVideoEnd}
          onError={() => advance()}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity,
            transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      )}
    </div>
  );
}
