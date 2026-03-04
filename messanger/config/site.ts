const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

if (!rawSiteUrl) {
  throw new Error('Missing required environment variable: NEXT_PUBLIC_SITE_URL');
}

const resolvedSiteUrl = rawSiteUrl.replace(/\/+$/, '');

export const site = {
  name: 'Animus',
  description:
    'Corporate digital laboratory for machine learning with explicit domain entities, governed Run execution, and Control Plane / Data Plane separation.',
  url: resolvedSiteUrl,
  ogImage: '/logo.png',
  repoUrl: 'https://github.com/grewanderer/animus-golang',
  readmeUrl: 'https://github.com/grewanderer/animus-golang/blob/main/README.md',
};
