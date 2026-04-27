import { Router } from "express";
import { requireSalesRole, getSalesmanId, isMaster, getBackofficeParentId } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { db } from "../repositories/base";
import { sql } from "drizzle-orm";
import { userRepository } from "../repositories";
import { COUNTRY_CENTROIDS } from "../../shared/countryCentroids";
import { WORLD_COUNTRIES } from "../../shared/schema";
import { geocodeMissingCustomers } from "../services/geocoding";

const router = Router();

router.get("/api/crm/map-data", requireSalesRole, asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const salesmanId = getSalesmanId(req);
  const backofficeParent = getBackofficeParentId(req);
  void salesmanId;
  void backofficeParent;
  let effectiveSalesmanId: number | null = null;

  const masterFilterSalesmanId = isMaster(req) && req.query.salesmanId ? Number(req.query.salesmanId) : null;
  const masterFilterDealerId = isMaster(req) && req.query.dealerId ? Number(req.query.dealerId) : null;

  if (masterFilterSalesmanId) {
    effectiveSalesmanId = masterFilterSalesmanId;
  }

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

  const dealerFilter = masterFilterDealerId
    ? sql`AND c.dealer_id = ${masterFilterDealerId}`
    : sql``;

  let territoryFilter = sql``;
  if (assignedCountries) {
    const codeToName = new Map<string, string>();
    for (const wc of WORLD_COUNTRIES) {
      codeToName.set(wc.code, wc.name);
    }
    const matchValues = [
      ...assignedCountries,
      ...assignedCountries.map(code => codeToName.get(code)).filter(Boolean) as string[],
    ];
    territoryFilter = sql`AND c.country = ANY(ARRAY[${sql.join(matchValues.map(c => sql`${c}`), sql`, `)}]::text[])`;
  }

  const offerSalesmanFilter = effectiveSalesmanId
    ? sql`AND o.salesman_user_id = ${effectiveSalesmanId}`
    : sql``;

  const orderSalesmanFilter = effectiveSalesmanId
    ? sql`AND jo.responsible_user_id = ${effectiveSalesmanId}`
    : sql``;

  const rawResult = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.city,
      c.country,
      c.address,
      c.latitude,
      c.longitude,
      COUNT(DISTINCT ct.id)::int AS contact_count,
      COUNT(DISTINCT o.id)::int AS offer_count,
      COUNT(DISTINCT jo.id)::int AS order_count
    FROM customers c
    LEFT JOIN contacts ct ON ct.customer_id = c.id
    LEFT JOIN offers o ON o.customer_id = c.id AND o.deleted_at IS NULL AND o.parent_offer_id IS NULL ${offerSalesmanFilter}
    LEFT JOIN job_orders jo ON jo.customer_id = c.id AND jo.deleted_at IS NULL ${orderSalesmanFilter}
    WHERE c.company_id = ${companyId}
      ${salesmanFilter}
      ${dealerFilter}
      ${territoryFilter}
    GROUP BY c.id, c.name, c.city, c.country, c.address, c.latitude, c.longitude
    ORDER BY c.name
  `) as any;
  const rows: any[] = rawResult.rows ?? rawResult;

  const nameToCode = new Map<string, string>();
  const codeToName = new Map<string, string>();
  for (const wc of WORLD_COUNTRIES) {
    nameToCode.set(wc.name.toLowerCase(), wc.code);
    codeToName.set(wc.code, wc.name);
  }

  const result = rows
    .map((r: any) => {
      const lat = r.latitude ? parseFloat(r.latitude) : null;
      const lng = r.longitude ? parseFloat(r.longitude) : null;

      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        return {
          id: r.id,
          name: r.name,
          city: r.city || null,
          country: r.country || null,
          address: r.address || null,
          lat,
          lng,
          contactCount: Number(r.contact_count),
          offerCount: Number(r.offer_count),
          orderCount: Number(r.order_count),
          geocoded: true,
        };
      }

      const raw = (r.country ?? "").trim();
      if (!raw) return null;
      let code = nameToCode.get(raw.toLowerCase()) ?? null;
      if (!code && raw.length === 2) {
        const upper = raw.toUpperCase();
        if (COUNTRY_CENTROIDS[upper]) code = upper;
      }
      if (!code) return null;
      const centroid = COUNTRY_CENTROIDS[code];
      if (!centroid) return null;

      return {
        id: r.id,
        name: r.name,
        city: r.city || null,
        country: r.country || null,
        address: r.address || null,
        lat: centroid.lat + (Math.random() - 0.5) * 2,
        lng: centroid.lng + (Math.random() - 0.5) * 2,
        contactCount: Number(r.contact_count),
        offerCount: Number(r.offer_count),
        orderCount: Number(r.order_count),
        geocoded: false,
      };
    })
    .filter(Boolean);

  res.json(result);
}));

router.post("/api/crm/geocode", requireSalesRole, asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  if (!isMaster(req)) {
    return res.status(403).json({ error: "Only master users can trigger geocoding" });
  }

  const geocoded = await geocodeMissingCustomers(companyId!);
  res.json({ geocoded, message: `Geocoded ${geocoded} customers` });
}));

router.get("/api/crm/customer-map-detail/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const customerId = Number(req.params.id);
  const companyId = req.companyId;

  const contactsResult = await db.execute(sql`
    SELECT id, first_name, last_name, email, mobile, contact_role
    FROM contacts
    WHERE customer_id = ${customerId}
    ORDER BY last_name, first_name
  `) as any;
  const contactRows = contactsResult.rows ?? contactsResult;

  const offersResult = await db.execute(sql`
    SELECT id, reference_number, subject, date, total_price, status
    FROM offers
    WHERE customer_id = ${customerId}
      AND company_id = ${companyId}
      AND deleted_at IS NULL
      AND parent_offer_id IS NULL
    ORDER BY date DESC
    LIMIT 20
  `) as any;
  const offerRows = offersResult.rows ?? offersResult;

  const ordersResult = await db.execute(sql`
    SELECT id, job_number, job_code, status, created_at
    FROM job_orders
    WHERE customer_id = ${customerId}
      AND company_id = ${companyId}
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 20
  `) as any;
  const orderRows = ordersResult.rows ?? ordersResult;

  res.json({
    contacts: contactRows.map((r: any) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email || null,
      mobile: r.mobile || null,
      roles: r.contact_role || [],
    })),
    offers: offerRows.map((r: any) => ({
      id: r.id,
      referenceNumber: r.reference_number,
      subject: r.subject,
      date: r.date,
      totalPrice: Number(r.total_price),
      status: r.status,
    })),
    orders: orderRows.map((r: any) => ({
      id: r.id,
      jobNumber: r.job_number,
      jobCode: r.job_code || null,
      status: r.status,
      year: r.created_at ? new Date(r.created_at).getFullYear() : null,
    })),
  });
}));

export default router;
