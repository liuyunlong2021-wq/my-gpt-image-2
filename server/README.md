# Tom Teacher Upload Service

The preview server runs the static site through Nginx and the small Node service in `tom-upload.mjs`. The upload service listens only on `127.0.0.1`; Nginx publishes it over HTTPS at `/api/`.

## Server paths

- App: `/opt/dazi-tom-upload`
- Environment file: `/etc/dazi-tom-upload.env` (root-readable only)
- Content manifest: `/var/lib/dazi-tom-upload/tom-teacher.json`
- Public media: `/var/lib/dazi-tom-upload/media/`, served at `/tom-media/`
- Service: `dazi-tom-upload.service`

Keep the manifest and media outside the static site directory so future site deployments do not replace Tom's uploads. Back up `/var/lib/dazi-tom-upload/` with the server's normal backup process.

## Deploying service updates

Copy `package.json`, `package-lock.json`, and `tom-upload.mjs` to `/opt/dazi-tom-upload`, set that directory's owner to `www-data`, then install dependencies as `www-data` with `npm ci --omit=dev --ignore-scripts`. Install the service unit, reload systemd, and restart `dazi-tom-upload.service`. Do not replace the content manifest during site deployments.

## Access

Use the preview site's `/tom-admin/` page over HTTPS. The password is stored in `/etc/dazi-tom-upload.env`; rotate it there and restart the service. The login session expires after 12 hours. Uploads accept JPG, PNG, WebP, GIF, MP4, and WebM files up to 1 GiB. Video uploads must include a JPG, PNG, WebP, or GIF cover image up to 10 MiB. Nginx streams uploads to the API and allows a two-hour request window. Video works show the selected cover; the original opens only when a visitor clicks its link.

The authenticated admin list supports setting or changing a video's cover, hiding, restoring, and permanently removing works. Removal deletes the manifest entry and locally managed media files. Public listing omits hidden entries.
