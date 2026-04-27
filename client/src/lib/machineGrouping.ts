export function getBaseCode(machineCode: string | null | undefined): string | null {
  if (!machineCode || !machineCode.trim()) return null;
  const code = machineCode.trim();

  if (code.includes("-")) {
    const prefix = code.split("-")[0].trim().toUpperCase();
    return prefix.length >= 2 ? prefix : null;
  }

  const match = code.match(/^([A-Za-z]+)/);
  if (match && match[1].length >= 2) {
    return match[1].toUpperCase();
  }

  return null;
}

export function getMachineImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  return `/machine-images/${imageUrl.includes(".") ? imageUrl : `${imageUrl}.png`}`;
}

export interface SubgroupInfo {
  prefix: string;
  machines: any[];
  representativeImage: string | null;
}

export function computeSubgroups(machines: any[]): { subgroups: SubgroupInfo[]; ungrouped: any[] } {
  const prefixMap = new Map<string, any[]>();
  const noPrefix: any[] = [];

  for (const m of machines) {
    const prefix = getBaseCode(m.machineCode);
    if (prefix) {
      if (!prefixMap.has(prefix)) prefixMap.set(prefix, []);
      prefixMap.get(prefix)!.push(m);
    } else {
      noPrefix.push(m);
    }
  }

  const subgroups: SubgroupInfo[] = [];
  const ungrouped: any[] = [...noPrefix];

  for (const [prefix, group] of Array.from(prefixMap.entries())) {
    if (group.length >= 2) {
      const rep = group.find((m: any) => m.imageUrl) || group[0];
      subgroups.push({
        prefix,
        machines: group,
        representativeImage: rep?.imageUrl || null,
      });
    } else {
      ungrouped.push(...group);
    }
  }

  return { subgroups, ungrouped };
}
