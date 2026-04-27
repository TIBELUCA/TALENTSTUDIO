import { type ReactNode } from "react";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="space-y-1" data-testid="page-header">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          {icon && <div className="shrink-0">{icon}</div>}
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight" data-testid="text-page-title">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-page-subtitle">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0" data-testid="page-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
