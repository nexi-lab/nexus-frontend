export default async function teardown() {
  if (!process.env.NEXUS_TEST_ACCOUNTS_BINARY) return;
  const response = await fetch('http://127.0.0.1:4181/__fixture/shutdown', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !(await response.json()).stopped) throw new Error('Actual account fixture did not shut down');
}
