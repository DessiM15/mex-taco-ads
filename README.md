# Mex Taco House - Digital Signage

This app powers the TV ad displays at Mex Taco House. It shows a looping slideshow of advertisement images and videos on two TVs.

---

## How It Works

- **TV 1** shows ads from the folder `public/ads/tv1/`
- **TV 2** shows ads from the folder `public/ads/tv2/`
- Each TV loops through its ads continuously — images show for 9 seconds, videos play their full length (muted)
- When you add/remove files and push to GitHub, Vercel automatically rebuilds and the TVs pick up the change at 4 AM CST (or on next page load)

---

## How to Add a New Ad

1. **Design the ad in Canva** — use 1920 x 1080 pixels (landscape, HD)
2. **Export it** as `.jpg`, `.png`, or `.webp` for images, or `.mp4`/`.webm` for video
3. **Name the file** using lowercase with dashes, like `joes-plumbing-ad.jpg`
   - No spaces in the filename
   - Keep it descriptive so you know what it is later
4. **Drop the file** into the correct folder:
   - `public/ads/tv1/` for TV 1
   - `public/ads/tv2/` for TV 2
   - You can put the same file in both folders if you want it on both screens
5. **Commit and push to GitHub:**
   - In GitHub Desktop or the terminal: add the file, commit with a message like "Add Joe's Plumbing ad", and push
   - Vercel will automatically rebuild (takes about 1 minute)
   - The TVs will show the new ad after their next 4 AM refresh, or you can manually refresh the browser on the Fire Stick

---

## How to Make an Ad "Premium" (Shows Twice Per Loop)

Rename the file so it ends with `-premium` before the extension:

- Regular: `joes-plumbing-ad.jpg` (shows once per loop)
- Premium: `joes-plumbing-ad-premium.jpg` (shows twice per loop, spread apart)

That's it — just the filename controls it.

---

## How to Remove an Advertiser

1. Delete their file(s) from `public/ads/tv1/` and/or `public/ads/tv2/`
2. Commit and push to GitHub
3. The ad disappears after Vercel rebuilds

---

## Ad Display Order

Ads play in alphabetical order by filename. If you want to control the order, you can prefix filenames with numbers:

- `01-mex-taco-catering.jpg`
- `02-steady-games-ad.jpg`
- `03-smart-scale-ad.jpg`

---

## Fire Stick Setup

Each Amazon Fire Stick needs to open one URL in full-screen:

1. Install **Fully Kiosk Browser** (recommended) or use **Amazon Silk Browser**
2. Set the homepage URL:
   - **TV 1:** `https://your-vercel-domain.vercel.app/tv1`
   - **TV 2:** `https://your-vercel-domain.vercel.app/tv2`
3. In Fully Kiosk: enable kiosk mode, disable the navigation bar, enable autostart on boot
4. In Silk: enter the URL, tap the fullscreen icon, and set it as the startup page

The page hides the cursor, prevents the screen from sleeping, and auto-refreshes at 4 AM CST every night to pick up any new ads.

---

## Supported File Types

| Type   | Extensions         |
|--------|--------------------|
| Image  | .jpg, .png, .webp  |
| Video  | .mp4, .webm        |

Any other file types in the folder are ignored (won't break anything).

---

## Technical Details (For Reference)

- Built with Next.js (static export)
- Hosted on Vercel (auto-deploys from GitHub)
- No database, no login, no backend — just static files
- Videos play muted with a 30-second safety timeout (in case one freezes)
- Broken images are automatically skipped
- Screen wake lock keeps the TV from sleeping

---

## Folder Structure

```
public/
  ads/
    tv1/          ← ads for TV 1
      advertise-here.jpg
      mex-taco-catering.jpg
      smart-scale-ad.jpg
      steady-games-ad.jpg
    tv2/          ← ads for TV 2
      advertise-here.jpg
```
