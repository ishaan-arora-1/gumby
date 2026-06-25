# Cloudinary → Supabase relink — STATUS

Cloudinary was suspended (delivery 401s). The recovered source clips in this
folder were re-hosted on Supabase Storage and wired into the DB + landing page
by `backend/scripts/relink-cloudinary.js`. Re-run that script (Node 20+) any
time you drop more files in here.

## Done ✅
- DB template cards #1–#6 (studio creators grid + /templates) → Supabase.
- Landing hero wall, showcase, result mockups, product thumbnail → Supabase.

## Files placed
| file                 | used for                                            |
|----------------------|-----------------------------------------------------|
| `wardrobe.mp4`       | card #1 + landing showcase tile                     |
| `skincare.mp4`       | card #2 (clean) + landing "Skincare" + center mockup|
| `beauty.mp4`         | card #3 clean seed + landing "Beauty"               |
| `jewellery.mp4`      | card #4 clean seed + landing "Jewellery" + product thumb |
| `fashion.mp4`        | card #5 clean seed + landing "Fashion"              |
| `evening.mp4`        | card #6 clean seed + landing "Evening" + left mockup|
| `cap-beauty.mp4`     | card #3 captioned preview                            |
| `cap-jewellery.mp4`  | card #4 captioned preview                            |
| `cap-fashion.mp4`    | card #5 captioned preview                            |
| `cap-evening.mp4`    | card #6 captioned preview                            |
| `showcase-demo.mp4`  | landing showcase center tile                         |
| `_spare-wardrobe-alt.mp4` | unused (alternate take of the #1 wardrobe scene)|

## Substituted (source never recovered from Cloudinary)
- **card #2 captioned skincare** (`o2q2d7`) → plays the *clean* skincare clip.
- **landing "Fitness" tile + right mockup** (`gym_wjiimf`) → reuses the existing
  Supabase gym clip (#106).
- **product-mockup thumbnail** (`download_ljd2qd.webp`) → reuses the jewellery still.

## Still missing — provide the mp4 to fully restore
- **card #7 "Clean everyday look"** (`…_os6bpi.mp4`) — currently HIDDEN
  (`is_active=false`). Drop the file in as `clean-everyday.mp4`, add a row to
  `DB_ROWS` in the relink script (id `aaaaaaaa-0001-4000-8000-000000000006`),
  and re-run to bring it back.
- (optional) the real captioned-skincare and gym sources, if you want exact
  fidelity instead of the substitutes above.
