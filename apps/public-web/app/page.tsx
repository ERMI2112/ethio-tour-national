import { getApiHealth } from '@ethio-tour/api-client';

export const dynamic = 'force-dynamic';

export default async function PublicHomePage() {
  const health = await getApiHealth();

  return (
    <main>
      <h1>EthioTour National</h1>
      <p>Public web foundation</p>
      <p>
        API status: {health.status} ({health.phase})
      </p>
    </main>
  );
}
