import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, MessageSquare, Plus, Trash2 } from "lucide-react";
import {
  cart, extras, interlockingPerPos, installation, travel, transportPrice, trainingDays,
  discountPercent, labels, fmt,
  machineSubtotal, machineDisplayedUnit, machinesTotal, interlockingTotal, extrasTotal,
  installationTotalDays, installationTotal, travelTotal, servicesTotal, listPriceTotal,
} from "./_data";

type ServiceKey = "installation" | "travel" | "board" | "training" | "packaging" | "transport";

const HEADER = "grid grid-cols-[28px_1fr_140px_110px] gap-x-3 items-center px-3 py-2";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className={
      "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border justify-self-end " +
      (on ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")
    }>{on ? "INCLUDED" : "EXCLUDED"}</button>
  );
}
function CommentBtn({ has = false }: { has?: boolean }) {
  return <button onClick={e => e.stopPropagation()} className={"w-6 h-6 inline-flex items-center justify-center rounded hover:bg-muted " + (has ? "text-blue-600" : "text-muted-foreground/50")}><MessageSquare className="w-3.5 h-3.5" /></button>;
}

function Row({ icon, label, total, totalMuted = false, action, expandable = true, defaultOpen = false, children }: {
  icon: React.ReactNode; label: React.ReactNode; total: string; totalMuted?: boolean;
  action: React.ReactNode; expandable?: boolean; defaultOpen?: boolean; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className={HEADER + " cursor-pointer hover:bg-muted/30 select-none"} onClick={() => expandable && setOpen(o => !o)}>
        <div className="flex items-center text-muted-foreground">
          {expandable ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : icon}
        </div>
        <div className="min-w-0">{label}</div>
        <span className={"text-right font-mono text-sm tabular-nums " + (totalMuted ? "text-muted-foreground" : "")}>{total}</span>
        <div className="justify-self-end flex items-center gap-1.5">{action}</div>
      </div>
      {open && children && (
        <div className="border-t bg-muted/10 px-4 py-3 space-y-2">{children}</div>
      )}
    </div>
  );
}

export function VariantC() {
  const [included, setIncluded] = useState<Record<ServiceKey, boolean>>({
    installation: true, travel: true, board: false, training: true, packaging: false, transport: true,
  });
  const grossTotal = listPriceTotal() + servicesTotal(included);
  const netTotal = grossTotal * (1 - discountPercent / 100);

  return (
    <div className="min-h-screen bg-background p-6 font-sans text-foreground">
      <div className="max-w-[960px] mx-auto space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Price Overview</h3>
          <button className="text-xs font-medium px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">Show Individual Prices</button>
        </div>

        {/* MACHINES */}
        {cart.map((item, i) => (
          <Row key={item.tempId}
            icon={null}
            label={<div className="font-medium text-sm truncate">Pos. {i + 1}: {item.machineName} ×{item.qty}</div>}
            total={`€${fmt(machineSubtotal(item))}`}
            defaultOpen={i === 0}
            action={<><CommentBtn has={!!item.comment} /></>}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] text-muted-foreground w-20">Unit price</span>
              <input defaultValue={fmt(machineDisplayedUnit(item))} className="w-32 h-7 text-xs font-mono text-right bg-white border rounded px-2" />
              <span className="text-[10px] text-muted-foreground">× {item.qty}</span>
            </div>
            {item.options.map(o => (
              <div key={o.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground flex-1">+ {o.name}{o.qty > 1 ? ` ×${o.qty}` : ""}</span>
                {o.hidden ? <span className="font-mono italic text-muted-foreground">incl.</span>
                  : <input defaultValue={fmt(o.price)} className="w-24 h-6 font-mono text-right bg-white border rounded px-2" />}
                <CommentBtn />
                <button className="w-6 h-6 inline-flex items-center justify-center text-muted-foreground">{o.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
              </div>
            ))}
          </Row>
        ))}
        <div className={HEADER + " font-medium text-sm"}>
          <span /><span>Machines Total</span>
          <span className="text-right font-mono">€{fmt(machinesTotal())}</span><span />
        </div>

        {/* INTERLOCKING */}
        <Row
          icon={null}
          label={<input defaultValue={labels.interlocking} className="h-7 text-sm font-medium w-48 bg-transparent focus:bg-white focus:border rounded px-1" />}
          total={`€${fmt(interlockingTotal())}`}
          defaultOpen={false}
          action={<CommentBtn />}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[10px] text-muted-foreground">{cart.length} pos. × €</span>
            <input defaultValue={interlockingPerPos} className="w-20 h-7 font-mono text-right bg-white border rounded px-2" />
          </div>
        </Row>

        {/* EXTRAS */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4>
            <button className="h-7 px-2 text-xs border rounded inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add Extra</button>
          </div>
          {extras.map(e => (
            <Row key={e.id}
              icon={null}
              label={<input defaultValue={e.description} className="h-7 text-sm w-full bg-transparent focus:bg-white focus:border rounded px-1" />}
              total={`€${fmt(e.price)}`}
              defaultOpen={false}
              action={<><CommentBtn /><button className="w-6 h-6 inline-flex items-center justify-center text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button></>}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[10px] text-muted-foreground w-16">Prezzo</span>
                <input defaultValue={fmt(e.price)} className="w-24 h-7 font-mono text-right bg-white border rounded px-2" />
              </div>
            </Row>
          ))}
        </div>

        {/* TOTAL LIST */}
        <div className={HEADER + " border-2 border-primary/30 rounded-lg bg-primary/5"}>
          <span /><input defaultValue={labels.totalListPrice} className="h-7 text-sm font-bold bg-transparent focus:bg-white focus:border rounded px-1" />
          <span className="text-right font-mono font-bold">€{fmt(listPriceTotal())}</span><span />
        </div>

        {/* DISCOUNT */}
        <div className={HEADER + " border rounded-lg bg-muted/30"}>
          <span /><span className="font-medium text-sm">Discount</span>
          <div className="flex items-center justify-end gap-1">
            <input defaultValue={discountPercent} className="w-16 h-7 text-xs font-mono text-right bg-white border rounded px-2" /><span className="text-xs text-muted-foreground">%</span>
          </div>
          <span className="text-right font-mono text-destructive text-sm">-€{fmt(grossTotal * discountPercent / 100)}</span>
        </div>

        {/* SERVICES */}
        <h4 className="font-medium text-sm text-muted-foreground pt-2">Services</h4>
        <div className="space-y-2">
          <Row icon={null}
            label={<input defaultValue={labels.installation} className="h-7 text-sm font-medium w-full bg-transparent focus:bg-white focus:border rounded px-1" />}
            total={`€${fmt(installationTotal())}`}
            defaultOpen
            action={<><CommentBtn /><Toggle on={included.installation} onClick={() => setIncluded(p => ({ ...p, installation: !p.installation }))} /></>}
          >
            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Daily fee</span><div className="flex items-center gap-1"><input defaultValue={installation.dailyFee} className="flex-1 h-7 font-mono bg-white border rounded px-2" /><span className="text-[10px] text-muted-foreground">€/d</span></div></label>
              <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Total days</span><input readOnly value={installationTotalDays()} className="w-full h-7 font-mono bg-muted/50 border rounded px-2" /></label>
              <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Total</span><input readOnly value={`€${fmt(installationTotal())}`} className="w-full h-7 font-mono bg-muted/50 border rounded px-2" /></label>
            </div>
            <div className="grid grid-cols-5 gap-2 text-xs">
              {[["Travel", installation.travelDays], ["Mech.", installation.mechanicalDays], ["Elec.", installation.electricalDays], ["Test", installation.testingDays], ["Train", installation.trainingDays]].map(([k, v]) => (
                <label key={k as string} className="space-y-1">
                  <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{k}</span><Eye className="w-3 h-3 text-muted-foreground" /></div>
                  <input defaultValue={String(v)} className="w-full h-6 font-mono bg-white border rounded px-1" />
                </label>
              ))}
            </div>
          </Row>

          <Row icon={null}
            label={<input defaultValue={labels.travelCosts} className="h-7 text-sm w-full bg-transparent focus:bg-white focus:border rounded px-1" />}
            total={`€${fmt(travelTotal())}`}
            defaultOpen={false}
            action={<><CommentBtn /><Toggle on={included.travel} onClick={() => setIncluded(p => ({ ...p, travel: !p.travel }))} /></>}
          >
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[10px] text-muted-foreground w-20">Rental car</span>
              <input defaultValue={travel.rentalDailyFee} className="w-16 h-6 font-mono bg-white border rounded px-1" />
              <span className="text-[10px] text-muted-foreground">€/d ×</span>
              <input defaultValue={travel.rentalDays} className="w-12 h-6 font-mono bg-white border rounded px-1" />
              <span className="text-[10px] text-muted-foreground">d = €{fmt(travel.rentalDailyFee * travel.rentalDays)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[10px] text-muted-foreground w-20">Flight ticket</span>
              <input defaultValue={travel.flightTicket} className="w-16 h-6 font-mono bg-white border rounded px-1" />
            </div>
          </Row>

          <Row icon={null}
            label={<input defaultValue={labels.boardLodging} className="h-7 text-sm w-full bg-transparent focus:bg-white focus:border rounded px-1" />}
            total="—" totalMuted
            defaultOpen={false} expandable={false}
            action={<><CommentBtn /><Toggle on={included.board} onClick={() => setIncluded(p => ({ ...p, board: !p.board }))} /></>}
          />

          <Row icon={null}
            label={<input defaultValue={labels.training} className="h-7 text-sm w-full bg-transparent focus:bg-white focus:border rounded px-1" />}
            total={`${trainingDays} days`} totalMuted
            defaultOpen={false} expandable={false}
            action={<><CommentBtn /><Toggle on={included.training} onClick={() => setIncluded(p => ({ ...p, training: !p.training }))} /></>}
          />

          <Row icon={null}
            label={<input defaultValue={labels.packaging} className="h-7 text-sm w-full bg-transparent focus:bg-white focus:border rounded px-1" />}
            total="—" totalMuted
            defaultOpen={false} expandable={false}
            action={<><CommentBtn has /><Toggle on={included.packaging} onClick={() => setIncluded(p => ({ ...p, packaging: !p.packaging }))} /></>}
          />

          <Row icon={null}
            label={<input defaultValue={labels.transport} className="h-7 text-sm w-full bg-transparent focus:bg-white focus:border rounded px-1" />}
            total={`€${fmt(transportPrice)}`}
            defaultOpen={false}
            action={<><CommentBtn /><Toggle on={included.transport} onClick={() => setIncluded(p => ({ ...p, transport: !p.transport }))} /></>}
          >
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[10px] text-muted-foreground w-20">Importo</span>
              <input defaultValue={fmt(transportPrice)} className="w-24 h-7 font-mono text-right bg-white border rounded px-2" />
              <span className="text-[10px] text-muted-foreground">€</span>
            </div>
          </Row>
        </div>

        <div className={HEADER + " font-medium text-sm pt-1"}>
          <span /><span>Services Total</span>
          <span className="text-right font-mono">€{fmt(servicesTotal(included))}</span><span />
        </div>

        {/* TOTALS */}
        <div className="border-t-2 pt-3 space-y-2">
          <div className={HEADER + " text-base"}>
            <span /><input defaultValue={labels.grossTotal} className="h-7 font-medium bg-transparent focus:bg-white focus:border rounded px-1" />
            <span className="text-right font-mono font-bold">€{fmt(grossTotal)}</span><span />
          </div>
          <div className={HEADER + " text-base text-primary"}>
            <span /><input defaultValue={labels.netTotal} className="h-7 font-medium bg-transparent focus:bg-white focus:border rounded px-1" />
            <span className="text-right font-mono font-bold">€{fmt(netTotal)}</span><span />
          </div>
        </div>
      </div>
    </div>
  );
}
