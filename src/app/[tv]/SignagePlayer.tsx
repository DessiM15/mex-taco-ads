"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AdItem {
  src: string;
  type: "image" | "video";
}

// An image is held at full opacity for HOLD_DURATION, then the next ad
// crossfades in on top of it. So each ad is fully visible for exactly 10s
// and the slot pitch is 10.5s.
const HOLD_DURATION = 10000;
const CROSSFADE_DURATION = 500;
const SLOT_DURATION = HOLD_DURATION + CROSSFADE_DURATION;
const VIDEO_TIMEOUT = 30000;
const RELOAD_HOUR = 4;
const CST_OFFSET = -6;

interface Slot {
  index: number;
  // Index of the ad being faded out from, or null once the fade is over.
  prev: number | null;
  // Absolute timestamp at which the *next* ad starts fading in. Deadlines are
  // absolute rather than "now + 10500" so a timer that fires late on slow TV
  // hardware doesn't push the following one out — the error can't accumulate.
  fadeAt: number;
}

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
  const [slot, setSlot] = useState<Slot>({ index: 0, prev: null, fadeAt: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);

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
        setSlot({ index: 0, prev: null, fadeAt: Date.now() + SLOT_DURATION });
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
    const now = Date.now();
    setSlot((s) => {
      const nextIndex = (s.index + 1) % ads.length;
      let fadeAt = s.fadeAt + SLOT_DURATION;
      // Resync if we're outside a sane window — the ad ended early (video), the
      // Fire Stick was suspended, or the clock jumped.
      if (fadeAt < now || fadeAt > now + SLOT_DURATION) {
        fadeAt = now + SLOT_DURATION;
      }
      return {
        index: nextIndex,
        prev: nextIndex === s.index ? null : s.index,
        fadeAt,
      };
    });
  }, [ads.length]);

  // Hold the current ad, then hand off to the next one. Recomputing the delay
  // from the absolute deadline keeps this effect idempotent and drift-free.
  useEffect(() => {
    if (ads.length === 0) return;
    const currentAd = ads[slot.index];
    const delay =
      currentAd.type === "video" ? VIDEO_TIMEOUT : Math.max(0, slot.fadeAt - Date.now());
    const timer = setTimeout(advance, delay);
    return () => clearTimeout(timer);
  }, [slot, ads, advance]);

  // Drop the outgoing layer once it's fully covered.
  useEffect(() => {
    if (slot.prev === null) return;
    const timer = setTimeout(() => {
      setSlot((s) => (s.prev === null ? s : { ...s, prev: null }));
    }, CROSSFADE_DURATION + 100);
    return () => clearTimeout(timer);
  }, [slot.index, slot.prev]);

  // Fetch the next image while the current one is on screen, so the crossfade
  // never waits on the network.
  useEffect(() => {
    if (ads.length < 2) return;
    const nextAd = ads[(slot.index + 1) % ads.length];
    if (nextAd.type !== "image") return;
    const preload = new window.Image();
    preload.src = nextAd.src;
  }, [slot.index, ads]);

  const handleVideoEnd = () => {
    advance();
  };

  if (ads.length === 0) {
    return <div style={{ width: "100vw", height: "100vh", background: "#000" }} />;
  }

  const currentAd = ads[slot.index];
  const prevAd = slot.prev !== null ? ads[slot.prev] : null;

  const layerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    position: "absolute",
    top: 0,
    left: 0,
  };

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
      {/* Outgoing ad stays at full opacity underneath — the incoming one fades
          in over it, so the crossfade never dips through black. */}
      {prevAd && prevAd.type === "image" && (
        <img
          key={`prev-${slot.prev}-${prevAd.src}`}
          src={prevAd.src}
          alt=""
          style={{ ...layerStyle, zIndex: 1 }}
        />
      )}

      {currentAd.type === "image" ? (
        <img
          key={`${slot.index}-${currentAd.src}`}
          src={currentAd.src}
          alt=""
          onError={advance}
          style={{
            ...layerStyle,
            zIndex: 2,
            animation: `ad-fade-in ${CROSSFADE_DURATION}ms ease-in-out both`,
          }}
        />
      ) : (
        <video
          key={`${slot.index}-${currentAd.src}`}
          ref={videoRef}
          src={currentAd.src}
          autoPlay
          muted
          playsInline
          onEnded={handleVideoEnd}
          onError={advance}
          style={{
            ...layerStyle,
            zIndex: 2,
            animation: `ad-fade-in ${CROSSFADE_DURATION}ms ease-in-out both`,
          }}
        />
      )}
    </div>
  );
}
