import { useState } from "react";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { Palette, ScrollText } from "lucide-react";
import DealerFormat from "./DealerFormat";
import DealerPresets from "./DealerPresets";

const tabs = [
  { id: "format", label: "Document Format", icon: Palette },
  { id: "presets", label: "Presets & Terms", icon: ScrollText },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function DealerSettings() {
  const [activeTab, setActiveTab] = useState<TabId>("format");

  return (
    <DealerLayout>
      <PageHeader title="Settings" />
      <div className="flex gap-2 mb-6 border-b" data-testid="settings-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              )}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "format" && <DealerFormat embedded />}
      {activeTab === "presets" && <DealerPresets embedded />}
    </DealerLayout>
  );
}
