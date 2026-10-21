# FormCapy web deployment

The first public version runs the existing Flask document formatter on Render's
free Python web service. This version uploads drafts to the server. Browser-only
document processing is a separate future implementation.

## Create the service

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

## Draft handling and privacy

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

## Free service limits

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

## Official references

- [Deploy Flask on Render](https://render.com/docs/deploy-flask)
- [Blueprint specification](https://render.com/docs/blueprint-spec)
- [Pin the Python version](https://render.com/docs/python-version)
- [Free service limits](https://render.com/docs/free)
- [Custom domains and TLS](https://render.com/docs/custom-domains)
- [Gunicorn settings](https://gunicorn.org/reference/settings/)
- [Gunicorn package release](https://pypi.org/project/gunicorn/26.2.0/)
