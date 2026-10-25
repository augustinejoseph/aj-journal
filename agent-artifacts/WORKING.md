# How the diary works

## Recording to diary entry

1. The page permits the configured verified Google account. API handlers independently enforce the same owner policy.
2. Starting a recording creates an IndexedDB session with a stable UUID and recording timestamp.
3. MediaRecorder emits audio approximately every ten seconds. Ordered Blob chunks are persisted locally before continuous cloud upload.
4. The server allocates private R2 object keys and short-lived PUT URLs. Upload confirmation checks object size. Stable IDs and unique entry/kind/sequence metadata make retries idempotent.
5. Stopping saves the final emitted chunk. Sealing verifies the complete ordered sequence was uploaded.
6. The browser downloads and joins the audio, decodes it to mono 16 kHz samples, and sends samples to a worker.
7. The worker loads multilingual `onnx-community/whisper-small` with `q8` quantization. It attempts WebGPU, falls back to WASM during initialization, and enables browser model caching. Inference uses 30-second windows with five-second overlap.
8. The authenticated transcript submission preserves the source separately from generated text.
9. Server-side OpenRouter writing produces a validated English title, diary text, and suggested tags. The prompt requires faithful translation, retention of detail and uncertainty, and no invented facts.
10. The owner can edit text/tags, regenerate, search, filter, listen to original audio, or attach photos.

## Data placement

| Location            | Data                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Neon `entries`      | Timestamp, title, body, source transcript, tags, independent processing states, errors, leases, deletion flags           |
| Neon `media`        | Entry association, ordered chunk/photo metadata, private object key, MIME type, size, upload confirmation and URL expiry |
| Neon `settings`     | Private OpenRouter model ID                                                                                              |
| Private R2          | Original audio chunks and photo objects                                                                                  |
| IndexedDB           | Recoverable recording sessions and locally saved audio/photo blobs                                                       |
| Browser model cache | Downloaded model assets, subject to browser storage policy                                                               |
| Deployment secrets  | Google credentials, auth secret, owner email, database connection, R2 credentials, OpenRouter key                        |

## Processing and recovery

Upload, transcription, and writing have independent pending / processing / failed / complete states. A shared entry error field explains the latest failure; errors do not erase saved source material.

- Retry all resumes stopped local sessions, unfinished photos, cloud-ready transcription/writing, and pending deletion cleanup. Completed work is skipped.
- Web Locks serialize cooperating tabs where supported. Database leases protect transcription and writing across devices.
- Transcription leases last three minutes and renew every 30 seconds. Writing leases last 90 seconds; provider requests time out after 45 seconds.
- Recover finalizes chunks already persisted on the original recording device. Unsaved MediaRecorder buffers cannot be recovered.
- Finish saved audio can finalize interrupted cloud recordings from another device after confirmation. Local-only chunks still require the original browser profile.
- Runtime transcription failures remain retryable on a capable desktop. The app must stay open during local transcription; no background scheduler exists.

## Privacy and deletion

All diary/media endpoints authorize the owner. Mutations also validate same-origin requests. API responses are private and not cached. Signed R2 links expire after 180 seconds; previously issued links remain usable until expiry.

Photos are never sent for AI analysis. Transcripts are sent to OpenRouter for writing. Models are downloaded from Hugging Face; speech recognition runs locally.

Deletion first tombstones the entry and blocks later reads/writes. Media is removed. When issued upload URLs have not expired, cleanup remains pending so late uploads can be removed by Retry all after three minutes. Final cleanup scrubs diary content and media metadata while retaining the entry UUID tombstone, preventing stale devices from recreating it. No automatic cleanup job runs when the app is closed.

## Practical limits

There is no fixed recording timer. Browser suspension, quota, battery, and device memory still limit operation. Individual uploads are capped at 25 MB. Playback and decoding currently join the whole recording in memory, so long recordings can exceed device capacity even though inference uses windows. Persistent storage and model caching can be refused or evicted by browsers. Local chunks remain until entry deletion.
