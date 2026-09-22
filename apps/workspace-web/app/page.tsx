import { getApiHealth } from '@ethio-tour/api-client';

export const dynamic = 'force-dynamic';

export default async function WorkspaceHomePage() {
  const health = await getApiHealth();

  return (
    <main>
      <h1>EthioTour Workspace</h1>
      <p>Workspace foundation</p>
      <p>
        API status: {health.status} ({health.phase})
      </p>
    </main>
  );
}
