# TrainedBest — Deploy Guide

## What you need before starting
- A laptop or desktop (Mac or Windows)
- Node.js installed → download at nodejs.org (LTS version)
- A GitHub account → github.com (free)
- A Vercel account → vercel.com (free, sign up with GitHub)
- Your Anthropic API key → console.anthropic.com (starts with sk-ant-)

---

## Step 1 — Test it locally

Open Terminal (Mac) or Command Prompt (Windows), navigate to this folder, then run:

```
npm install
```

Then create a file called `.env.local` in this folder and add:
```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

Then run:
```
npm run dev
```

Open http://localhost:3000 — your app should load and all AI features should work.

---

## Step 2 — Push to GitHub

On github.com: New repository → name it `trainedbest` → Public → Create.

Then in Terminal, run these 4 lines (replace YOUR_USERNAME with your GitHub username):

```
git init
git add .
git commit -m "TrainedBest initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/trainedbest.git
git push -u origin main
```

---

## Step 3 — Deploy on Vercel

1. Go to vercel.com → Add New → Project
2. Import your trainedbest repository from GitHub
3. Under Environment Variables, add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key (sk-ant-...)
4. Click Deploy

Your app will be live at a URL like `trainedbest.vercel.app` in about 2 minutes.

---

## How to update the app later

1. Make changes with Claude (same as before)
2. Replace the files in this folder
3. Run in Terminal:
```
git add .
git commit -m "Update description here"
git push
```
Vercel automatically detects the push and redeploys. Takes about 2 minutes.

---

## How the AI proxy works

`api/chat.js` is a serverless function that runs on Vercel's servers.
Your app calls `/api/chat` → Vercel adds your secret key → forwards to Anthropic.
Your API key never touches the browser. Nobody can steal it.
