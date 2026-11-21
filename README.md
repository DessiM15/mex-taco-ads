# Mex Taco House - Digital Signage

This app is the player on the TVs. It shows a looping slideshow of ads, and gets the list of what to play from the Smart Scale portal.

---

## How It Works

- **The ads are managed in the portal**, at smartscaleagent.com/advertise/admin/screens. Adding, replacing, reordering, pausing and dating a slide all happen there. Nothing in this project needs editing to change what plays.
- Each TV asks the portal for its list every two minutes, so a change shows up on the wall shortly after it is saved.
- A slide with a last day stops by itself. The list carries each slide's last day, so it still comes down on time if the TV has lost its connection.
- Images show for **exactly 10 seconds** each (plus a half-second crossfade into the next ad). Videos play their full length, muted.

### If the portal can't be reached

The TV never goes black over a dropped connection. In order, it plays:

1. The list the portal just gave it.
2. The last list it saved, if the portal isn't answering.
3. The files in `public/ads/tv1/` in this project, if it has never had a list.

So the files in `public/ads/` are now a **backup loop**, not the live one. Keep a few safe slides there (house rules, catering, "advertise here"). Don't put a paying client's ad in the backup: nothing takes it down when their term ends.

### Which TV is which

- `/tv1` is Mex Taco House, screen 1. `/tv2` is screen 2.
- A TV at a new location opens `/play?venue=<location id>&screen=<number>`. The location id is the one in the portal's Locations page address.

---

## Making an Ad

1. **Design it in Canva** at 1920 x 1080 pixels (landscape, HD).
2. **Export** as JPG or PNG for an image, or MP4 for video.
3. **Upload it on the Screens page** in the portal. The portal resizes images and saves them light enough for a Fire Stick, and warns you if a video is too long or too heavy.

---

## Video Ads

- **A video holds its slot for however long the file runs.** An image is always shown for exactly 10 seconds; a 30-second video sits on screen for 30 seconds and throws the loop out of step.
- **Cut video ads to 10.5 seconds, not 10.** A slot is 10.5 seconds: half a second fading in, then 10 at full brightness.
- **Export at 30fps and strip the audio.** Fire Sticks stutter decoding 1080p60 in a browser, and the TVs are muted anyway. 1920x1080, 30fps, H.264 MP4, around 1.5 MB.

To cut the first 10.5 seconds off a longer clip and encode it correctly in one step:

```
ffmpeg -i original.mp4 -vf fps=30 -frames:v 315 -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 22 \
  -movflags +faststart your-ad.mp4
```

---

## Changing the Backup Loop

Only needed when the backup slides themselves change.

1. Put files in `public/ads/tv1/`, named with a number first (`10-house-rules.jpg`). They play in filename order.
2. Commit and push. Vercel rebuilds, and the TVs pick up the new backup at their 4 AM refresh.

---

## Fire Stick Setup

Each Amazon Fire Stick needs to open one URL in full-screen:

1. Install **Fully Kiosk Browser** (recommended) or use **Amazon Silk Browser**
2. Set the homepage URL:
   - **TV 1:** `https://your-vercel-domain.vercel.app/tv1`
   - **TV 2:** `https://your-vercel-domain.vercel.app/tv2`
3. In Fully Kiosk: enable kiosk mode, disable the navigation bar, enable autostart on boot
4. In Silk: enter the URL, tap the fullscreen icon, and set it as the startup page

The page hides the cursor, prevents the screen from sleeping, and refreshes itself at 4 AM CST every night to pick up any update to the player. If the TV is offline at 4 AM it skips the refresh and keeps playing.

---

## Supported File Types

| Type   | Extensions         |
|--------|--------------------|
| Image  | .jpg, .png, .webp  |
| Video  | .mp4, .webm        |

Any other file types in the folder are ignored (won't break anything).

---

## Technical Details (For Reference)

- Built with Next.js (static export), hosted on Vercel (auto-deploys from GitHub)
- The playlist comes from `https://smartscaleagent.com/api/screens/<location>/<screen>`; each check-in also tells the portal the screen is alive
- The last good list is kept in the browser's storage, and slide files are cached by the browser after their first play
- A new list is swapped in between two ads, never in the middle of one
- Videos play muted with a 30-second safety timeout (in case one freezes)
- Broken images are automatically skipped
- Screen wake lock keeps the TV from sleeping
- Slide timing uses absolute deadlines, so a timer that fires late on slow hardware doesn't push the whole schedule out
- The next image is preloaded while the current one is on screen
