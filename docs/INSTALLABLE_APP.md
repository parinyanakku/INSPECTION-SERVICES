# ProElite Inspection packages

The PWA and both native launchers open the existing Pages site. The launcher at the site root honors the saved web release. Buyers change web releases through the existing update screen. Installing a native launcher never migrates the workspace. A different browser profile or an iOS home-screen container may require signing in again and restoring the user's Google Drive backup. An online connection is needed to verify access when opening the workspace.

## Build

- Windows uses a per-user MSI, Start menu shortcut and .NET Framework launcher. The launcher opens Edge in an app window or uses the default browser when Edge is unavailable. Run `native/windows/build.ps1 -WixBin <WiX-3.14.1-tools-directory> -BuildNumber <number>` from PowerShell. The MSI is unsigned until the owner signs it.
- Android uses the system browser in a Custom Tab, with standard browser fallback. Run `native/android/build.ps1 -BuildNumber <number>` in PowerShell 7 with JDK 17, ANDROID_HOME, platform 35 and build-tools 35.0.0. The default APK uses an ephemeral test key. For a release, supply the same owner-controlled keystore and alias used for prior installs, set the environment variables used by the script, increase the version code and pass `-Release`.
- iPhone and iPad use Safari's Share → Add to Home Screen. PNG icons come from fixed product artwork. Rebuild them and the Windows icons with `native/make-icons.ps1`.

## Private delivery

Apply the private-installer migration to the existing Supabase project. The private bucket is `proelite-installers`. Its read policy allows authenticated object reads and listing for exactly two approved objects. It evaluates the caller's current active license and expiry on each request. Admins and monthly, yearly, lifetime or custom buyers qualify. Trial customers retain their existing web entitlement. The browser holds only its existing user token and public API key.

The **Build private ProElite packages** workflow compiles and verifies packages on main. Default runs discard their outputs with the runner. Manual staging on main requires two short-lived Supabase signed **upload** URLs created by the owner for unused object names under `candidates/windows/` and `candidates/android/`. Put them in `PROELITE_WINDOWS_CANDIDATE_UPLOAD_URL` and `PROELITE_ANDROID_CANDIDATE_UPLOAD_URL`. Android staging additionally requires `PROELITE_KEYSTORE_BASE64`, `PROELITE_KEY_ALIAS`, `PROELITE_STORE_PASSWORD` and `PROELITE_KEY_PASSWORD`. Staging never writes the approved paths. Keep the signing keystore backed up outside the repository.

After checking publisher signatures, testing on a device and comparing the SHA-256 with the build record, upload the approved package using the owner's Storage dashboard. Use `approved/ProElite-Inspection.msi` or `approved/ProElite-Inspection.apk` with cache control 0. The buyer dialog lists available objects and downloads bytes with the current account token. Removing an approved object withdraws that download. Browser and native package updates are independent. Increase the native build number for every replacement package.
