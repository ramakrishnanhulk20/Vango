# Deploying the docs site

Ram's part is the clicking. These are the exact settings.

## Vercel, new project

| Setting | Value |
|---|---|
| Repository | this repo |
| Root Directory | `packages/docs` |
| Framework Preset | Docusaurus (Vercel shows it as "Docusaurus 2") |
| Build Command | `npm run build` |
| Output Directory | `build` |
| Install Command | `npm install` |
| Node version | 20 or newer |
| Environment variables | none |

`packages/docs/vercel.json` already carries the framework, build command and output directory, so
the dashboard should fill those in on its own. Set the Root Directory by hand: without it, Vercel
builds the repo root and finds no site.

## After the first deploy

1. Open the Vercel URL and check the landing page, `/docs/developers/architecture` (three
   diagrams should render), and `/docs/faq`.
2. If the site gets its own domain, change `url` in `docusaurus.config.ts` to match. It is
   currently `https://docs.vango.app`, and it only affects absolute links and metadata, not
   routing.
3. Two placeholders to fill when the repo goes public: the navbar GitHub link is `#`, in
   `docusaurus.config.ts`.

## Local check before deploying

```bash
cd packages/docs
npm run build
npx docusaurus serve --port 3005
```

The build fails on a broken internal link on purpose, so a clean build means every link on the
site resolves.
