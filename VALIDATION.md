# Release acceptance checks

Automated tests are run with `npm test`. The following need configured services and physical devices; they are not claimed as passed.

- Sign in as the configured verified Google email; verify other accounts are denied. Sign out and verify entries, settings, transcript, generation, media signing, media confirmation, seal and delete return 401.
- Record representative Malayalam, English and code-switched speech. Compare every transcript detail with audio, then verify the English rewrite preserves names, uncertainty, and all facts. Include silence and background noise. Record device, model, memory failures and elapsed transcription time.
- On iPhone Safari, Android Chrome and desktop: start/stop, play complete audio, attach/view photos, edit text/tags, regenerate, search all text fields, filter dates/tags and navigate calendar months.
- Record for an hour and beyond. Disable network, restore network, close/reopen tab, lock device and switch apps. Verify local/cloud status and that recovery preserves the ordered saved chunks. Test storage quota failure. Never assume suspended mobile tabs keep recording.
- Interrupt each upload before/after PUT and before confirmation. Repeated Retry all must reuse existing entries/chunks. Retry from another tab/device while processing; ensure only one generated result is committed.
- Interrupt model download; retry with cache. Test WebGPU and WASM. Trigger memory failure and retry the same cloud audio on desktop without duplicating an entry.
- Force OpenRouter 429/500/timeout and malformed JSON. Existing transcript/text must survive. Retry after a stale lease expires. Regeneration must preserve the original transcript.
- Delete during upload/generation, repeat DELETE after upload URLs expire, and inspect R2 to confirm associated objects are gone. Simulate R2 delete failure and verify cleanup remains visible/retryable.
- Keyboard-only: all buttons and fields have visible focus, recorder usable via Enter/Space, modal has focus containment and Escape dismissal, closing restores focus. Verify screen reader status/error announcements and 320 px layout.
- Check production OAuth callback, HTTPS, exact R2 CORS origin, private bucket status, deployment secret configuration, and domain routing.
