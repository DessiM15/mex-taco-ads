import fs from "fs";
import path from "path";

const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"];
const ADS_DIR = path.join(process.cwd(), "public", "ads");

// Get all TV directories
const tvDirs = fs.readdirSync(ADS_DIR).filter((name) => {
  const fullPath = path.join(ADS_DIR, name);
  return fs.statSync(fullPath).isDirectory();
});

for (const tv of tvDirs) {
  const tvPath = path.join(ADS_DIR, tv);
  const files = fs.readdirSync(tvPath).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext) && !file.startsWith(".");
  });

  // Sort alphabetically
  files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  // Build playlist with premium logic
  // Premium files (ending with -premium before extension) appear twice
  const playlist = [];
  const premiumFiles = [];

  for (const file of files) {
    const nameWithoutExt = path.basename(file, path.extname(file));
    playlist.push(file);
    if (nameWithoutExt.endsWith("-premium")) {
      premiumFiles.push(file);
    }
  }

  // Insert premium duplicates spread evenly through the playlist
  // so they never appear back-to-back with their first occurrence
  if (premiumFiles.length > 0 && playlist.length > 1) {
    for (const premFile of premiumFiles) {
      const firstIndex = playlist.indexOf(premFile);
      // Insert the duplicate roughly halfway through the remaining slots
      const halfwayOffset = Math.floor(playlist.length / 2);
      let insertAt = (firstIndex + halfwayOffset) % (playlist.length + 1);
      // Make sure it's not adjacent to the original
      if (insertAt === firstIndex || insertAt === firstIndex + 1) {
        insertAt = (insertAt + 2) % (playlist.length + 1);
      }
      if (insertAt > playlist.length) insertAt = playlist.length;
      playlist.splice(insertAt, 0, premFile);
    }
  }

  // Final safety check: no back-to-back same file
  for (let i = 1; i < playlist.length; i++) {
    if (playlist[i] === playlist[i - 1]) {
      // Swap with next different item
      for (let j = i + 1; j < playlist.length; j++) {
        if (playlist[j] !== playlist[i]) {
          [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
          break;
        }
      }
    }
  }

  const manifestPath = path.join(tvPath, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(playlist, null, 2));
  console.log(`Generated ${manifestPath} with ${playlist.length} entries`);
}
