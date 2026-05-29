# Vercel Deployment Guide

Status: v4.9 deployment readiness for internal CRM and WhatsApp closed-test webhook.

## 1. Import Project

1. Open Vercel.
2. Create a new project.
3. Import the Git repository or upload/connect the project source.
4. Choose framework preset: `Next.js`.
   Framework preset: Next.js.
5. Set root folder to:

```text
LIMM_AI_Sales_Command_Centre_v3
```

If the repository root is already this folder, leave Root Directory as the project root.

## 2. Build Settings

Use the defaults:

```text
Install Command: npm install
Build Command: npm run build
Output Directory: .next
Development Command: npm run dev
```

No `vercel.json` is required for v4.9.

Build command: `npm run build`

## 3. Add Environment Variables

Add all required variables from:

```text
PRODUCTION_ENV_VARS_CHECKLIST.md
```

Critical safety values for first deployment:

```text
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false
OPENAI_BRAIN_DRY_RUN=false
NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=false
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `WHATSAPP_ACCESS_TOKEN` in any `NEXT_PUBLIC_` variable.

No public WhatsApp auto-reply is enabled in v4.9.

## 4. Deploy

Click Deploy.

After deployment:

1. Open the Vercel deployment.
2. Confirm `/login` loads.
3. Confirm protected routes require login.
4. Confirm `/review-chatgpt-ui` is unavailable by default.
5. Confirm `/api/whatsapp/webhook` exists.

## 5. Find Live URL

Vercel will show a deployment URL such as:

```text
https://YOUR-VERCEL-URL
```

The WhatsApp webhook callback URL will be:

```text
https://YOUR-VERCEL-URL/api/whatsapp/webhook
```

## 6. Redeploy After Environment Changes

After changing Vercel environment variables:

1. Save the variables.
2. Go to Deployments.
3. Redeploy the latest deployment.

## 7. What Remains Disabled

- Public WhatsApp auto-reply.
- Calendar booking.
- Auto-pricing.
- Quote ranges.
- WhatsApp blasting.
- Review route in production.
