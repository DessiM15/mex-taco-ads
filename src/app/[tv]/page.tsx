import fs from "fs";
import path from "path";
import SignagePlayer from "./SignagePlayer";

export function generateStaticParams() {
  const adsDir = path.join(process.cwd(), "public", "ads");
  if (!fs.existsSync(adsDir)) return [];
  const tvDirs = fs.readdirSync(adsDir).filter((name) => {
    return fs.statSync(path.join(adsDir, name)).isDirectory();
  });
  return tvDirs.map((tv) => ({ tv }));
}

export default async function TVPage({
  params,
}: {
  params: Promise<{ tv: string }>;
}) {
  const { tv } = await params;
  return <SignagePlayer tv={tv} />;
}
