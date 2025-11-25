Migration notes — Next.js repo root

Environment variables required:
- `S3_BUCKET` or `AWS_S3_BUCKET`: S3 bucket name containing case folders
- `AWS_REGION`: region of S3 bucket (optional)
- `S3_PREFIX`: optional prefix where case folders live (e.g. `cases/`)

Install dependencies from repo root:
```
npm install
```

Dev:
```
npm run dev
```

This Next app reuses the server `utils` code copied into `lib/`. The Express `server/routes` can be discarded; API routes now read case files directly from S3.
