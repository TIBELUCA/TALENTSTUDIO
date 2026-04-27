import { Link, useLocation } from "wouter";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  "offers": "Offers",
  "enquiries": "Enquiries",
  "customers": "CRM",
  "companies": "Companies",
  "contacts": "Contacts",
  "machines": "Machines",
  "settings": "Settings",
  "users": "Users",
  "presets": "Presets",
  "format": "Document Format",
  "dealers": "Dealers",
  "media": "Media",
  "new": "New",
  "edit": "Edit",
  "bin": "Bin",
  "wizard": "Edit Offer",
  "prices": "Edit Prices",
  "dealer": "Dealer",
  "requests": "My Requests",
  "ai": "AI Settings",
  "sales-brain": "Sales Brain",
  "family-defaults": "Family Defaults",
};

function isNumericOrUuid(segment: string): boolean {
  return /^\d+$/.test(segment) || /^[0-9a-f-]{20,}$/i.test(segment);
}

function getParentLabel(segments: string[], currentIndex: number): string {
  const parent = segments[currentIndex - 1];
  switch (parent) {
    case "offers": return "Offer";
    case "enquiries": return "Enquiry";
    case "requests": return "Request";
    case "customers": return "Customer";
    case "users": return "User";
    case "machines": return "Machine";
    case "dealers": return "Dealer";
    default: return "Detail";
  }
}

export function buildBreadcrumbs(pathname: string): Crumb[] {
  if (pathname === "/" || pathname === "") {
    return [{ label: "Dashboard" }];
  }

  const segments = pathname.replace(/^\//, "").split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let builtPath = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    builtPath += "/" + seg;

    if (isNumericOrUuid(seg)) {
      crumbs.push({ label: getParentLabel(segments, i) });
    } else {
      const label = SEGMENT_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
      const isLast = i === segments.length - 1;
      crumbs.push({ label, href: isLast ? undefined : builtPath });
    }
  }

  return crumbs;
}

export function RouteBreadcrumb() {
  const [location] = useLocation();
  const crumbs = buildBreadcrumbs(location);

  if (crumbs.length === 0) return null;

  return (
    <nav className="hidden sm:flex items-center gap-0.5 text-sm min-w-0" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-0.5 min-w-0">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-gray-400 hover:text-gray-700 transition-colors font-medium truncate no-underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "text-gray-700 font-semibold truncate" : "text-gray-400 font-medium truncate"}>
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
