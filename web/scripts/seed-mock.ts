import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { generateAllMockData } from '@/lib/mock-data';
import { setSnapshot } from '@/lib/snapshot';
import { indexEvent } from '@/lib/events';
import { valkey } from '@/lib/valkey';
import { db } from '@/lib/db';
import { eventsMeta } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const all = generateAllMockData();
  console.log(`Seeding ${all.length} mock events to Valkey + Neon events_meta...`);

  let n = 0;
  for (const { entry, snapshot } of all) {
    await setSnapshot(snapshot);
    await indexEvent(entry);
    n++;
  }

  await db
    .insert(eventsMeta)
    .values(
      all.map(({ entry }) => ({
        site: entry.site,
        externalEventId: entry.externalEventId,
        eventDatetime: new Date(entry.eventDatetime),
        title: entry.title,
        venue: entry.venue,
        lastCrawlAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [eventsMeta.site, eventsMeta.externalEventId, eventsMeta.eventDatetime],
      set: {
        title: sql`EXCLUDED.title`,
        venue: sql`EXCLUDED.venue`,
        lastCrawlAt: sql`EXCLUDED.last_crawl_at`,
      },
    });

  console.log(`Done. ${n} events seeded.`);
  await valkey.quit();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
