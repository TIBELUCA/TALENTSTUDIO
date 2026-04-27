import { db } from "../repositories/base";
import { sql } from "drizzle-orm";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const RATE_LIMIT_MS = 1100;

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

function buildAddressQuery(customer: {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  province?: string | null;
  region?: string | null;
}): string | null {
  const parts: string[] = [];
  if (customer.address) parts.push(customer.address);
  if (customer.city) parts.push(customer.city);
  if (customer.postalCode) parts.push(customer.postalCode);
  if (customer.province) parts.push(customer.province);
  if (customer.region) parts.push(customer.region);
  if (customer.country) parts.push(customer.country);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

async function geocodeAddress(query: string): Promise<{ lat: string; lng: string } | null> {
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");

    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "QuotePilot-CRM/1.0",
        "Accept-Language": "en",
      },
    });

    if (!resp.ok) return null;

    const results: NominatimResult[] = await resp.json();
    if (results.length === 0) return null;

    return { lat: results[0].lat, lng: results[0].lon };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function geocodeCustomer(customerId: number): Promise<{ lat: string; lng: string } | null> {
  const rawResult = await db.execute(sql`
    SELECT address, city, postal_code, country, province, region
    FROM customers WHERE id = ${customerId}
  `) as any;
  const rows = rawResult.rows ?? rawResult;
  if (!rows.length) return null;

  const row = rows[0];
  const query = buildAddressQuery({
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    province: row.province,
    region: row.region,
  });

  if (!query) return null;

  const coords = await geocodeAddress(query);
  if (!coords) return null;

  await db.execute(sql`
    UPDATE customers SET latitude = ${coords.lat}, longitude = ${coords.lng}
    WHERE id = ${customerId}
  `);

  return coords;
}

export async function geocodeMissingCustomers(companyId: number): Promise<number> {
  const rawResult = await db.execute(sql`
    SELECT id, address, city, postal_code, country, province, region
    FROM customers
    WHERE company_id = ${companyId}
      AND (latitude IS NULL OR longitude IS NULL)
      AND (
        (address IS NOT NULL AND address != '')
        OR (city IS NOT NULL AND city != '')
        OR (country IS NOT NULL AND country != '')
      )
    ORDER BY id
    LIMIT 50
  `) as any;
  const rows = rawResult.rows ?? rawResult;

  let geocoded = 0;
  for (const row of rows) {
    const query = buildAddressQuery({
      address: row.address,
      city: row.city,
      postalCode: row.postal_code,
      country: row.country,
      province: row.province,
      region: row.region,
    });

    if (!query) continue;

    const coords = await geocodeAddress(query);
    if (coords) {
      await db.execute(sql`
        UPDATE customers SET latitude = ${coords.lat}, longitude = ${coords.lng}
        WHERE id = ${row.id}
      `);
      geocoded++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  return geocoded;
}

export async function geocodeSingleCustomerOnSave(customerId: number): Promise<void> {
  try {
    await geocodeCustomer(customerId);
  } catch (e) {
    console.error(`[geocoding] Failed to geocode customer ${customerId}:`, e);
  }
}
