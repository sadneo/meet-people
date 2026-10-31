# Finish setting up the hosted beta

**Start here.** The app is already live at **https://cse416-meet-people.web.app**.
This checklist covers the account access, credentials, and decisions still needed
from you. You do not need to redeploy the app or recreate its infrastructure.

**Custom-domain setup pending:** `main` targets production at `pebble.garden`
and the sandbox developer build at both `desktop.dev.pebble.garden` and
`mobile.dev.pebble.garden`. Sandbox has its own healthy Supabase project and
both GitHub environments have deployment-token secrets configured. Domain
mappings and Porkbun DNS records are configured; Firebase ownership/HTTPS
activation must finish before custom-domain release checks pass.
See [deployment operation and setup](docs/deployment.md).

## Your checklist

Do these first:

- [ ] Set up an SMTP sender for invitations and password-reset emails.
- [ ] Add the Supabase access token to GitHub's `production` environment.
- [ ] Confirm that the existing GitHub database connection secret is current.
- [ ] Confirm the Google Cloud credit balance and expiry date.

Then, when you want these features:

- [ ] Configure Google sign-in.
- [ ] Add a Gemini API key for semantic embeddings.
- [ ] Choose an email address for outage notifications.

When finished, tell me which boxes you completed. I can run the checks and finish
the release configuration. **Do not send passwords, tokens, or keys in chat:** put
them in the dashboards named below. Account email addresses and billing dates are
fine to share.

## Useful links

| Where | Link / value |
| --- | --- |
| Live application | https://cse416-meet-people.web.app |
| Hosted Supabase project | https://supabase.com/dashboard/project/wacgxhsdhrqigrmqaonc |
| Supabase personal access tokens | https://supabase.com/dashboard/account/tokens |
| GitHub production environment | https://github.com/sadneo/meet-people/settings/environments |
| GitHub repository secrets | https://github.com/sadneo/meet-people/settings/secrets/actions |
| Google Cloud project | https://console.cloud.google.com/home/dashboard?project=cse416-meet-people |
| Google Cloud Billing | https://console.cloud.google.com/billing |
| Google Auth Platform | https://console.cloud.google.com/auth/overview?project=cse416-meet-people |
| Google AI Studio API keys | https://aistudio.google.com/apikey |

Dashboard labels can move; use the section names below if a direct link opens a
different view. Make sure you select **`meet-people` / `wacgxhsdhrqigrmqaonc`** in
Supabase and **`cse416-meet-people`** in Google Cloud.

## 1. Email delivery: invitations and password resets

**You need:** an account with a transactional email provider and a verified sender.
Examples include Resend, Brevo, Postmark, and Amazon SES; choose a provider that
offers SMTP and permits sending to your testers. A provider's sandbox/test sender
may only send to your own verified address.

### A. Verify your sender with the email provider

1. Create or sign in to your chosen email provider account.
2. Open its sender/domain verification section.
3. Choose a sender address, such as `hello@your-domain.com`, and a sender name:
   **Pebble**. You cannot send from a domain you do not control simply by entering
   its address.
4. Complete the provider's verification steps. Domain verification normally means
   copying its DNS records into the account where you manage your domain. Use the
   exact records it supplies, and wait for its dashboard to show verified.
5. If you do not own a domain, use a provider-supported verified individual sender
   if available, or obtain a domain. The app can stay on `web.app`; an email domain
   does not require moving the website.
6. Find or generate the provider's **SMTP credentials**: host, port, username, and
   password. An SMTP password may be a dedicated credential/API key rather than
   your account login password; follow the provider's instructions.
7. Disable email **link/click tracking** for authentication emails so the provider
   does not rewrite Supabase's single-use links.

### B. Enter the SMTP settings in Supabase

1. Open the hosted Supabase project.
2. Go to **Authentication → Email / Emails → SMTP settings** (sometimes shown as
   **Custom SMTP**) and enable the custom SMTP server.
3. Fill in:

   | Field | Enter |
   | --- | --- |
   | Sender email | The address you verified with the provider |
   | Sender name | `Pebble` |
   | Host | The provider's SMTP hostname |
   | Port | The provider's recommended SMTP port |
   | Username | The provider's SMTP username |
   | Password | The provider's SMTP password/key |

4. Save the configuration. Leave email confirmation enabled and public signup
   disabled; the private beta uses provisioned/invited accounts.
5. Review Supabase's Auth email rate limit and the provider's sending limits. The
   custom-SMTP default can be low; use limits appropriate for a small invited beta.

**Done when:** a real external inbox receives an invitation and a password-reset
email, and the reset link opens the hosted app and lets that user set a new
password. Check spam folders if delivery is missing. A dashboard "sent" message
alone is not proof of delivery.

**Tell me:** "SMTP configured; sender is verified." I can help run the invitation
and reset flow with a test recipient you specify. Do not share the SMTP password.

## 2. GitHub's Supabase deployment token

**You need:** permission to access the Supabase project and edit GitHub environment
secrets. This token lets the release workflow deploy Supabase services; your local
CLI login is not automatically available to GitHub.

1. Open https://supabase.com/dashboard/account/tokens.
2. Generate a personal access token with a recognizable name, such as
   `pebble-github-production`. If expiry options are available, select an expiry
   you can track and renew before it lapses.
3. Copy the token; it may only be displayed once.
4. Open the GitHub repository → **Settings → Environments → production**.
5. Under **Environment secrets**, select **Add environment secret**.
6. Set the name to exactly **`SUPABASE_ACCESS_TOKEN`**, paste the token as its
   value, and save it. Use a secret, not an environment variable.
7. Do not use the Supabase publishable key, service-role key, or database password
   here. They are different credentials.

**Done when:** the `production` environment lists a secret named
`SUPABASE_ACCESS_TOKEN`. GitHub deliberately will not show its value again.

**Tell me:** "The production Supabase token is saved." I can verify it through
the release workflow without you exposing it in chat.

## 3. Confirm the database connection secret

**Already present:** a GitHub repository secret named **`SUPABASE_DB_URL`**. You
only need to replace it if its connection details/password are stale or incorrect.

1. In the Supabase project, open **Connect** and find its PostgreSQL connection
   strings.
2. For a standard GitHub-hosted runner, choose the **session pooler** connection
   on **port 5432** when IPv4 is needed. Do not choose transaction pooling on port
   6543 for this migration connection. Copy the actual dashboard-provided host;
   do not guess a region/hostname.
3. Replace the password placeholder with the project's database password—not a
   Supabase account password or API key. Percent-encode reserved characters in
   the password portion of the URL.
4. In GitHub → **Settings → Secrets and variables → Actions → Repository secrets**,
   edit `SUPABASE_DB_URL` if it needs updating. Its value should be a full
   PostgreSQL connection URL for **`wacgxhsdhrqigrmqaonc`**.
5. If you have forgotten the database password, do not reset it casually: a reset
   also affects other tools using it. Coordinate updating their stored connection
   strings if a reset is necessary.

**Done when:** the release workflow's migration **dry run** successfully connects
to the correct project. The mere presence of the secret does not validate it.
I can perform that verification after the token is saved and the workflow is
available on the release ref.

**Tell me:** whether the password is believed current, or that you updated the
secret. Do not send the connection URL or password.

## 4. Confirm your Google Cloud credits

**You need:** access to the billing account linked to `cse416-meet-people`. Project
deployment permissions do not necessarily grant access to its credit balance.

1. Open Google Cloud Billing and select the billing account attached to this
   project.
2. Look at **Overview / Credits / Free trial** for the remaining credit and its
   exact expiration date. Record both; do not assume the trial began when this
   website was deployed.
3. Confirm whether the account is still a free-trial account or has been upgraded
   to paid billing. An un-upgraded trial can stop its resources when it expires;
   paid billing can charge for usage that exceeds available credits/free usage.
4. Set a calendar reminder at least a week before the credit expires.
5. Under **Budgets & alerts**, check **Pebble beta monthly**: a $25 project-filtered
   budget already exists. Confirm the appropriate billing recipients receive its
   alerts. It tracks usage before credits, and **is not a spending cap**.
6. If the billing views are inaccessible, ask the billing-account owner for the
   balance, expiry, account status, and alert-recipient confirmation.

**Done when:** you know the balance, expiry date, account status, and who receives
budget alerts. Google credits do not cover the separate hosted Supabase bill;
Google's welcome-credit terms also exclude the Gemini API in AI Studio.

**Tell me:** the non-secret balance/expiry/status so I can help plan around them.

## 5. Optional: enable Google sign-in

**You need:** access to configure an OAuth client in Google Cloud and the Google
provider in Supabase. Skip this if you only want email/password for now; the
existing Google button will not work until its provider is configured.

1. In Supabase → **Authentication → Sign In / Providers → Google**, find the
   provider's callback URL. For this project it should be:

   ```text
   https://wacgxhsdhrqigrmqaonc.supabase.co/auth/v1/callback
   ```

2. Open Google Auth Platform in the `cse416-meet-people` Google Cloud project.
3. Complete its app branding, audience, and contact settings. Use **Pebble** as
   the app name. For the audience, choose **External** if people outside the
   organization's Google Workspace must sign in; an **Internal** app is restricted
   to that organization and may only be available for eligible organizations.
4. Under **Clients** (or **APIs & Services → Credentials**), create an OAuth client
   with application type **Web application**.
5. Add this **Authorized JavaScript origin**:

   ```text
   https://cse416-meet-people.web.app
   ```

6. Add the **Authorized redirect URI** copied from Supabase in step 1. This is the
   Supabase callback above, **not** the website's `/auth/callback` route.
7. Copy the resulting client ID and client secret into Supabase's Google provider
   settings, enable the provider, and save. Keep the client secret out of GitHub
   source and browser `VITE_*` variables.
8. If Google's consent app is in **Testing**, add each tester's Google email under
   **Audience → Test users**. Use the basic identity/email/profile scopes required
   for sign-in; this app does not need access to a tester's Gmail or Drive.
9. Leave Supabase public signup disabled. Google's test-user list is a separate
   restriction; it does not provision a Supabase account or replace beta access
   control. Test Google with an already provisioned beta user, and verify that an
   unknown user cannot register through OAuth.

**Done when:** an invited/provisioned Google user returns from Google to the app
with a valid session and the correct account, while an uninvited user is rejected.
For existing password accounts, verify account linking behaves as intended before
inviting people to switch methods.

**Tell me:** "Google provider configured," plus which test account is permitted
on the Google consent screen. Do not share its password or the OAuth secret.

## 6. Optional: semantic embeddings with Gemini

**You need:** a Gemini API key for a project whose quotas/billing you understand.
Plain profile and interest-label saves already work without it.

1. Open Google AI Studio's API key page and create/select a key for the intended
   project. Confirm the account's terms, quotas and billing before enabling use.
2. Open the hosted Supabase project → **Edge Functions → Secrets**.
3. Add a secret named exactly **`GEMINI_API_KEY`** with the key as its value.
4. Leave `EMBED_SHARED_SECRET` and `INGEST_TOKEN` alone; those were generated and
   synchronized with Vault during deployment.
5. Tell me when the key is saved. I can test `embed-interest`, its 3,072-dimensional
   output and database integration without exposing the key.

**Done when:** an authenticated provider test succeeds. Existing interest labels
with null embeddings are **not automatically backfilled** by saving the key.
Automatic group matching also remains paused until its worker is configured and
verified; an API key alone does not activate it.

## 7. Choose who gets outage notifications

**Already present:** an external HTTPS probe for `/api/health` every five minutes.
The probe currently does not have an incident-email alert policy attached.

1. Choose a monitored email address for outage alerts and tell me that address.
2. I can create the Cloud Monitoring notification channel and alert policy.
3. Complete any recipient-verification email Google sends.
4. We can verify delivery with a test notification, without intentionally taking
   the live application down.

**Done when:** the recipient receives a test notification and the channel is
attached to the uptime alert policy. This is separate from billing-budget emails.

## What I can finish without more credentials from you

Once the required secrets are ready, I can:

1. Open the pull request for `feature/onboarding-final` and run/check CI.
2. Resolve hosting/CI failures, merge when repository rules permit, and require the
   verified check on `main`. If GitHub requires another person's approval or
   restricts those settings, that person must approve/change them.
3. Push/merge into `main` for production or `dev` for both sandbox sites. These
   run full CI before deployment; version tags no longer trigger deployment.
4. Re-run hosted smoke tests, account isolation/onboarding checks, and any provider
   checks whose credentials you configured.

For infrastructure details and recovery procedures, see
[the deployment runbook](docs/hosting.md). For authentication behavior, see
[the accounts guide](docs/accounts.md).

### Official references

- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [GitHub environment secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Google Cloud trial and credits](https://cloud.google.com/free/docs/free-cloud-features)
