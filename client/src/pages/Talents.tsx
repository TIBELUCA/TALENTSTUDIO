import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, Users, Instagram, Music2, Youtube, Loader2 } from "lucide-react";
import type { TalentListItem, TalentSocial, TalentPlatform } from "@shared/schema";
import { TALENT_PLATFORMS } from "@shared/schema";

const PLATFORM_LABELS: Record<TalentPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X / Twitter",
};

const isTalentPlatform = (v: string): v is TalentPlatform =>
  (TALENT_PLATFORMS as readonly string[]).includes(v);

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "instagram") return <Instagram className="w-3.5 h-3.5" />;
  if (platform === "tiktok") return <Music2 className="w-3.5 h-3.5" />;
  if (platform === "youtube") return <Youtube className="w-3.5 h-3.5" />;
  return <span className="text-xs font-bold">𝕏</span>;
}

function PrimarySocialBadge({ social }: { social: TalentSocial }) {
  return (
    <div
      className="flex items-center gap-2 text-sm"
      data-testid={`primary-social-${social.talentId}`}
    >
      <PlatformIcon platform={social.platform} />
      <span className="font-medium truncate max-w-[140px]">{social.handle}</span>
      <span className="ml-auto text-muted-foreground tabular-nums">
        {formatFollowers(social.followers ?? 0)}
      </span>
    </div>
  );
}

export default function Talents() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<TalentPlatform | null>(null);

  const { data: talents = [], isLoading } = useQuery<TalentListItem[]>({
    queryKey: ["/api/talents"],
  });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    talents.forEach((t) => (t.tags || []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [talents]);

  const platformsInUse = useMemo(() => {
    const set = new Set<TalentPlatform>();
    talents.forEach((t) => {
      const p = t.primarySocial?.platform;
      if (p && isTalentPlatform(p)) set.add(p);
    });
    return TALENT_PLATFORMS.filter((p) => set.has(p));
  }, [talents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return talents.filter((t) => {
      const matchSearch =
        !q ||
        t.displayName.toLowerCase().includes(q) ||
        (t.realName ?? "").toLowerCase().includes(q) ||
        (t.city ?? "").toLowerCase().includes(q) ||
        (t.primarySocial?.handle ?? "").toLowerCase().includes(q);
      const matchTag = !tagFilter || (t.tags || []).includes(tagFilter);
      const matchPlatform =
        !platformFilter || t.primarySocial?.platform === platformFilter;
      return matchSearch && matchTag && matchPlatform;
    });
  }, [talents, search, tagFilter, platformFilter]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <PageHeader
          title="Talent Roster"
          subtitle="Influencer e creator gestiti dal tuo team."
          icon={<Users className="w-5 h-5" />}
        />

        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-search-talents"
              placeholder="Cerca per nome d'arte, nome reale, città, handle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Link href="/talents/new">
            <Button data-testid="button-new-talent">
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Talent
            </Button>
          </Link>
        </div>

        {platformsInUse.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-medium text-muted-foreground mb-1.5">
              Piattaforma
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={platformFilter === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setPlatformFilter(null)}
                data-testid="badge-platform-all"
              >
                Tutte
              </Badge>
              {platformsInUse.map((p) => (
                <Badge
                  key={p}
                  variant={platformFilter === p ? "default" : "outline"}
                  className="cursor-pointer flex items-center gap-1.5"
                  onClick={() => setPlatformFilter(p)}
                  data-testid={`badge-platform-${p}`}
                >
                  <PlatformIcon platform={p} />
                  {PLATFORM_LABELS[p]}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {allTags.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-medium text-muted-foreground mb-1.5">
              Tag
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={tagFilter === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setTagFilter(null)}
                data-testid="badge-tag-all"
              >
                Tutti
              </Badge>
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={tagFilter === tag ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setTagFilter(tag)}
                  data-testid={`badge-tag-${tag}`}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-4" data-testid="text-empty">
                {talents.length === 0
                  ? "Nessun talent in roster. Inizia aggiungendo il primo."
                  : "Nessun risultato per i filtri selezionati."}
              </p>
              {talents.length === 0 && (
                <Link href="/talents/new">
                  <Button data-testid="button-create-first-talent">
                    <Plus className="w-4 h-4 mr-2" />
                    Aggiungi il primo Talent
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/talents/${t.id}`)}
                data-testid={`card-talent-${t.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="w-14 h-14">
                      <AvatarImage src={t.avatarUrl ?? undefined} alt={t.displayName} />
                      <AvatarFallback>
                        {t.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-semibold truncate"
                        data-testid={`text-name-${t.id}`}
                      >
                        {t.displayName}
                      </div>
                      {t.realName && (
                        <div className="text-xs text-muted-foreground truncate">
                          {t.realName}
                        </div>
                      )}
                      {(t.city || t.country) && (
                        <div className="text-xs text-muted-foreground truncate">
                          {[t.city, t.country].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>

                  {t.primarySocial ? (
                    <div className="px-2 py-1.5 mb-3 rounded-md bg-muted/50">
                      <PrimarySocialBadge social={t.primarySocial} />
                    </div>
                  ) : (
                    <div
                      className="px-2 py-1.5 mb-3 rounded-md bg-muted/30 text-xs text-muted-foreground italic"
                      data-testid={`text-no-social-${t.id}`}
                    >
                      Nessun social configurato
                    </div>
                  )}

                  {t.bio && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {t.bio}
                    </p>
                  )}
                  {t.tags && t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {t.tags.length > 4 && (
                        <span className="text-xs text-muted-foreground">
                          +{t.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
