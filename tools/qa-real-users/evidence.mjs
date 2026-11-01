import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson } from './state.mjs';

// Resume must append evidence and retain the run's action budget, not silently
// replace earlier findings or reuse screenshot names.
export async function evidenceHistory(directory) {
  const history = {};
  for (const name of ['actions', 'problems', 'findings', 'coverage']) {
    try {
      history[name] = await readJson(join(directory, `${name}.json`));
      if (!Array.isArray(history[name])) throw new Error('Invalid QA evidence history.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      history[name] = [];
    }
  }
  history.sequence = (await readdir(directory)).reduce((highest, name) => {
    const match = /^checkpoint-(\d+)\.png$/.exec(name);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return history;
}
