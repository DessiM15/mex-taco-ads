"use client";

// A TV at any location: /play?venue=<location id>&screen=<number>
//
// tv1 and tv2 have their own addresses because the Fire Sticks at Mex Taco
// House were set up with them. Every screen after that uses this one page,
// so adding a location in the portal needs no change here.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SignagePlayer from "../[tv]/SignagePlayer";

function Player() {
  const params = useSearchParams();
  const venue = (params.get("venue") ?? "").replace(/[^a-z0-9-]/gi, "");
  const screen = Number(params.get("screen") ?? "1");
  if (!venue || !Number.isInteger(screen) || screen < 1) {
    return <div style={{ width: "100vw", height: "100vh", background: "#000" }} />;
  }
  // "tv1" names the shipped files to fall back on if the portal has nothing.
  return <SignagePlayer tv="tv1" venue={venue} screen={screen} />;
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div style={{ width: "100vw", height: "100vh", background: "#000" }} />}>
      <Player />
    </Suspense>
  );
}
