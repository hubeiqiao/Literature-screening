# Configuration

This project requires several secrets to be present at runtime. Copy `.env.example` to `.env.local` (or `.env`) and set every value before building or deploying the app.

```bash
cp .env.example .env.local
```

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Server-side fallback API key used when a client does not supply their own OpenRouter credentials. |
| `NEXTAUTH_SECRET` | Secret used to encrypt NextAuth.js session tokens. Generate with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client credentials for Google sign-in. |
| `GOOGLE_PROJECT_ID` | Google Cloud project that owns the credentials below. |
| `GOOGLE_APPLICATION_CREDENTIALS_B64` | Base64-encoded Google Cloud service-account JSON used for server-to-server access. |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | Stripe API keys for creating Checkout sessions. |
| `STRIPE_PRICE_ID` | Identifier of the recurring/one-time price configured in the Stripe Dashboard. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret used to verify Stripe webhooks. |

> **Note:** Setting the optional environment variable `SKIP_ENV_VALIDATION=true` disables runtime validation. This is useful for unit tests or other tooling that stubs secrets, but it should never be set in staging or production.

## Google Cloud setup

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and select your project (or create a new one).
2. Enable any APIs you plan to call (e.g., Google Drive or custom Vertex AI endpoints).
3. Navigate to **APIs & Services → OAuth consent screen** and configure the consent details if you have not done so.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID** to generate the OAuth client used by NextAuth.js. Record the resulting `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values.
5. From the same **Credentials** page, click **Create Credentials → Service account**. Assign the minimal roles needed for your workflows (for example, `Vertex AI User`). Ensure the account also has permission to write to Firestore (for example, the `Cloud Datastore User` role) so run history can be persisted. After the account is created, open it and add a new key under the **Keys** tab. Choose JSON to download a file such as `service-account.json`.
6. Encode the downloaded JSON file to base64 and remove newlines before pasting it into `.env.local`:

   ```bash
   # macOS/Linux
   base64 -w0 service-account.json

   # macOS (BSD base64)
   base64 service-account.json | tr -d '\n'
   ```

   ```powershell
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
   ```

7. Paste the resulting one-line string into `GOOGLE_APPLICATION_CREDENTIALS_B64`. Update `GOOGLE_PROJECT_ID` to match the project where you created the service account.
8. Enable [Firestore](https://console.cloud.google.com/firestore) in Native mode if it is not already available. The triage APIs store run history documents in Firestore.

## Stripe keys

1. Sign in to the [Stripe Dashboard](https://dashboard.stripe.com/) and switch to the correct workspace.
2. Navigate to **Developers → API keys**. Reveal the secret key and copy it into `STRIPE_SECRET_KEY`. Copy the publishable key into `STRIPE_PUBLISHABLE_KEY`.
3. Create a product and price under **Products** if one does not already exist. Open the price details page and copy the **Price ID** (e.g., `price_12345`) into `STRIPE_PRICE_ID`.
4. Configure a webhook endpoint under **Developers → Webhooks** that points to your deployment (for example, `/api/billing/webhook`). After creating the endpoint, copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
5. Enable the [Stripe Customer Portal](https://dashboard.stripe.com/test/settings/billing/portal) if you plan to expose the **Manage billing** button. Configure the default return URL to point back to your deployment.
6. Deployments should run with test keys first. Swap in your live keys once you are ready to accept payments.

With these values in place, restart the development server to ensure the runtime validator sees the updated environment.
