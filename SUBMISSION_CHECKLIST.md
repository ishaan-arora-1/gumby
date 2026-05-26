# App Store Submission Checklist — Blinkugc

This is everything between today and the App Store. Items marked **[done]** I've already handled in the code; **[you]** items require something only you can do.

---

## 1. Done in this branch

- **[done]** App icon (1024×1024, no alpha) at `ios/GumbyAI/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`. Generated from `images/logo.png` upscaled with Lanczos and composited onto `#0D0D0D` to strip the alpha channel that App Store Connect rejects.
- **[done]** `CFBundleDisplayName` set to **"Blinkugc"** (`ios/GumbyAI/Info.plist`).
- **[done]** `ITSAppUsesNonExemptEncryption` = `false` set in `Info.plist`. This prevents App Store Connect from prompting you on every upload (you use only standard HTTPS / Apple system crypto).
- **[done]** `LSApplicationCategoryType` = `public.app-category.photography`. You can change this to a different category in App Store Connect later — this is just the bundle's default.
- **[done]** Removed `NSAllowsLocalNetworking` from `NSAppTransportSecurity`. That key only mattered when the app was talking to your laptop. Production must be HTTPS.
- **[done]** Removed unused permission strings (camera, microphone, tracking) so App Review doesn't ask why they're declared. Kept only `NSPhotoLibraryAddUsageDescription` since that's the only privacy-gated API the code actually uses.
- **[done]** Switched `aps-environment` in `ios/GumbyAI/GumbyAI.entitlements` from `development` → `production`. Required for push notifications on App Store builds, even if you're not using them yet.
- **[done]** Added `ios/GumbyAI/PrivacyInfo.xcprivacy`. Declares the data categories you collect (email, name, user ID, photos, user content, crash data — all linked to identity, none used for tracking) and required-reason API usage (`UserDefaults`, `FileTimestamp`, `DiskSpace`, `SystemBootTime`). Apple has rejected new submissions without this since spring 2024.
- **[done]** Added in-app **account deletion** flow (Apple Guideline 5.1.1(v)):
  - iOS: sidebar → tap profile avatar → "Delete account" with a confirm alert. Hits `DELETE /api/auth/account`.
  - Backend: new route in `backend/src/routes/auth.js` that cascades the user's rows from `messages`, `conversations`, `posts`, `moodboards`, `saved_assets`, `models`, `ugc_jobs`, `ugc_creator_jobs`, then deletes the `users` row and the Supabase auth record.
- **[done]** Privacy Policy and Terms of Service drafts written to `legal/PRIVACY_POLICY.md` and `legal/TERMS_OF_SERVICE.md`. Replace the `support@createugc.app` placeholder with your real email and the California governing-law clause with your actual jurisdiction.

After pulling these changes, regenerate the Xcode project:

```bash
cd ios && xcodegen generate
```

---

## 2. Things you have to do

### 2a. Deploy the backend behind HTTPS

`ios/GumbyAI/Utils/Constants.swift` line 1 still points to `http://192.168.1.35:3000/api`. The App Store build will not work at all until this is a public HTTPS URL.

1. Deploy `backend/` somewhere (Render, Fly.io, Railway, AWS, etc.). Make sure it serves HTTPS — the default deploy URL on those platforms already does.
2. Set the backend's environment variables in production (Supabase keys, OpenAI key, FAL key, Gemini key, Redis URL).
3. Apply pending database migrations on the production Supabase instance:
   ```bash
   npm run migrate:ugc
   npm run migrate:ugc-creator-jobs
   ```
4. Update `AppConstants.baseURL` in `ios/GumbyAI/Utils/Constants.swift` to your production URL, e.g.:
   ```swift
   static let baseURL = "https://api.createugc.app/api"
   ```

### 2b. Host the privacy policy and terms

Apple will not let you submit without a publicly accessible Privacy Policy URL. Both URLs go into App Store Connect.

1. Pick a domain (e.g. `createugc.app`).
2. Render `legal/PRIVACY_POLICY.md` and `legal/TERMS_OF_SERVICE.md` as HTML and host them. The simplest option is to push them to a public GitHub repo and use the raw URL, or use GitHub Pages, or drop them in your `web/` folder.
3. Edit both files to replace the `support@createugc.app` placeholder with your real support address and fix the governing-law jurisdiction in section 11 of the Terms.
4. (Optional) Add a Settings screen in the app with "Privacy Policy" and "Terms of Service" rows that open those URLs in Safari. Not required by Apple if the URLs are in App Store Connect, but it's a nice trust signal.

### 2c. Apple Developer account setup

1. **Enroll** in the Apple Developer Program ($99/yr) if you haven't already. Your team ID `Q7BK95FM87` is in `project.yml`, so I assume this is done.
2. In **App Store Connect**, create a new app:
   - Platform: iOS
   - Name: **Blinkugc** (must match the display name within reason)
   - Primary language: English (U.S.)
   - Bundle ID: `com.ishaan.gumby` (matches `project.yml`). If you want a different bundle ID, change it in `project.yml` and regenerate before submitting — but note that the Google Sign-In `GIDClientID` in `Info.plist` was issued against the current ID, so changing it means also re-issuing that OAuth client.
   - SKU: anything, e.g. `create-ugc-ios-1`
3. **Capabilities and certificates**: since `CODE_SIGN_STYLE = Automatic`, Xcode will create distribution certificates for you. You only need to confirm Sign in with Apple is enabled for your App ID in the developer portal.

### 2d. App Store Connect listing

You need all of the following before you can submit:

- **App description** (up to 4000 chars). Write something that focuses on real value, not AI buzzwords. Apple rejects descriptions that are mostly marketing fluff.
- **Promotional text** (170 chars).
- **Keywords** (100 chars, comma-separated).
- **Subtitle** (30 chars).
- **Category**: primary = Photo & Video, secondary = Graphics & Design (suggested).
- **Age rating**: walk through the questionnaire. Because your app generates AI media that could theoretically include human likenesses, you should answer "Infrequent/Mild" for "Realistic Violence" → No, "Sexual Content" → No, "Mature/Suggestive Themes" → Yes if you allow lifestyle/UGC ads, otherwise No. Honest answers — Apple checks.
- **Screenshots**:
  - 6.7" iPhone (e.g. iPhone 15 Pro Max) — required
  - 6.5" iPhone (e.g. iPhone 14 Plus) — required
  - 13" iPad Pro — required (your project supports iPad; either provide iPad screenshots, or **drop iPad support** in `project.yml` by changing `TARGETED_DEVICE_FAMILY` from `"1,2"` to `"1"` if you don't want to ship an iPad build)
- **App Review information**:
  - Demo account: create a real test user (email/password or Sign in with Apple) that App Review can use. Put credentials in the "Sign-in required" box. **Do not skip this** — reviewers reject apps where they can't sign in.
  - Notes: a short paragraph explaining what UGC means, that the AI generation is server-side via FAL.ai, and any quirks they need to know.
  - Contact info: your name, email, phone.
- **Privacy details**: fill out the "Data Collected" questionnaire to match `PrivacyInfo.xcprivacy`:
  - Contact Info → Email Address → Linked to user, App Functionality.
  - Identifiers → User ID → Linked to user, App Functionality + Authentication.
  - User Content → Photos or Videos, Other User Content → Linked to user, App Functionality.
  - Diagnostics → Crash Data → Not linked, App Functionality + Analytics.
  - Tracking: **No**.
- **Privacy Policy URL**: from step 2b.

### 2e. Build and upload

1. Open `ios/GumbyAI.xcodeproj` in Xcode.
2. Select the **GumbyAI** scheme and **Any iOS Device (arm64)** as the run destination.
3. Increment `CURRENT_PROJECT_VERSION` in `project.yml` (the `CFBundleVersion`) every time you upload a new build to the same `MARKETING_VERSION`. The first build can stay at version 1.0 / build 1.
4. **Product → Archive**.
5. In Organizer, select the archive → **Distribute App** → **App Store Connect** → **Upload**.
6. Wait ~15–30 minutes for processing in App Store Connect.
7. Assign the processed build to your version, fill out the export compliance answer ("No" — already declared in plist), and hit **Submit for Review**.

Initial review usually takes 24–48 hours. Common rejection causes for an app like yours:

- Reviewer can't sign in → make sure your demo account works against your **production** backend, not localhost.
- Generated content surfaces something inappropriate during their testing → consider adding a server-side content filter on prompts before you submit.
- Account deletion doesn't work end-to-end → test it once on a throwaway account against production before submitting.
- Backend down during review → keep the backend up for at least 7 days after submission.

---

## 3. Strongly suggested before submitting (not blockers, but they'll help)

- **Add a Settings/Profile screen** with: app version, sign out, delete account, Privacy Policy link, Terms link, Support email. Right now delete-account is reachable but buried inside a menu on the avatar; reviewers sometimes miss it. Adding a visible Settings entry reduces rejection risk.
- **Server-side prompt moderation**. At minimum, run user prompts through OpenAI's free moderation endpoint before sending to image/video generation. App Review is increasingly strict about UGC apps that can generate sensitive content.
- **Rate limiting** on the backend (express-rate-limit) to prevent a reviewer or any user from accidentally running up a FAL.ai bill.
- **Crash reporting** (Sentry or Firebase Crashlytics). The privacy manifest already declares "Crash Data" — if you add Sentry, also list its domain in `NSPrivacyTrackingDomains` (still set `NSPrivacyTracking` to false, since crash reports aren't ad-tracking).
- **Test on a real device** running the production build configuration (not just the simulator) before archiving. Many things — Sign in with Apple, push, photo library — behave differently on device.

---

## 4. Quick sanity check before you hit Submit

- [ ] `AppConstants.baseURL` is HTTPS and points to your deployed backend
- [ ] Sign in with Apple works on a fresh device
- [ ] Account deletion works end-to-end (create account → delete → confirm row is gone in Supabase)
- [ ] App Icon shows correctly on the home screen after a clean install
- [ ] Privacy Policy URL loads in a browser
- [ ] You can complete a full UGC generation against the production backend
- [ ] Demo account credentials in App Review Information actually log in
- [ ] No `print()` statements leaking auth tokens (do `grep -r "print(" ios/GumbyAI | grep -i token` to check)
