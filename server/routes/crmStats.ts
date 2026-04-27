import { Router } from "express";
import { requireSalesRole, getSalesmanId, isMaster, getBackofficeParentId } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { db } from "../repositories/base";
import { sql } from "drizzle-orm";
import { userRepository } from "../repositories";

function toRows(result: any): any[] {
  return result.rows ?? result;
}

const router = Router();

router.get("/api/crm/stats", requireSalesRole, asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const salesmanId = getSalesmanId(req);
  const backofficeParent = getBackofficeParentId(req);
  void salesmanId;
  void backofficeParent;
  const effectiveSalesmanId: number | null = null;

  let assignedCountries: string[] | null = null;
  if (effectiveSalesmanId) {
    const user = await userRepository.getById(effectiveSalesmanId);
    if (user?.assignedCountries && user.assignedCountries.length > 0) {
      assignedCountries = user.assignedCountries as string[];
    }
  }

  const salesmanFilter = effectiveSalesmanId
    ? sql`AND c.salesman_id = ${effectiveSalesmanId}`
    : sql``;

  const territoryFilter = assignedCountries
    ? sql`AND c.country = ANY(ARRAY[${sql.join(assignedCountries.map(c => sql`${c}`), sql`, `)}]::text[])`
    : sql``;

  const offerSalesmanFilter = effectiveSalesmanId
    ? sql`AND o.salesman_user_id = ${effectiveSalesmanId}`
    : sql``;

  const orderSalesmanFilter = effectiveSalesmanId
    ? sql`AND jo.responsible_user_id = ${effectiveSalesmanId}`
    : sql``;

  const interactionSalesmanFilter = effectiveSalesmanId
    ? sql`AND i.salesman_user_id = ${effectiveSalesmanId}`
    : sql``;

  const countsRaw = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM customers c WHERE c.company_id = ${companyId} ${salesmanFilter} ${territoryFilter}) AS total_companies,
      (SELECT COUNT(*) FROM contacts ct
        JOIN customers c ON ct.customer_id = c.id
        WHERE c.company_id = ${companyId} ${salesmanFilter} ${territoryFilter}) AS total_contacts,
      (SELECT COUNT(*) FROM offers o WHERE o.company_id = ${companyId} AND o.deleted_at IS NULL AND o.parent_offer_id IS NULL ${offerSalesmanFilter}) AS total_offers,
      (SELECT COUNT(*) FROM job_orders jo WHERE jo.company_id = ${companyId} AND jo.deleted_at IS NULL ${orderSalesmanFilter}) AS total_orders,
      (SELECT COUNT(*) FROM interactions i WHERE i.company_id = ${companyId} ${interactionSalesmanFilter}) AS total_interactions,
      (SELECT COUNT(*) FROM interactions i WHERE i.company_id = ${companyId} ${interactionSalesmanFilter}
        AND i.date >= NOW() - INTERVAL '7 days') AS interactions_last_7_days
  `) as any;
  const countsResult = (countsRaw.rows ?? countsRaw)[0];

  const offersByStatus = toRows(await db.execute(sql`
    SELECT
      o.status,
      COUNT(*)::int AS count,
      COALESCE(SUM(o.total_price::numeric), 0) AS total_value,
      COALESCE(AVG(o.total_price::numeric), 0) AS avg_value
    FROM offers o
    WHERE o.company_id = ${companyId}
      AND o.deleted_at IS NULL
      AND o.parent_offer_id IS NULL
      ${offerSalesmanFilter}
    GROUP BY o.status
    ORDER BY
      CASE o.status
        WHEN 'Draft' THEN 1
        WHEN 'Sent' THEN 2
        WHEN 'Accepted' THEN 3
        WHEN 'Rejected' THEN 4
        WHEN 'Expired' THEN 5
        ELSE 6
      END
  `));

  const monthlyOffers = toRows(await db.execute(sql`
    SELECT
      TO_CHAR(date_trunc('month', o.date), 'YYYY-MM') AS month,
      COUNT(*)::int AS count,
      COALESCE(SUM(o.total_price::numeric), 0) AS total_value
    FROM offers o
    WHERE o.company_id = ${companyId}
      AND o.deleted_at IS NULL
      AND o.parent_offer_id IS NULL
      AND o.date >= NOW() - INTERVAL '12 months'
      ${offerSalesmanFilter}
    GROUP BY date_trunc('month', o.date)
    ORDER BY date_trunc('month', o.date)
  `));

  const monthlyOffersPrevRaw = await db.execute(sql`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(o.total_price::numeric), 0) AS total_value
    FROM offers o
    WHERE o.company_id = ${companyId}
      AND o.deleted_at IS NULL
      AND o.parent_offer_id IS NULL
      AND o.date >= NOW() - INTERVAL '24 months'
      AND o.date < NOW() - INTERVAL '12 months'
      ${offerSalesmanFilter}
  `) as any;
  const monthlyOffersPrev = (monthlyOffersPrevRaw.rows ?? monthlyOffersPrevRaw)[0] ?? { count: 0, total_value: 0 };

  const ordersCounts = toRows(await db.execute(sql`
    SELECT
      jo.status,
      COUNT(*)::int AS count,
      COALESCE(SUM(o.total_price::numeric), 0) AS total_value
    FROM job_orders jo
    LEFT JOIN offers o ON o.id = jo.offer_id AND o.deleted_at IS NULL
    WHERE jo.company_id = ${companyId}
      AND jo.deleted_at IS NULL
      ${orderSalesmanFilter}
    GROUP BY jo.status
  `));

  const activeOrdersAgeRaw = await db.execute(sql`
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - jo.created_at)) / 86400), 0) AS avg_age_days
    FROM job_orders jo
    WHERE jo.company_id = ${companyId}
      AND jo.deleted_at IS NULL
      AND jo.status = 'active'
      ${orderSalesmanFilter}
  `) as any;
  const activeOrdersAge = (activeOrdersAgeRaw.rows ?? activeOrdersAgeRaw)[0] ?? { avg_age_days: 0 };

  const interactionsByType = toRows(await db.execute(sql`
    SELECT
      i.type,
      COUNT(*)::int AS count
    FROM interactions i
    WHERE i.company_id = ${companyId}
      AND i.date >= NOW() - INTERVAL '30 days'
      ${interactionSalesmanFilter}
    GROUP BY i.type
    ORDER BY count DESC
  `));

  const interactionsDaily = toRows(await db.execute(sql`
    SELECT
      TO_CHAR(d::date, 'YYYY-MM-DD') AS day,
      COALESCE(COUNT(i.id), 0)::int AS count
    FROM generate_series(
      (NOW() - INTERVAL '29 days')::date,
      NOW()::date,
      '1 day'::interval
    ) AS d
    LEFT JOIN interactions i
      ON i.date::date = d::date
      AND i.company_id = ${companyId}
      ${interactionSalesmanFilter}
    GROUP BY d
    ORDER BY d
  `));

  const interactionsPrevRaw = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM interactions i
    WHERE i.company_id = ${companyId}
      AND i.date >= NOW() - INTERVAL '60 days'
      AND i.date < NOW() - INTERVAL '30 days'
      ${interactionSalesmanFilter}
  `) as any;
  const interactionsPrev = (interactionsPrevRaw.rows ?? interactionsPrevRaw)[0] ?? { count: 0 };

  const topCustomers = toRows(await db.execute(sql`
    SELECT
      c.id,
      c.name,
      COUNT(DISTINCT o.id)::int AS offer_count,
      COALESCE(SUM(o.total_price::numeric), 0) AS total_value,
      (
        SELECT COUNT(*)::int FROM job_orders jo
        WHERE jo.customer_id = c.id
          AND jo.deleted_at IS NULL
          AND jo.company_id = ${companyId}
          ${orderSalesmanFilter}
      ) AS order_count,
      (
        SELECT MAX(i.date) FROM interactions i
        WHERE i.customer_id = c.id
          AND i.company_id = ${companyId}
          ${interactionSalesmanFilter}
      ) AS last_interaction_at
    FROM customers c
    JOIN offers o ON o.customer_id = c.id AND o.deleted_at IS NULL AND o.parent_offer_id IS NULL
    WHERE c.company_id = ${companyId}
      ${salesmanFilter}
      ${territoryFilter}
      ${offerSalesmanFilter}
    GROUP BY c.id, c.name
    ORDER BY total_value DESC
    LIMIT 5
  `));

  const statusCounts: Record<string, { count: number; value: number }> = {};
  for (const row of offersByStatus) {
    statusCounts[row.status] = { count: Number(row.count), value: Number(row.total_value) };
  }

  const accepted = statusCounts["Accepted"]?.count ?? 0;
  const rejected = statusCounts["Rejected"]?.count ?? 0;
  const expired = statusCounts["Expired"]?.count ?? 0;
  const closedTotal = accepted + rejected + expired;
  const conversionRate = closedTotal > 0 ? Math.round((accepted / closedTotal) * 100) : 0;

  const openOfferValue =
    (statusCounts["Draft"]?.value ?? 0) + (statusCounts["Sent"]?.value ?? 0);

  const activeOrders = ordersCounts.find((r: any) => r.status === "active")?.count ?? 0;
  const completedOrders = ordersCounts.find((r: any) => r.status === "completed")?.count ?? 0;

  const monthlyTotalCount = monthlyOffers.reduce((s: number, r: any) => s + Number(r.count), 0);
  const monthlyTotalValue = monthlyOffers.reduce((s: number, r: any) => s + Number(r.total_value), 0);
  const interactionsTotal30 = interactionsByType.reduce((s: number, r: any) => s + Number(r.count), 0);

  res.json({
    counts: {
      totalCompanies: Number((countsResult as any).total_companies),
      totalContacts: Number((countsResult as any).total_contacts),
      totalOffers: Number((countsResult as any).total_offers),
      totalOrders: Number((countsResult as any).total_orders),
      totalInteractions: Number((countsResult as any).total_interactions),
      interactionsLast7Days: Number((countsResult as any).interactions_last_7_days),
      activeOrders,
      completedOrders,
      conversionRate,
      openOfferValue: Number(openOfferValue),
    },
    offersByStatus: offersByStatus.map((r: any) => ({
      status: r.status,
      count: Number(r.count),
      value: Number(r.total_value),
      avgValue: Number(r.avg_value),
    })),
    ordersByStatus: ordersCounts.map((r: any) => ({
      status: r.status,
      count: Number(r.count),
      value: Number(r.total_value),
    })),
    activeOrdersAvgAgeDays: Math.round(Number(activeOrdersAge.avg_age_days)),
    monthlyOffers: monthlyOffers.map((r: any) => ({
      month: r.month,
      count: Number(r.count),
      value: Number(r.total_value),
    })),
    monthlyOffersTotals: {
      count: monthlyTotalCount,
      value: monthlyTotalValue,
      prevCount: Number(monthlyOffersPrev.count),
      prevValue: Number(monthlyOffersPrev.total_value),
    },
    interactionsByType: interactionsByType.map((r: any) => ({
      type: r.type,
      count: Number(r.count),
    })),
    interactionsDaily: interactionsDaily.map((r: any) => ({
      day: r.day,
      count: Number(r.count),
    })),
    interactionsTotals: {
      total30: interactionsTotal30,
      prev30: Number(interactionsPrev.count),
    },
    topCustomers: topCustomers.map((r: any) => ({
      id: Number(r.id),
      name: r.name,
      offerCount: Number(r.offer_count),
      totalValue: Number(r.total_value),
      orderCount: Number(r.order_count),
      lastInteractionAt: r.last_interaction_at ? new Date(r.last_interaction_at).toISOString() : null,
    })),
  });
}));

export default router;
