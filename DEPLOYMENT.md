# Deployment Guide for Vercel

## Database Setup

### 1. Choose a PostgreSQL Database

For production on Vercel, you need a PostgreSQL database. Options:

- **Prisma Postgres** (Recommended - Vercel Marketplace integration, designed for serverless)
- **Vercel Postgres** (Native Vercel integration)
- **Neon** (Serverless PostgreSQL)
- **Supabase** (PostgreSQL with additional features)
- **Railway** (Simple PostgreSQL hosting)

### Option A: Prisma Postgres (Recommended for Prisma Projects)

**Prisma Postgres** is a Vercel Marketplace integration specifically designed for serverless applications using Prisma ORM. It's perfect for this project!

#### Setup Steps:

1. **Install Prisma Postgres Integration:**
   - Go to your Vercel project dashboard
   - Navigate to **Storage** → **Marketplace**
   - Search for "Prisma" and click **Install** on "Prisma Postgres"
   - Follow the installation wizard

2. **Automatic Configuration:**
   - The integration automatically sets the `DATABASE_URL` environment variable
   - No manual connection string needed!

3. **Benefits:**
   - ✅ Zero cold starts
   - ✅ Built-in global caching
   - ✅ Scalable connection pooling
   - ✅ Generous free tier
   - ✅ Visual data management in Vercel dashboard
   - ✅ AI-powered performance tips

4. **Pricing:**
   - Charges per operation (reads, writes, queries)
   - Simple, predictable pricing
   - Free tier available
   - Learn more: [Prisma Postgres Pricing](https://vercel.com/marketplace/prisma)

**Note:** Prisma Postgres requires Prisma ORM (which you're already using), so this is a perfect fit!

### Option B: Other PostgreSQL Providers

### 2. Update Prisma Schema

Change the database provider from SQLite to PostgreSQL:

```prisma
datasource db {
  provider = "postgresql"  // Changed from "sqlite"
  url      = env("DATABASE_URL")
}
```

**If using Prisma Postgres:** The `DATABASE_URL` is automatically set by the integration, so you don't need to manually configure it.

### 3. Get Your Database Connection String (Only if NOT using Prisma Postgres)

The connection string format for PostgreSQL:
```
postgresql://user:password@host:port/database?sslmode=require
```

**For Vercel Postgres:**
- Go to your Vercel project → Storage → Postgres
- Copy the connection string from the `.env.local` tab

**For Neon/Supabase/Railway:**
- Copy the connection string from your database dashboard
- Make sure it includes `?sslmode=require` for secure connections

### 4. Set Environment Variables in Vercel

**If using Prisma Postgres:** Skip this step - the `DATABASE_URL` is automatically set by the integration.

**If using another provider:**

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

```
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

**Important:** Set this for **Production**, **Preview**, and **Development** environments as needed.

### 5. Run Migrations

After setting up the database, you need to run migrations:

**Option A: Using Vercel Build Command (Recommended)**

Add to your `package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "vercel-build": "prisma migrate deploy && next build"
  }
}
```

**Option B: Manual Migration**

Run migrations manually before deploying:
```bash
npx prisma migrate deploy
```

### 6. Generate Prisma Client

Make sure Prisma Client is generated during build. Add to `package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

### 7. Update Build Settings in Vercel

In Vercel project settings:
- **Build Command:** `npm run vercel-build` (or `prisma migrate deploy && next build`)
- **Install Command:** `npm install` (default)
- **Output Directory:** `.next` (default for Next.js)

### 8. Environment Variables Checklist

Make sure all these are set in Vercel:

- `DATABASE_URL` - PostgreSQL connection string (automatically set if using Prisma Postgres integration)
- `TWILIO_SID` - Your Twilio Account SID
- `TWILIO_AUTH` - Your Twilio Auth Token
- `TWILIO_FROM_NUMBER` - (Optional) Your Twilio phone number
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - (Optional) For webhook verification
- `SESSION_SECRET` - (If you have one) Secret for session encryption

### 9. Deploy

1. Push your code to GitHub/GitLab/Bitbucket
2. Connect the repository to Vercel
3. Vercel will automatically detect Next.js and deploy
4. The build process will run migrations and generate Prisma Client

### Troubleshooting

**Migration Issues:**
- Make sure `DATABASE_URL` is set correctly
- Check that the database is accessible from Vercel's IP ranges
- Verify SSL mode is set (`?sslmode=require`)

**Connection Issues:**
- Ensure your database allows connections from Vercel
- Check firewall settings if using a self-hosted database
- Verify credentials are correct

**Build Failures:**
- Check build logs in Vercel dashboard
- Ensure `prisma generate` runs before build
- Verify all environment variables are set

