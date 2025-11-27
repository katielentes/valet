# Deployment Guide for Vercel

## Database Setup

### 1. Choose a PostgreSQL Database

For production on Vercel, you need a PostgreSQL database. Options:

- **Vercel Postgres** (Recommended - easiest integration)
- **Neon** (Serverless PostgreSQL)
- **Supabase** (PostgreSQL with additional features)
- **Railway** (Simple PostgreSQL hosting)

### 2. Update Prisma Schema

Change the database provider from SQLite to PostgreSQL:

```prisma
datasource db {
  provider = "postgresql"  // Changed from "sqlite"
  url      = env("DATABASE_URL")
}
```

### 3. Get Your Database Connection String

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

- `DATABASE_URL` - PostgreSQL connection string
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

