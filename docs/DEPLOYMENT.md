# FormCapy web deployment

## Current release decision

Complete and accept the browser-local document-processing refactor, then publish
its static build on **Cloudflare** with **HTTPS required**. The existing Flask
version will not be launched on Render as an interim release.

Cloudflare Pages and Workers Static Assets remain hosting options. Select the
product and deployment settings after checking the finished static artifact,
runtime files, asset limits, and domain configuration; neither option is recorded
as the final choice yet. The static release must process drafts in the browser
without depending on the Flask conversion endpoints.

The Render files (`render.yaml`, `requirements-web.txt`, `gunicorn.conf.py`) and
the instructions below are retained as a **fallback only**. They do not represent
the current launch procedure or evidence that a public service is running.

When registration, sign-in, repository authorization, or an account permission
screen is required, stop on that screen and wait for the user to complete it.
Continue deployment after the user has completed the required account step.

## Required launch acceptance

These are release requirements, not completed verification results. Record the
deployed commit, date, browser and OS versions, device, and outcome for each check.

- [ ] The finished static build loads its browser runtime and processes supported
  drafts without a Flask server. Inspect network requests during file selection,
  paragraph inspection, conversion, and download: draft bytes and paper details
  must not be sent to a server. Privacy text must match the implementation.
- [ ] `https://formcapy.com` and `https://www.formcapy.com` both have valid,
  browser-trusted TLS certificates covering the requested hostname. Verify the
  certificate chain, validity period, and absence of browser security warnings.
  A `www` redirect still requires valid TLS before it can redirect to the root.
- [ ] `http://formcapy.com` and `http://www.formcapy.com` redirect to HTTPS, preserve
  the requested path and query string, and have no redirect loop. The HTTPS `www`
  entry may redirect to the canonical root domain.
- [ ] Browser Network and Console panels show no mixed-content requests or
  warnings. All network-loaded WASM, JavaScript, browser Web Worker scripts,
  Python runtime/package files, and other dependencies use **same-origin HTTPS**
  URLs. Confirm that the server returns the expected files and content types,
  including `application/wasm` for WASM, rather than an HTML fallback or a 404.
- [ ] In Safari, Chrome, and Edge, choose supported DOCX, TXT, and Markdown files
  using the system file picker; complete conversion; download the generated DOCX;
  and confirm that the saved document opens and has the expected filename and
  content. Include filenames containing spaces and non-ASCII characters. Record
  each browser separately; a result from one browser does not cover the others.
- [ ] On a **physical iPhone** and a **physical iPad**, separately check Safari
  file selection, conversion, download, and finding or saving the DOCX in Files.
  Record the device and iOS/iPadOS version. If either device is unavailable, mark
  that device **unverified — no physical device available** in the acceptance
  report. Desktop resizing, emulation, and another Apple device do not establish
  that the missing device has passed; do not claim full iPhone/iPad verification.

Cloudflare documents [Pages custom-domain setup](https://developers.cloudflare.com/pages/configuration/custom-domains/)
and [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
as separate deployment paths. For the selected path, complete domain association
and certificate activation before declaring the custom domain ready. Configure
[Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/)
or the selected product's equivalent redirect behavior, then verify the HTTP and
HTTPS entry points above. See also
[Universal SSL certificates](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/).

## Fallback: Render Python service

This section applies only if a later decision explicitly activates the Render
fallback. It runs the existing Flask formatter and uploads drafts to the server;
its privacy and operating details differ from the planned browser-local release.

### Create the fallback service

1. Push the current source and `render.yaml` to the `main` branch of
   [SuperOoze0309/MLAFMT](https://github.com/SuperOoze0309/MLAFMT).
2. In Render, create a **Blueprint** from that repository. Sign in and authorize
   repository access when prompted. Check that the service plan is **Free** before
   creating it. The Blueprint creates one web service and no database or disk.
3. Wait for the build and initial deployment. Render assigns an `onrender.com`
   address; keep it available while configuring the custom domain.
4. Add the DNS records displayed under the service's **Settings → Custom Domains**
   for `formcapy.com`. Use the exact values shown by Render, then select **Verify**.
   Render issues and renews the TLS certificate and redirects HTTP to HTTPS.

If creating the web service manually, use these settings:

| Setting | Value |
| --- | --- |
| Repository / branch | `SuperOoze0309/MLAFMT` / `main` |
| Language | Python 3 |
| Region | Oregon |
| Instance type | Free |
| Build command | `pip install -r requirements-web.txt` |
| Start command | `gunicorn --config gunicorn.conf.py mla_web:app` |
| Health check | `/healthz` |
| Environment | `PYTHON_VERSION=3.12.15`, `FORMCAPY_PUBLIC=1`, `PYTHONUNBUFFERED=1` |

No application secret, account database, paid instance, or persistent disk is
required. `gunicorn.conf.py` listens on Render's `PORT`, with one worker and one
request thread to limit simultaneous document allocations. Requests have a
120-second worker timeout. Windows desktop/local previews continue using
`python mla_web.py`; Gunicorn runs on the Linux server.

The Blueprint deploys later commits to `main` automatically. For a rollback, use
Render's deployment history to redeploy the previous successful deployment.

### Fallback draft handling and privacy

- Public web requests send the selected draft and paper details to the Flask
  server over HTTPS. Paragraph inspection also sends the draft to that server.
- The app writes an uploaded draft to a temporary file and attempts to delete
  that file in a `finally` block after each request, including validation errors.
  An abruptly terminated process can leave a temporary file until the service's
  ephemeral filesystem is replaced. No persistent disk or document archive is
  configured.
- Generated documents are returned from memory. The browser keeps the latest
  result available for download while the page remains open. There is no account
  system, server-side document library, or cloud sync.
- API responses use `Cache-Control: no-store`. Application access logging is
  disabled in Gunicorn; the hosting provider may still process operational
  metadata such as IP addresses and request times. The app does not intentionally
  log draft text or paper details.
- Saved course templates remain in browser local storage. They contain formatting
  settings, not draft files.
- `FORMCAPY_PUBLIC=1` selects the public upload notice. A non-loopback hostname
  also selects that notice if the flag is missing. Localhost keeps the local
  server notice, and the Android native bridge keeps its offline notice.
- Uploads are limited to 20 MiB. DOCX archives also have an existing expanded-size
  limit in the document reader. Large or complex documents can still exceed the
  memory or time available on a free instance.

### Fallback free service limits

Render documents these limits for free web services as of 20 October 2026:

- The service sleeps after 15 minutes without inbound traffic. Its next request
  can take about a minute to wake it.
- Each workspace receives 750 free instance hours per month, shared by its free
  web services. Outbound bandwidth and build usage also have quotas.
- The service filesystem is ephemeral. Restarting or redeploying can replace it.
- Free services support custom domains and managed TLS. The Hobby workspace
  includes two custom domains. Confirm the dashboard's current limits before
  adding other services or domains.

The configuration explicitly sets `plan: free`; omitting that field from a
Blueprint can select a paid plan. No payment details or paid add-ons are needed
for this configuration. Review Render's dashboard if it asks to add billing or
upgrade the service.

### Render fallback references

- [Deploy Flask on Render](https://render.com/docs/deploy-flask)
- [Blueprint specification](https://render.com/docs/blueprint-spec)
- [Pin the Python version](https://render.com/docs/python-version)
- [Free service limits](https://render.com/docs/free)
- [Custom domains and TLS](https://render.com/docs/custom-domains)
- [Gunicorn settings](https://gunicorn.org/reference/settings/)
- [Gunicorn package release](https://pypi.org/project/gunicorn/26.2.0/)
