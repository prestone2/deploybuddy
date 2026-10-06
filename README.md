# DeployBuddy

A humorous production deployment reality check, built with Vite, React, TypeScript, Tailwind CSS, and Lucide React.

## Run locally

```sh
npm install
npm run dev
```

## Checks

```sh
npm run build
npm run lint
```

The form calculates a verdict when submitted. Changed inputs are marked until recalculation. All risk rules live in `src/lib/calculateRisk.ts`; contextual messages live in `src/lib/generateVerdict.ts`. Theme preferences persist in localStorage. Sharing copies the calculated verdict to the clipboard and displays feedback; clipboard access requires localhost or HTTPS.

The UI includes responsive cards, a CSS robot mascot, an animated risk gauge, reduced-motion support, and informational About and fictional Wall of Shame views. No backend or external images are required.

## Wall of Shame

Visit `/wall-of-shame` to review saved risky attempts. After calculating risk of at least 31%, explicitly choose **Add to Wall of Shame**. Entries stay in browser-local storage across refreshes, with random condition-aware titles, four sort modes, summary statistics, and five locally derived achievements. Delete entries individually or confirm **Clear Wall of Shame** in the keyboard-accessible dialog. Removing entries also updates their achievements. Storage access and record validation live in `src/lib/wallOfShame.ts`; no account, backend, or database is used.

Routing uses React Router. Production static hosting should serve `index.html` for unknown paths so direct visits to `/wall-of-shame` and `/about` work.
# deploybuddy
