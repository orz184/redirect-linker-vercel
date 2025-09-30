# redirect-linker-vercel
Minimal Vercel Serverless Functions for resolving a token to a direct download URL and redirecting (302).

## Endpoints
- POST `/api/get-link`  body: `{ "token": "..." }`  -> `{ "download_url": "..." }`
- GET  `/api/r?token=...` -> 302 redirect to real file

If `vercel.json` is present, `/r?token=...` will rewrite to `/api/r?token=...`.
