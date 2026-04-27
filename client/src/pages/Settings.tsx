import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "wouter";
import { ChevronRight, UserCog, Sparkles, HardDrive } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface SettingCard {
  href: string;
  icon: React.ElementType;
  gradient: string;
  titleKey: string;
  descKey: string;
  masterOnly?: boolean;
}

const SETTING_CARDS: SettingCard[] = [
  {
    href: "/users",
    icon: UserCog,
    gradient: "from-rose-500 to-rose-600",
    titleKey: "settings.usersTitle",
    descKey: "settings.usersDesc",
    masterOnly: true,
  },
  {
    href: "/ai-settings",
    icon: Sparkles,
    gradient: "from-violet-500 to-violet-600",
    titleKey: "settings.aiServices",
    descKey: "settings.aiServicesDesc",
    masterOnly: true,
  },
  {
    href: "/drive-settings",
    icon: HardDrive,
    gradient: "from-emerald-500 to-emerald-600",
    titleKey: "settings.driveArchiveTitle",
    descKey: "settings.driveArchiveDesc",
    masterOnly: true,
  },
];

export default function Settings() {
  const { isMaster } = useAuth();
  const { t } = useLanguage();

  const visibleCards = SETTING_CARDS.filter(c => !c.masterOnly || isMaster);

  return (
    <Layout>
      <div className="max-w-2xl space-y-6">
        <PageHeader
          title={t("settings.title")}
          subtitle={t("settings.subtitle")}
        />

        <div className="space-y-3">
          {visibleCards.map(card => {
            const Icon = card.icon;
            return (
              <Link key={card.href} href={card.href}>
                <div
                  data-testid={`settings-card-${card.href.replace("/", "")}`}
                  className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 hover:bg-muted/30 transition-colors cursor-pointer group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br shrink-0 ${card.gradient}`}>
                    <Icon className="w-6 h-6 text-white" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{t(card.titleKey)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t(card.descKey)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
