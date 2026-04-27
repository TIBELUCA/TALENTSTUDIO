import { useState } from "react";
import { Eye, EyeOff, MessageSquare, Plus, Trash2 } from "lucide-react";
import {
  cart, extras, interlockingPerPos, installation, travel, transportPrice, trainingDays,
  discountPercent, labels, fmt,
  machineSubtotal, machineDisplayedUnit, machinesTotal, interlockingTotal, extrasTotal,
  installationTotalDays, installationTotal, travelTotal, servicesTotal, listPriceTotal,
} from "./_data";

type ServiceKey = "installation" | "travel" | "board" | "training" | "packaging" | "transport";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={
        "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors " +
        (on
          ? "bg-green-100 text-green-700 border-green-300"
          : "bg-red-100 text-red-700 border-red-300")
      }>
      {on ? "INCLUDED" : "EXCLUDED"}
    </button>
  );
}

function CommentBtn({ has = false }: { has?: boolean }) {
  return (
    <button className={"w-6 h-6 flex items-center justify-center rounded hover:bg-muted " + (has ? "text-blue-600" : "text-muted-foreground/50")}>
      <MessageSquare className="w-3.5 h-3.5" />
    </button>
  );
}

const COLS = "grid grid-cols-[1fr_220px_120px_120px] gap-x-2 items-center";

export function VariantA() {
  const [included, setIncluded] = useState<Record<ServiceKey, boolean>>({
    installation: true, travel: true, board: false, training: true, packaging: false, transport: true,
  });
  const tot = (k: ServiceKey) => {
    if (k === "installation") return installationTotal();
    if (k === "travel") return travelTotal();
    if (k === "transport") return transportPrice;
    return 0;
  };
  const grossTotal = listPriceTotal() + servicesTotal(included);
  const netTotal = grossTotal * (1 - discountPercent / 100);

  return (
    <div className="min-h-screen bg-background p-6 font-sans text-foreground">
      <div className="max-w-[960px] mx-auto space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Price Overview</h3>
          <button className="text-xs font-medium px-3 py-1 rounded-full bg-muted text-foreground border border-border">
            Hide Individual Prices
          </button>
        </div>

        {/* sticky header */}
        <div className={COLS + " sticky top-0 bg-background py-2 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"}>
          <span>Voce</span>
          <span className="text-right">Dettaglio</span>
          <span className="text-right">Totale €</span>
          <span className="text-right pr-1">Azioni</span>
        </div>

        {/* MACHINES */}
        {cart.map((item, i) => (
          <div key={item.tempId} className="border rounded-lg overflow-hidden">
            <div className={COLS + " px-3 py-2 bg-muted/30"}>
              <span className="font-medium text-sm">Pos. {i + 1}: {item.machineName} ×{item.qty}</span>
              <input defaultValue={fmt(machineDisplayedUnit(item))} className="h-7 text-xs font-mono text-right bg-white border rounded px-2" />
              <span className="text-right font-mono text-sm">€{fmt(machineSubtotal(item))}</span>
              <div className="flex justify-end gap-1"><CommentBtn has={!!item.comment} /></div>
            </div>
            {item.options.some(o => o.hidden) && (
              <div className="px-3 pb-1.5 pt-0 text-[10px] text-muted-foreground italic">
                include {item.options.filter(o => o.hidden).length} opzion{item.options.filter(o => o.hidden).length === 1 ? "e" : "i"} "Incl." (+€{fmt(item.options.filter(o => o.hidden).reduce((s, o) => s + o.price * o.qty, 0))}): {item.options.filter(o => o.hidden).map(o => o.name).join(", ")}
              </div>
            )}
            {item.options.map((o) => (
              <div key={o.id} className={COLS + " px-3 py-1.5 border-t text-xs"}>
                <span className="text-muted-foreground pl-6">+ {o.name}{o.qty > 1 ? ` ×${o.qty}` : ""}</span>
                <div className="text-right">
                  {o.hidden ? <span className="font-mono italic text-muted-foreground">incl.</span>
                    : <input defaultValue={fmt(o.price)} className="w-full h-6 text-xs font-mono text-right bg-white border rounded px-2" />}
                </div>
                <span className="text-right font-mono text-muted-foreground">€{fmt(o.price * o.qty)}</span>
                <div className="flex justify-end gap-1">
                  <CommentBtn />
                  <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">
                    {o.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className={COLS + " px-1 font-medium text-sm"}>
          <span>Machines Total</span><span /><span className="text-right font-mono">€{fmt(machinesTotal())}</span><span />
        </div>

        {/* INTERLOCKING */}
        <div className={COLS + " border rounded-lg px-3 py-2 bg-muted/30"}>
          <input defaultValue={labels.interlocking} className="h-7 text-sm font-medium bg-white border rounded px-2" />
          <span className="text-xs text-muted-foreground text-right">{cart.length} pos. × €{interlockingPerPos}</span>
          <span className="text-right font-mono text-sm">€{fmt(interlockingTotal())}</span>
          <div className="flex justify-end"><CommentBtn /></div>
        </div>

        {/* EXTRAS */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4>
            <button className="h-7 px-2 text-xs border rounded inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add Extra</button>
          </div>
          {extras.map(e => (
            <div key={e.id} className={COLS + " border rounded-lg px-3 py-2"}>
              <input defaultValue={e.description} className="h-7 text-sm bg-white border rounded px-2" />
              <input defaultValue={fmt(e.price)} className="h-7 text-xs font-mono text-right bg-white border rounded px-2" />
              <span className="text-right font-mono text-sm">€{fmt(e.price)}</span>
              <div className="flex justify-end gap-1">
                <CommentBtn />
                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>

        {/* TOTAL LIST PRICE */}
        <div className={COLS + " border-2 border-primary/30 rounded-lg px-3 py-2 bg-primary/5"}>
          <input defaultValue={labels.totalListPrice} className="h-7 text-sm font-bold bg-white border rounded px-2" />
          <span />
          <span className="text-right font-mono font-bold">€{fmt(listPriceTotal())}</span>
          <span />
        </div>

        {/* DISCOUNT */}
        <div className={COLS + " border rounded-lg px-3 py-2 bg-muted/30"}>
          <span className="font-medium text-sm">Discount (%)</span>
          <div className="flex items-center justify-end gap-1">
            <input defaultValue={discountPercent} className="w-16 h-7 text-xs font-mono text-right bg-white border rounded px-2" />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <span className="text-right font-mono text-destructive text-sm">-€{fmt(grossTotal * discountPercent / 100)}</span>
          <span />
        </div>

        {/* SERVICES */}
        <h4 className="font-medium text-sm text-muted-foreground pt-2">Services</h4>
        <div className="border rounded-lg divide-y">
          {/* Installation row */}
          <div>
            <div className={COLS + " px-3 py-2"}>
              <input defaultValue={labels.installation} className="h-7 text-sm font-medium bg-transparent border-0 focus:bg-white focus:border rounded px-1" />
              <span className="text-xs text-muted-foreground text-right">€{installation.dailyFee}/g × {installationTotalDays()}g</span>
              <span className="text-right font-mono text-sm">€{fmt(installationTotal())}</span>
              <div className="flex justify-end gap-1"><CommentBtn /><Toggle on={included.installation} onClick={() => setIncluded(p => ({ ...p, installation: !p.installation }))} /></div>
            </div>
            {/* breakdown sub-table same columns */}
            <div className="px-3 pb-2 pt-1 bg-muted/20 space-y-1">
              {[
                ["Travel", installation.travelDays],
                ["Mech. assembly", installation.mechanicalDays],
                ["Elec. assembly", installation.electricalDays],
                ["Testing", installation.testingDays],
                ["Training", installation.trainingDays],
              ].map(([name, days]) => (
                <div key={name as string} className={COLS + " text-xs"}>
                  <span className="text-muted-foreground pl-6">— {name}</span>
                  <div className="flex justify-end items-center gap-1">
                    <input defaultValue={String(days)} className="w-12 h-6 text-xs font-mono text-right bg-white border rounded px-1" />
                    <span className="text-[10px] text-muted-foreground">days</span>
                  </div>
                  <span className="text-right font-mono text-muted-foreground">€{fmt((days as number) * installation.dailyFee)}</span>
                  <div className="flex justify-end"><button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"><Eye className="w-3 h-3" /></button></div>
                </div>
              ))}
            </div>
          </div>

          {/* Travel row */}
          <div className={COLS + " px-3 py-2"}>
            <input defaultValue={labels.travelCosts} className="h-7 text-sm bg-transparent focus:bg-white focus:border rounded px-1" />
            <div className="flex flex-col gap-1 text-xs text-right">
              <div className="flex justify-end items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Rental</span>
                <input defaultValue={travel.rentalDailyFee} className="w-14 h-6 text-xs font-mono text-right bg-white border rounded px-1" />
                <span className="text-[10px] text-muted-foreground">€/d ×</span>
                <input defaultValue={travel.rentalDays} className="w-10 h-6 text-xs font-mono text-right bg-white border rounded px-1" />
              </div>
              <div className="flex justify-end items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Flight</span>
                <input defaultValue={travel.flightTicket} className="w-14 h-6 text-xs font-mono text-right bg-white border rounded px-1" />
              </div>
            </div>
            <span className="text-right font-mono text-sm">€{fmt(travelTotal())}</span>
            <div className="flex justify-end gap-1"><CommentBtn /><Toggle on={included.travel} onClick={() => setIncluded(p => ({ ...p, travel: !p.travel }))} /></div>
          </div>

          {/* Board */}
          <div className={COLS + " px-3 py-2"}>
            <input defaultValue={labels.boardLodging} className="h-7 text-sm bg-transparent focus:bg-white focus:border rounded px-1" />
            <span className="text-right text-xs text-muted-foreground">a carico cliente</span>
            <span className="text-right font-mono text-sm text-muted-foreground">—</span>
            <div className="flex justify-end gap-1"><CommentBtn /><Toggle on={included.board} onClick={() => setIncluded(p => ({ ...p, board: !p.board }))} /></div>
          </div>

          {/* Training */}
          <div className={COLS + " px-3 py-2"}>
            <input defaultValue={labels.training} className="h-7 text-sm bg-transparent focus:bg-white focus:border rounded px-1" />
            <div className="flex justify-end items-center gap-1 text-xs">
              <input defaultValue={trainingDays} readOnly className="w-12 h-6 text-xs font-mono text-right bg-muted/50 border rounded px-1" />
              <span className="text-[10px] text-muted-foreground">days</span>
            </div>
            <span className="text-right font-mono text-sm text-muted-foreground">incl.</span>
            <div className="flex justify-end gap-1"><CommentBtn /><Toggle on={included.training} onClick={() => setIncluded(p => ({ ...p, training: !p.training }))} /></div>
          </div>

          {/* Packaging */}
          <div className={COLS + " px-3 py-2"}>
            <input defaultValue={labels.packaging} className="h-7 text-sm bg-transparent focus:bg-white focus:border rounded px-1" />
            <span className="text-right text-xs text-muted-foreground">{`(`}{`note: casse termo)`}</span>
            <span className="text-right font-mono text-sm text-muted-foreground">—</span>
            <div className="flex justify-end gap-1"><CommentBtn has /><Toggle on={included.packaging} onClick={() => setIncluded(p => ({ ...p, packaging: !p.packaging }))} /></div>
          </div>

          {/* Transport */}
          <div className={COLS + " px-3 py-2"}>
            <input defaultValue={labels.transport} className="h-7 text-sm bg-transparent focus:bg-white focus:border rounded px-1" />
            <div className="flex justify-end items-center gap-1 text-xs">
              <span className="text-[10px] text-muted-foreground">€</span>
              <input defaultValue={fmt(transportPrice)} className="w-20 h-6 text-xs font-mono text-right bg-white border rounded px-1" />
            </div>
            <span className="text-right font-mono text-sm">€{fmt(transportPrice)}</span>
            <div className="flex justify-end gap-1"><CommentBtn /><Toggle on={included.transport} onClick={() => setIncluded(p => ({ ...p, transport: !p.transport }))} /></div>
          </div>
        </div>
        <div className={COLS + " px-1 font-medium text-sm pt-1"}>
          <span>Services Total</span><span /><span className="text-right font-mono">€{fmt(servicesTotal(included))}</span><span />
        </div>

        {/* TOTALS */}
        <div className="border-t-2 pt-3 space-y-2">
          <div className={COLS + " text-base"}>
            <input defaultValue={labels.grossTotal} className="h-7 font-medium bg-transparent focus:bg-white focus:border rounded px-1" />
            <span /><span className="text-right font-mono font-bold">€{fmt(grossTotal)}</span><span />
          </div>
          <div className={COLS + " text-base text-primary"}>
            <input defaultValue={labels.netTotal} className="h-7 font-medium bg-transparent focus:bg-white focus:border rounded px-1" />
            <span /><span className="text-right font-mono font-bold">€{fmt(netTotal)}</span><span />
          </div>
        </div>
      </div>
    </div>
  );
}
