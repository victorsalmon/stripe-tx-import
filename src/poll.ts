import type Stripe from 'stripe';
import {
  balanceTransactionToSalesRecord,
  type AdapterOptions,
  type BalanceTransactionLike,
} from './adapter.js';
import type { SalesRecord } from './types.js';

/** One page of `GET /v1/balance_transactions`. */
export interface BalanceTransactionPage {
  data: BalanceTransactionLike[];
  has_more: boolean;
}

export interface BalanceTransactionListParams {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
}

/**
 * Minimal structural view of the balance-transaction list endpoint.
 * Accepts the real SDK resource (`stripe.balanceTransactions`) via
 * {@link createStripeBalanceTransactionClient} as well as in-memory
 * fakes — the backfill loop never touches the network directly, so it
 * is unit-testable without credentials.
 */
export interface BalanceTransactionListClient {
  list(params: BalanceTransactionListParams): Promise<BalanceTransactionPage>;
}

export interface BackfillOptions extends AdapterOptions {
  /** Records per page. Defaults to 100 (the Stripe maximum). */
  pageSize?: number;
  /** Resume cursor: only records after this balance-transaction id. */
  startingAfter?: string;
  /** Upper bound: only records before this balance-transaction id. */
  endingBefore?: string;
  /**
   * Fail-closed page cap. Defaults to 1000 pages. The loop throws when
   * the cap is reached instead of paging forever against a stuck cursor.
   */
  maxPages?: number;
  /** Called after each page is mapped (streaming sink / progress). */
  onPage?: (page: SalesRecord[], pageIndex: number) => void | Promise<void>;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 1000;

/**
 * Backfill sales history page-by-page from oldest to newest using
 * cursor pagination (`starting_after` / `ending_before`).
 *
 * Every transaction is mapped with `balanceTransactionToSalesRecord`.
 * Returns the full record list (also streamed via `onPage` when given).
 */
export async function backfillBalanceTransactions(
  client: BalanceTransactionListClient,
  opts: BackfillOptions = {},
): Promise<SalesRecord[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const records: SalesRecord[] = [];
  let cursor: string | undefined = opts.startingAfter;
  let pageIndex = 0;

  for (;;) {
    if (pageIndex >= maxPages) {
      throw new Error(
        `backfillBalanceTransactions: reached maxPages (${maxPages}) with more pages pending. ` +
          'Raise maxPages or narrow the window (startingAfter/endingBefore).',
      );
    }
    const params: BalanceTransactionListParams = { limit: pageSize };
    if (cursor !== undefined) params.starting_after = cursor;
    if (opts.endingBefore !== undefined) params.ending_before = opts.endingBefore;
    const page = await client.list(params);
    const mapped = page.data.map((bt) =>
      balanceTransactionToSalesRecord(bt, { chargeTaxCents: opts.chargeTaxCents }),
    );
    records.push(...mapped);
    if (opts.onPage) await opts.onPage(mapped, pageIndex);
    pageIndex += 1;
    if (!page.has_more || page.data.length === 0) break;
    cursor = page.data[page.data.length - 1].id;
  }

  return records;
}

/**
 * Adapt a live Stripe SDK instance to {@link BalanceTransactionListClient}.
 * This is the only function in the library that performs network I/O.
 */
export function createStripeBalanceTransactionClient(
  stripe: Pick<Stripe, 'balanceTransactions'>,
): BalanceTransactionListClient {
  return {
    async list(params: BalanceTransactionListParams): Promise<BalanceTransactionPage> {
      const page = await stripe.balanceTransactions.list({ ...params });
      return { data: page.data, has_more: page.has_more };
    },
  };
}
