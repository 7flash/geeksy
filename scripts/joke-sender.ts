// scripts/joke-sender.ts — Random joke script
// Env vars injected by scheduler: AGENT_ID, STATE_URL
const AGENT_ID = process.env.AGENT_ID!;
const STATE_URL = process.env.STATE_URL!;

const jokes = [
  { id: 1, setup: "Why don't scientists trust atoms?", punchline: "Because they make up everything!" },
  { id: 2, setup: "What do you call a fish with no eyes?", punchline: "Fsh!" },
  { id: 3, setup: "How do you organize a space party?", punchline: "You planet!" },
  { id: 4, setup: "Why did the scarecrow win an award?", punchline: "Because he was outstanding in his field!" },
  { id: 5, setup: "What do you call a boomerang that won't come back?", punchline: "A stick!" }
];

async function getState(key: string): Promise<string | null> {
  const res = await fetch(`${STATE_URL}?agentId=${AGENT_ID}&key=${encodeURIComponent(key)}`);
  const data = await res.json();
  return data.value ?? null;
}

async function setState(key: string, value: string): Promise<void> {
  await fetch(STATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: Number(AGENT_ID), key, value }),
  });
}

async function tellJoke() {
  const raw = await getState('used_joke_ids');
  let usedJokeIds: number[] = raw ? JSON.parse(raw) : [];
  let availableJokes = jokes.filter(joke => !usedJokeIds.includes(joke.id));

  if (availableJokes.length === 0) {
    console.log("All jokes told! Resetting joke list.");
    usedJokeIds = [];
    availableJokes = jokes;
  }

  const randomIndex = Math.floor(Math.random() * availableJokes.length);
  const selectedJoke = availableJokes[randomIndex];

  console.log(`\n${selectedJoke.setup}\n${selectedJoke.punchline}\n`);

  usedJokeIds.push(selectedJoke.id);
  await setState('used_joke_ids', JSON.stringify(usedJokeIds));
}

tellJoke();

