// scripts/fun-fact-sender.ts — Random fun fact script
// Env vars injected by scheduler: AGENT_ID, STATE_URL
const AGENT_ID = process.env.AGENT_ID!;
const STATE_URL = process.env.STATE_URL!;

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

const funFacts: string[] = [
  "🌍 Honey never spoils. Archaeologists found 3,000-year-old honey in Egyptian tombs — still edible!",
  "🦉 A group of owls is called a parliament.",
  "⚔️ The shortest war in history was between Britain and Zanzibar in 1896. It lasted 38 minutes.",
  "♟️ There are more possible chess games than atoms in the known universe.",
  "🧠 The human brain weighs ~3 pounds but uses 20% of the body's oxygen and calories.",
  "🍌 Bananas are berries, but strawberries aren't.",
  "🧱 The Great Wall of China is NOT visible from space with the naked eye.",
  "🐙 Octopuses have three hearts: two for gills, one for the body.",
  "⏱️ A 'jiffy' is an actual unit of time: 1/100th of a second.",
  "🚶 The average person walks the equivalent of 3x around the world in their lifetime.",
  "💪 The strongest muscle in the body is the masseter (jaw muscle).",
  "🐜 The total weight of all ants on Earth roughly equals the total weight of all humans.",
  "🌊 More than 80% of the ocean has never been explored.",
];

async function main() {
  const raw = await getState('used_facts');
  let used: string[] = raw ? JSON.parse(raw) : [];

  const available = funFacts.filter(f => !used.includes(f));
  if (available.length === 0) {
    used = [];
  }

  const pool = available.length > 0 ? available : funFacts;
  const fact = pool[Math.floor(Math.random() * pool.length)];
  used.push(fact);
  await setState('used_facts', JSON.stringify(used));
  console.log(fact);
}

main();
