import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export async function docker(args) {
  return (await execute('docker', args, { maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
}
const lines = value => value ? value.split('\n').filter(Boolean) : [];
export async function imageInventory() { return lines(await docker(['image', 'ls', '-aq', '--no-trunc'])); }

export function assertContainerOwner(run, container) {
  const labels = container.Config.Labels ?? {};
  if (labels['com.supabase.cli.project'] !== run.projectId || labels['com.supabase.cli.workdir'] !== run.workdir) {
    throw new Error('Container ownership does not match this QA run. Refusing cleanup.');
  }
}

export function assertNetworkOwner(run, network, containers) {
  if (network.Labels?.['com.supabase.cli.project'] !== run.projectId
    || network.Labels?.['com.supabase.cli.workdir'] !== run.workdir
    || Object.keys(network.Containers ?? {}).some(member => !containers.some(container => container.Id === member))) {
    throw new Error('QA network has an unrelated member or ownership mismatch.');
  }
}

export function canRemoveImage(run, imageId, used) { return !run.imagesBefore.includes(imageId) && !used.has(imageId); }

export async function inventory(run) {
  const filter = `label=com.supabase.cli.project=${run.projectId}`;
  const ids = lines(await docker(['ps', '-aq', '--filter', filter]));
  const containers = ids.length ? JSON.parse(await docker(['inspect', ...ids])) : [];
  for (const container of containers) assertContainerOwner(run, container);
  const volumes = lines(await docker(['volume', 'ls', '-q', '--filter', filter]));
  const networks = lines(await docker(['network', 'ls', '-q', '--filter', filter]));
  for (const name of volumes) {
    const [volume] = JSON.parse(await docker(['volume', 'inspect', name]));
    if (volume.Labels?.['com.supabase.cli.project'] !== run.projectId) throw new Error('Volume ownership mismatch.');
  }
  for (const id of networks) {
    const [network] = JSON.parse(await docker(['network', 'inspect', id]));
    assertNetworkOwner(run, network, containers);
  }
  return { containers, volumes, networks };
}

export async function stopContainers(run) {
  const { containers } = await inventory(run);
  const running = containers.filter(container => container.State.Running).map(container => container.Id);
  if (running.length) await docker(['stop', '--timeout', '15', ...running]);
}

export async function removeResources(run, removeImages) {
  const resources = await inventory(run);
  const refs = [...new Set([...run.imageRefs, ...resources.containers.map(container => container.Config.Image)])];
  const ids = resources.containers.map(container => container.Id);
  if (ids.length) await docker(['rm', ...ids]);
  // Docker itself refuses to remove a volume/network used by another container.
  if (resources.volumes.length) await docker(['volume', 'rm', ...resources.volumes]);
  if (resources.networks.length) await docker(['network', 'rm', ...resources.networks]);
  const retainedImages = [], removedImages = [];
  if (removeImages) {
    const others = lines(await docker(['ps', '-aq']));
    const used = new Set(others.length ? JSON.parse(await docker(['inspect', ...others])).map(container => container.Image) : []);
    for (const ref of refs) {
      let image;
      try { [image] = JSON.parse(await docker(['image', 'inspect', ref])); }
      catch { continue; }
      if (!canRemoveImage(run, image.Id, used)) { retainedImages.push(ref); continue; }
      try { await docker(['image', 'rm', ref]); removedImages.push(ref); }
      catch { retainedImages.push(ref); }
    }
  }
  const remaining = await inventory(run);
  if (remaining.containers.length || remaining.volumes.length || remaining.networks.length) throw new Error('Docker cleanup incomplete; manifest retained.');
  return { containers: ids.length, volumes: resources.volumes.length, networks: resources.networks.length, removedImages, retainedImages };
}
