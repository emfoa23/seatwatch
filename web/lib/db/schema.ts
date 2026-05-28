import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigserial,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    displayName: text('display_name'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  })
);

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    providerUnique: uniqueIndex('oauth_provider_account_unique').on(t.provider, t.providerAccountId),
    userIdx: index('oauth_user_idx').on(t.userId),
  })
);

export const slotInventory = pgTable('slot_inventory', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  freeSlots: integer('free_slots').default(1).notNull(),
  paidSlots: integer('paid_slots').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    orderId: text('order_id').notNull(),
    tossPaymentKey: text('toss_payment_key'),
    amountKrw: integer('amount_krw').notNull(),
    slotsGranted: integer('slots_granted').default(1).notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
  },
  (t) => ({
    orderIdUnique: uniqueIndex('payments_order_id_unique').on(t.orderId),
    tossKeyUnique: uniqueIndex('payments_toss_key_unique').on(t.tossPaymentKey),
    userStatusIdx: index('payments_user_status_idx').on(t.userId, t.status),
  })
);

export const watchTargets = pgTable(
  'watch_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    site: text('site').notNull(),
    externalEventId: text('external_event_id').notNull(),
    eventDatetime: timestamp('event_datetime', { withTimezone: true }).notNull(),
    seatSelector: jsonb('seat_selector').notNull(),
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  },
  (t) => ({
    eventIdx: index('watch_event_idx').on(t.site, t.externalEventId, t.eventDatetime),
    userStatusIdx: index('watch_user_status_idx').on(t.userId, t.status),
    activeIdx: index('watch_active_idx')
      .on(t.site, t.externalEventId, t.eventDatetime)
      .where(sql`status = 'active'`),
  })
);

export const seatEvents = pgTable(
  'seat_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    site: text('site').notNull(),
    externalEventId: text('external_event_id').notNull(),
    eventDatetime: timestamp('event_datetime', { withTimezone: true }).notNull(),
    seatId: text('seat_id').notNull(),
    oldStatus: text('old_status'),
    newStatus: text('new_status').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventTimeIdx: index('seat_events_event_time_idx').on(t.site, t.externalEventId, t.observedAt),
  })
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    watchTargetId: uuid('watch_target_id')
      .references(() => watchTargets.id, { onDelete: 'cascade' })
      .notNull(),
    channel: text('channel').default('email').notNull(),
    status: text('status').default('queued').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    dedupeUnique: uniqueIndex('notifications_dedupe_unique').on(t.dedupeKey),
    userSentIdx: index('notifications_user_sent_idx').on(t.userId, t.sentAt),
  })
);

export const crawlJobs = pgTable(
  'crawl_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    site: text('site').notNull(),
    runId: text('run_id'),
    status: text('status').notNull(),
    seatsFetched: integer('seats_fetched').default(0).notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    siteStartedIdx: index('crawl_jobs_site_started_idx').on(t.site, t.startedAt),
  })
);

export const eventsMeta = pgTable(
  'events_meta',
  {
    site: text('site').notNull(),
    externalEventId: text('external_event_id').notNull(),
    eventDatetime: timestamp('event_datetime', { withTimezone: true }).notNull(),
    title: text('title'),
    venue: text('venue'),
    lastCrawlAt: timestamp('last_crawl_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.site, t.externalEventId, t.eventDatetime] }),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type WatchTarget = typeof watchTargets.$inferSelect;
export type NewWatchTarget = typeof watchTargets.$inferInsert;
export type Payment = typeof payments.$inferSelect;
