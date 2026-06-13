# PWAGram

A simple Instagram clone built for Maximilian Schwarzmüller's "Progressive Web Apps - Complete Guide" course on udemy.com.

# How to Use

You need [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io) installed on your machine. Simply download the Node.js installer from [nodejs.org](https://nodejs.org) and install pnpm via `npm install -g pnpm`.

Once Node.js and pnpm are installed, open your command prompt or terminal and **navigate into this project folder**. There, run `pnpm install` to install all required dependencies.

Finally, run `pnpm dev` to start the development server and visit [localhost:1338](http://localhost:1338) to see the running application.

# Configuration

The app ships with sensible defaults pointing at the original `pwagram-439bb`
Firebase project, so it runs without any setup. To point a fork at your own
Firebase backend, override the coordinates via environment variables — none of
these are secrets except `VAPID_PRIVATE_KEY`:

- **Frontend** — copy `.env.example` to `.env` and set `VITE_VAPID_PUBLIC_KEY`,
  `VITE_FIREBASE_DATABASE_URL`, and `VITE_FIREBASE_FUNCTIONS_URL`. Vite reads
  these at build time.
- **Cloud Functions** — copy `functions/.env.example` to `functions/.env` and
  set the VAPID key pair and Firebase project coordinates. The Firebase CLI
  loads this file automatically.

Generate a VAPID key pair with `npx web-push generate-vapid-keys`.
