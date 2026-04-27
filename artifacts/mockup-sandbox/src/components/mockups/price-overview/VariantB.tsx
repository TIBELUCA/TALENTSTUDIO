import { useState } from "react";
import { Eye, EyeOff, MessageSquare, Plus, Trash2 } from "lucide-react";
import {
  cart, extras, interlockingPerPos, installation, travel, transportPrice, trainingDays,
  discountPercent, labels, fmt,
  machineSubtotal, machineDisplayedUnit, machinesTotal, interlockingTotal, extrasTotal,
  installationTotalDays, installationTotal, travelTotal, servicesTotal, listPriceTotal,
} from "./_data";

type ServiceKey = "installation" | "travel" | "board" | "training" | "packaging" | "transport";

const RAIL = "shrink-0 w-[210px] flex items-center justify-end gap-1.5 pl-3 border-l ml-3";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={
      "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border " +
      (on ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")
    }>{on ? "INCLUDED" : "EXCLUDED"}</button>
  );
}
function PriceBadge({ value, muted = false }: { value: string; muted?: boolean }) {
  return <span className={"font-mono text-sm tabular-nums w-[88px] text-right " + (muted ? "text-muted-foreground" : "")}>{value}</span>;
}
function CommentBtn({ has = false }: { has?: boolean }) {
  return <button className={"w-6 h-6 flex items-center justify-center rounded hover:bg-muted " + (has ? "text-blue-600" : "text-muted-foreground/50")}><MessageSquare className="w-3.5 h-3.5" /></button>;
}
function EyeBtn({ off = false }: { off?: boolean }) {
  return <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">{off ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>;
}

export function VariantB() {
  const [included, setIncluded] = useState<Record<ServiceKey, boolean>>({
    installation: true, travel: true, board: false, training: true, packaging: false, transport: true,
  });
  const grossTotal = listPriceTotal() + servicesTotal(included);
  const netTotal = grossTotal * (1 - discountPercent / 100);

  return (
    <div className="min-h-screen bg-background p-6 font-sans text-foreground">
      <div className="max-w-[960px] mx-auto space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Price Overview</h3>
          <button className="text-xs font-medium px-3 py-1 rounded-full bg-muted text-foreground border border-border">Hide Individual Prices</button>
        </div>

        {/* MACHINES */}
        {cart.map((item, i) => (
          <div key={item.tempId} className="border rounded-lg p-3">
            <div className="flex items-center">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Pos. {i + 1}: {item.machineName} ×{item.qty}</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-muted-foreground">Unit price €</span>
                  <input defaultValue={fmt(machineDisplayedUnit(item))} className="w-32 h-6 text-xs font-mono text-right bg-white border rounded px-2" />
                </div>
              </div>
              <div className={RAIL}>
                <PriceBadge value={`€${fmt(machineSubtotal(item))}`} />
                <CommentBtn has={!!item.comment} />
                <EyeBtn />
              </div>
            </div>
            {item.options.map(o => (
              <div key={o.id} className="flex items-center mt-1.5">
                <div className="flex-1 min-w-0 pl-6">
                  <div className="text-xs text-muted-foreground">+ {o.name}{o.qty > 1 ? ` ×${o.qty}` : ""}</div>
                  {!o.hidden && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input defaultValue={fmt(o.price)} className="w-24 h-6 text-xs font-mono text-right bg-white border rounded px-2" />
                    </div>
                  )}
                </div>
                <div className={RAIL}>
                  <PriceBadge value={o.hidden ? "incl." : `€${fmt(o.price * o.qty)}`} muted={o.hidden} />
                  <CommentBtn />
                  <EyeBtn off={o.hidden} />
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center font-medium text-sm px-1">
          <span className="flex-1">Machines Total</span>
          <div className={RAIL}><PriceBadge value={`€${fmt(machinesTotal())}`} /><span className="w-6" /><span className="w-6" /></div>
        </div>

        {/* INTERLOCKING */}
        <div className="border rounded-lg p-3 bg-muted/30 flex items-center">
          <div className="flex-1 flex items-center gap-2">
            <input defaultValue={labels.interlocking} className="h-7 text-sm font-medium w-48 bg-white border rounded px-2" />
            <span className="text-xs text-muted-foreground">({cart.length} pos. × €{interlockingPerPos})</span>
          </div>
          <div className={RAIL}>
            <PriceBadge value={`€${fmt(interlockingTotal())}`} />
            <CommentBtn />
            <span className="w-6" />
          </div>
        </div>

        {/* EXTRAS */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4>
            <button className="h-7 px-2 text-xs border rounded inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add Extra</button>
          </div>
          {extras.map(e => (
            <div key={e.id} className="border rounded-lg p-3 flex items-center">
              <div className="flex-1 flex items-center gap-2">
                <input defaultValue={e.description} className="h-7 text-sm flex-1 bg-white border rounded px-2" />
                <input defaultValue={fmt(e.price)} className="w-24 h-7 text-xs font-mono text-right bg-white border rounded px-2" />
              </div>
              <div className={RAIL}>
                <PriceBadge value={`€${fmt(e.price)}`} />
                <CommentBtn />
                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>

        {/* TOTAL LIST */}
        <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5 flex items-center">
          <input defaultValue={labels.totalListPrice} className="h-7 text-sm font-bold flex-1 bg-white border rounded px-2" />
          <div className={RAIL}><span className="font-mono font-bold">€{fmt(listPriceTotal())}</span><span className="w-6" /><span className="w-6" /></div>
        </div>

        {/* DISCOUNT */}
        <div className="border rounded-lg p-3 bg-muted/30 flex items-center">
          <div className="flex-1 flex items-center gap-2">
            <span className="font-medium text-sm">Discount</span>
            <input defaultValue={discountPercent} className="w-16 h-7 text-xs font-mono text-right bg-white border rounded px-2" />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <div className={RAIL}><PriceBadge value={`-€${fmt(grossTotal * discountPercent / 100)}`} /><span className="w-6" /><span className="w-6" /></div>
        </div>

        {/* SERVICES */}
        <h4 className="font-medium text-sm text-muted-foreground pt-2">Services</h4>
        <div className="border rounded-lg divide-y">
          {/* Installation */}
          <div className="p-3">
            <div className="flex items-start">
              <div className="flex-1">
                <input defaultValue={labels.installation} className="h-7 text-sm font-medium w-full bg-transparent focus:bg-white focus:border rounded px-1 mb-2" />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Daily fee</span>
                    <div className="flex items-center gap-1"><input defaultValue={installation.dailyFee} className="flex-1 h-7 text-xs font-mono bg-white border rounded px-2" /><span className="text-[10px] text-muted-foreground">€/d</span></div>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Total days</span>
                    <input readOnly value={installationTotalDays()} className="w-full h-7 text-xs font-mono bg-muted/50 border rounded px-2" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Total €</span>
                    <input readOnly value={fmt(installationTotal())} className="w-full h-7 text-xs font-mono bg-muted/50 border rounded px-2" />
                  </label>
                </div>
                <div className="grid grid-cols-5 gap-2 mt-2 text-xs">
                  {[["Travel", installation.travelDays], ["Mech.", installation.mechanicalDays], ["Elec.", installation.electricalDays], ["Test", installation.testingDays], ["Train", installation.trainingDays]].map(([k, v]) => (
                    <label key={k as string} className="space-y-1">
                      <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{k}</span><Eye className="w-3 h-3 text-muted-foreground" /></div>
                      <input defaultValue={String(v)} className="w-full h-6 text-xs font-mono bg-white border rounded px-1" />
                    </label>
                  ))}
                </div>
              </div>
              <div className={RAIL}>
                <PriceBadge value={`€${fmt(installationTotal())}`} />
                <CommentBtn />
                <Toggle on={included.installation} onClick={() => setIncluded(p => ({ ...p, installation: !p.installation }))} />
              </div>
            </div>
          </div>

          {/* Travel */}
          <div className="p-3 flex items-start">
            <div className="flex-1 space-y-1">
              <input defaultValue={labels.travelCosts} className="h-7 text-sm w-full bg-transparent focus:bg-white focus:border rounded px-1" />
              <div className="flex items-center gap-1 text-xs">
                <span className="text-[10px] text-muted-foreground">Rental car</span>
                <input defaultValue={travel.rentalDailyFee} className="w-16 h-6 font-mono bg-white border rounded px-1" />
                <span className="text-[10px] text-muted-foreground">€/d ×</span>
                <input defaultValue={travel.rentalDays} className="w-12 h-6 font-mono bg-white border rounded px-1" />
                <span className="text-[10px] text-muted-foreground">d = €{fmt(travel.rentalDailyFee * travel.rentalDays)}</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-[10px] text-muted-foreground">Flight ticket</span>
                <input defaultValue={travel.flightTicket} className="w-16 h-6 font-mono bg-white border rounded px-1" />
              </div>
            </div>
            <div className={RAIL}>
              <PriceBadge value={`€${fmt(travelTotal())}`} />
              <CommentBtn />
              <Toggle on={included.travel} onClick={() => setIncluded(p => ({ ...p, travel: !p.travel }))} />
            </div>
          </div>

          {/* Board */}
          <div className="p-3 flex items-center">
            <input defaultValue={labels.boardLodging} className="flex-1 h-7 text-sm bg-transparent focus:bg-white focus:border rounded px-1" />
            <div className={RAIL}><PriceBadge value="—" muted /><CommentBtn /><Toggle on={included.board} onClick={() => setIncluded(p => ({ ...p, board: !p.board }))} /></div>
          </div>

          {/* Training */}
          <div className="p-3 flex items-center">
            <div className="flex-1 flex items-center gap-2">
              <input defaultValue={labels.training} className="h-7 text-sm flex-1 bg-transparent focus:bg-white focus:border rounded px-1" />
              <input readOnly value={trainingDays} className="w-12 h-6 text-xs font-mono text-right bg-muted/50 border rounded px-1" />
              <span className="text-[10px] text-muted-foreground">days</span>
            </div>
            <div className={RAIL}><PriceBadge value="incl." muted /><CommentBtn /><Toggle on={included.training} onClick={() => setIncluded(p => ({ ...p, training: !p.training }))} /></div>
          </div>

          {/* Packaging */}
          <div className="p-3 flex items-center">
            <input defaultValue={labels.packaging} className="flex-1 h-7 text-sm bg-transparent focus:bg-white focus:border rounded px-1" />
            <div className={RAIL}><PriceBadge value="—" muted /><CommentBtn has /><Toggle on={included.packaging} onClick={() => setIncluded(p => ({ ...p, packaging: !p.packaging }))} /></div>
          </div>

          {/* Transport */}
          <div className="p-3 flex items-center">
            <div className="flex-1 flex items-center gap-2">
              <input defaultValue={labels.transport} className="h-7 text-sm flex-1 bg-transparent focus:bg-white focus:border rounded px-1" />
              <span className="text-[10px] text-muted-foreground">€</span>
              <input defaultValue={fmt(transportPrice)} className="w-24 h-6 text-xs font-mono text-right bg-white border rounded px-1" />
            </div>
            <div className={RAIL}><PriceBadge value={`€${fmt(transportPrice)}`} /><CommentBtn /><Toggle on={included.transport} onClick={() => setIncluded(p => ({ ...p, transport: !p.transport }))} /></div>
          </div>
        </div>
        <div className="flex items-center font-medium text-sm pt-1 px-1">
          <span className="flex-1">Services Total</span>
          <div className={RAIL}><PriceBadge value={`€${fmt(servicesTotal(included))}`} /><span className="w-6" /><span className="w-[68px]" /></div>
        </div>

        {/* TOTALS */}
        <div className="border-t-2 pt-3 space-y-2">
          <div className="flex items-center text-base">
            <input defaultValue={labels.grossTotal} className="flex-1 h-7 font-medium bg-transparent focus:bg-white focus:border rounded px-1" />
            <div className={RAIL}><span className="font-mono font-bold">€{fmt(grossTotal)}</span><span className="w-6" /><span className="w-[68px]" /></div>
          </div>
          <div className="flex items-center text-base text-primary">
            <input defaultValue={labels.netTotal} className="flex-1 h-7 font-medium bg-transparent focus:bg-white focus:border rounded px-1" />
            <div className={RAIL}><span className="font-mono font-bold">€{fmt(netTotal)}</span><span className="w-6" /><span className="w-[68px]" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
