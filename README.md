# Woodique Admin Panel

Private React/Vite dashboard for authorized Woodique administrators.

## Local development

1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. The Vite development server proxies `/api/*` requests to the configured API host.

In production, `vercel.json` rewrites admin API requests to the backend so the browser can use a same-origin HTTP-only session cookie. Do not expose JWT secrets or backend credentials in Vite environment variables.

## Admin provisioning

There is no public administrator registration. Create the first administrator from the backend repository using its protected provisioning script. Configure `ADMIN_NAME`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD` (12+ characters) in the backend environment, then run `npm run admin:create`.

## Dashboard features

- Secure administrator sign-in and session restoration.
- Customer listing, profile editing and account deletion.
- Tray-set product creation, editing, archiving and restoring.
- Browser-side product image resizing and compression before upload.
- Order listing, order details and status updates.
- Collections/categories derived from active catalogue products.

## Current limitations

- Customer and order screens load the latest 100 records; dashboard totals are based on those loaded records.
- Categories are derived from active products rather than stored as a separate collection.
- Store settings are not persisted because the backend does not currently expose a store-settings endpoint.
- Product images are stored with product records; browser compression helps keep uploads within the backend model limit.

## Build

```bash
npm run build
```
