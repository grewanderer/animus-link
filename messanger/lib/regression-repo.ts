const owner = process.env.GITHUB_REPO_OWNER?.trim() || 'grewanderer';
const repo = process.env.GITHUB_REPO_NAME?.trim() || 'animus_coder';

const webBase = `https://github.com/${owner}/${repo}`;
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

function cleanSha(sha?: string) {
  if (!sha) return '';
  return sha.trim();
}

export const regressionRepo = {
  owner,
  repo,
  fullName: `${owner}/${repo}`,
  webBase,
  apiBase,
  commitsApi: `${apiBase}/commits`,
  issuesApi: `${apiBase}/issues`,
  contributorsApi: `${apiBase}/contributors`,
  releasesApi: `${apiBase}/releases`,
  commitWeb: (sha?: string) => `${webBase}/commit/${cleanSha(sha)}`,
  issuesWeb: `${webBase}/issues`,
  contributorsWeb: `${webBase}/graphs/contributors`,
  releasesWeb: `${webBase}/releases`,
};
