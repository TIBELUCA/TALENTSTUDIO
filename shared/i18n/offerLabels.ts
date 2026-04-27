export type OfferLang = "it" | "en" | "de" | "fr" | "es" | "pt";

const SUPPORTED: OfferLang[] = ["it", "en", "de", "fr", "es", "pt"];

export function normalizeOfferLang(lang: string | null | undefined): OfferLang {
  const l = (lang ?? "it").toLowerCase().slice(0, 2) as OfferLang;
  return (SUPPORTED.includes(l) ? l : "it");
}

type Dict = Record<OfferLang, string>;

const D: Record<string, Dict> = {
  // Section titles
  lineTitle: {
    it: "Titolo Linea", en: "Line Title", de: "Linientitel",
    fr: "Titre de la ligne", es: "Título de Línea", pt: "Título da Linha",
  },
  machinesEquipment: {
    it: "Macchine ed equipaggiamento", en: "Machines & Equipment", de: "Maschinen & Ausrüstung",
    fr: "Machines et équipement", es: "Máquinas y equipamiento", pt: "Máquinas e equipamentos",
  },
  projectData: {
    it: "Dati di progetto e specifiche tecniche", en: "Project Data & Technical Specifications",
    de: "Projektdaten & technische Daten", fr: "Données projet & spécifications techniques",
    es: "Datos del proyecto y especificaciones técnicas", pt: "Dados do projeto e especificações técnicas",
  },
  utilitiesSummary: {
    it: "Riepilogo utenze", en: "Utilities Summary", de: "Versorgungsübersicht",
    fr: "Récapitulatif des utilités", es: "Resumen de utilidades", pt: "Resumo de utilidades",
  },
  priceOverview: {
    it: "Riepilogo prezzi", en: "Price Overview", de: "Preisübersicht",
    fr: "Aperçu des prix", es: "Resumen de precios", pt: "Resumo de preços",
  },
  termsConditions: {
    it: "Termini e condizioni", en: "Terms & Conditions", de: "Geschäftsbedingungen",
    fr: "Conditions générales", es: "Términos y Condiciones", pt: "Termos e Condições",
  },

  // Metadata box
  customer: { it: "Cliente", en: "Customer", de: "Kunde", fr: "Client", es: "Cliente", pt: "Cliente" },
  salesman: { it: "Venditore", en: "Salesman", de: "Verkäufer", fr: "Commercial", es: "Vendedor", pt: "Vendedor" },
  date: { it: "Data", en: "Date", de: "Datum", fr: "Date", es: "Fecha", pt: "Data" },
  endCustomer: {
    it: "Cliente finale", en: "End Customer", de: "Endkunde",
    fr: "Client final", es: "Cliente final", pt: "Cliente final",
  },
  ref: { it: "Rif.", en: "Ref.", de: "Ref.", fr: "Réf.", es: "Ref.", pt: "Ref." },

  // Machine line
  positionPrefix: {
    it: "Pos.", en: "Pos.", de: "Pos.", fr: "Pos.", es: "Pos.", pt: "Pos.",
  },
  machinePosPrefix: {
    it: "Macchina — Pos.", en: "Machine — Pos.", de: "Maschine — Pos.",
    fr: "Machine — Pos.", es: "Máquina — Pos.", pt: "Máquina — Pos.",
  },
  includedOptions: {
    it: "Opzioni incluse:", en: "Included Options:", de: "Inklusive Optionen:",
    fr: "Options incluses :", es: "Opciones incluidas:", pt: "Opções incluídas:",
  },
  options: {
    it: "Opzioni:", en: "Options:", de: "Optionen:",
    fr: "Options :", es: "Opciones:", pt: "Opções:",
  },
  modified: {
    it: "Modificata", en: "Modified", de: "Geändert",
    fr: "Modifié", es: "Modificada", pt: "Modificada",
  },
  detail: {
    it: "Dettaglio", en: "Detail", de: "Detail",
    fr: "Détail", es: "Detalle", pt: "Detalhe",
  },

  // Price overview
  interlocking: {
    it: "Interlocking", en: "Interlocking", de: "Interlocking",
    fr: "Interlocking", es: "Interlocking", pt: "Interlocking",
  },
  totalListPrice: {
    it: "TOTALE LISTINO (franco fabbrica, installazione esclusa)",
    en: "TOTAL LIST PRICE (ex works, installation excluded)",
    de: "GESAMTLISTENPREIS (ab Werk, Montage ausgeschlossen)",
    fr: "TOTAL PRIX CATALOGUE (départ usine, installation exclue)",
    es: "PRECIO LISTA TOTAL (franco fábrica, instalación excluida)",
    pt: "PREÇO LISTA TOTAL (na fábrica, instalação excluída)",
  },
  netServicePrices: {
    it: "PREZZI NETTI SERVIZI", en: "NET SERVICE PRICES",
    de: "NETTO-SERVICEPREISE", fr: "PRIX NETS DES SERVICES",
    es: "PRECIOS NETOS DE SERVICIOS", pt: "PREÇOS LÍQUIDOS DOS SERVIÇOS",
  },
  installation: {
    it: "Installazione e avviamento", en: "Installation and start-up",
    de: "Installation und Inbetriebnahme", fr: "Installation et mise en service",
    es: "Instalación y puesta en marcha", pt: "Instalação e arranque",
  },
  travelCosts: {
    it: "Spese di viaggio e voli", en: "Travel and flight costs",
    de: "Reise- und Flugkosten", fr: "Frais de déplacement et de vol",
    es: "Gastos de viaje y vuelos", pt: "Despesas de viagem e voos",
  },
  boardLodging: {
    it: "Vitto e alloggio", en: "Board and lodging",
    de: "Verpflegung und Unterkunft", fr: "Pension complète",
    es: "Comidas y alojamiento", pt: "Refeições e alojamento",
  },
  training: {
    it: "Formazione", en: "Training", de: "Schulung",
    fr: "Formation", es: "Formación", pt: "Formação",
  },
  packaging: {
    it: "Imballaggio", en: "Packaging", de: "Verpackung",
    fr: "Emballage", es: "Embalaje", pt: "Embalagem",
  },
  transport: {
    it: "Trasporto", en: "Transport", de: "Transport",
    fr: "Transport", es: "Transporte", pt: "Transporte",
  },
  discount: {
    it: "Sconto", en: "Discount", de: "Rabatt",
    fr: "Remise", es: "Descuento", pt: "Desconto",
  },
  grossTotal: {
    it: "Totale Lordo", en: "Gross Total", de: "Bruttosumme",
    fr: "Total brut", es: "Total bruto", pt: "Total bruto",
  },
  netTotal: {
    it: "TOTALE NETTO", en: "NET TOTAL", de: "NETTO-GESAMTSUMME",
    fr: "TOTAL NET", es: "TOTAL NETO", pt: "TOTAL LÍQUIDO",
  },
  included: {
    it: "INCLUSO", en: "INCLUDED", de: "INKLUSIVE",
    fr: "INCLUS", es: "INCLUIDO", pt: "INCLUÍDO",
  },
  excluded: {
    it: "ESCLUSO", en: "EXCLUDED", de: "AUSGESCHLOSSEN",
    fr: "EXCLU", es: "EXCLUIDO", pt: "EXCLUÍDO",
  },
  days: {
    it: "giorni", en: "days", de: "Tage",
    fr: "jours", es: "días", pt: "dias",
  },
  incl: { it: "Incl.", en: "Incl.", de: "Inkl.", fr: "Incl.", es: "Incl.", pt: "Incl." },

  // Utilities labels
  electricalPower: {
    it: "Potenza elettrica", en: "Electrical Power", de: "Elektrische Leistung",
    fr: "Puissance électrique", es: "Potencia eléctrica", pt: "Potência elétrica",
  },
  compressedAir: {
    it: "Aria compressa", en: "Compressed Air", de: "Druckluft",
    fr: "Air comprimé", es: "Aire comprimido", pt: "Ar comprimido",
  },
  exhaustedAir: {
    it: "Aria estratta", en: "Exhausted Air", de: "Abluft",
    fr: "Air extrait", es: "Aire extraído", pt: "Ar extraído",
  },
  airIntroduced: {
    it: "Aria immessa", en: "Air Introduced", de: "Zuluft",
    fr: "Air introduit", es: "Aire introducido", pt: "Ar introduzido",
  },
  noUtilityData: {
    it: "Nessun dato di utenza disponibile per le macchine di questa offerta.",
    en: "No utility data available for this offer's machines.",
    de: "Keine Versorgungsdaten für die Maschinen dieses Angebots verfügbar.",
    fr: "Aucune donnée d'utilité disponible pour les machines de cette offre.",
    es: "No hay datos de utilidades disponibles para las máquinas de esta oferta.",
    pt: "Nenhum dado de utilidade disponível para as máquinas desta oferta.",
  },
  noSpecData: {
    it: "Nessun dato tecnico disponibile.", en: "No specification data recorded.",
    de: "Keine technischen Daten erfasst.", fr: "Aucune donnée technique enregistrée.",
    es: "No hay datos técnicos registrados.", pt: "Nenhum dado técnico registrado.",
  },

  // Terms section sub-headings
  delivery: {
    it: "Consegna", en: "Delivery", de: "Lieferung",
    fr: "Livraison", es: "Entrega", pt: "Entrega",
  },
  payment: {
    it: "Pagamento", en: "Payment", de: "Zahlung",
    fr: "Paiement", es: "Pago", pt: "Pagamento",
  },

  // Technical specs labels
  minMaxLength: {
    it: "Lunghezza min/max pezzi (mm)", en: "Min/Max. length of pieces (mm)",
    de: "Min/Max. Länge der Stücke (mm)", fr: "Longueur min/max des pièces (mm)",
    es: "Longitud mín/máx de piezas (mm)", pt: "Comprimento mín/máx das peças (mm)",
  },
  maxWidth: {
    it: "Larghezza max pezzi (mm)", en: "Max. width of pieces (mm)",
    de: "Max. Breite der Stücke (mm)", fr: "Largeur max des pièces (mm)",
    es: "Ancho máx de piezas (mm)", pt: "Largura máx das peças (mm)",
  },
  minMaxThickness: {
    it: "Spessore min/max (mm)", en: "Min/Max. thickness (mm)",
    de: "Min/Max. Dicke (mm)", fr: "Épaisseur min/max (mm)",
    es: "Espesor mín/máx (mm)", pt: "Espessura mín/máx (mm)",
  },
  averageLineSpeed: {
    it: "Velocità media linea (mt/min)", en: "Average line speed (mt/min)",
    de: "Durchschnittliche Liniengeschwindigkeit (m/min)", fr: "Vitesse moyenne de la ligne (m/min)",
    es: "Velocidad media de línea (m/min)", pt: "Velocidade média da linha (m/min)",
  },
  controlSide: {
    it: "Lato controllo", en: "Control side", de: "Bedienseite",
    fr: "Côté commande", es: "Lado de control", pt: "Lado de controle",
  },
  maxBow: {
    it: "Bombatura max pannello", en: "Max. bow of panel",
    de: "Max. Wölbung des Paneels", fr: "Cintrage max du panneau",
    es: "Curvatura máx del panel", pt: "Empenamento máx do painel",
  },
  paint: {
    it: "Vernice", en: "Paint", de: "Lack",
    fr: "Peinture", es: "Pintura", pt: "Tinta",
  },
  substrate: {
    it: "Substrato", en: "Substrate", de: "Substrat",
    fr: "Substrat", es: "Sustrato", pt: "Substrato",
  },
  finishing: {
    it: "Livello di finitura", en: "Finishing level", de: "Finish-Niveau",
    fr: "Niveau de finition", es: "Nivel de acabado", pt: "Nível de acabamento",
  },
  standardVoltage: {
    it: "Tensione standard", en: "Standard voltage", de: "Standardspannung",
    fr: "Tension standard", es: "Tensión estándar", pt: "Tensão padrão",
  },
  standardColors: {
    it: "Colori standard", en: "Standard colors", de: "Standardfarben",
    fr: "Couleurs standards", es: "Colores estándar", pt: "Cores padrão",
  },
  components: {
    it: "Componenti", en: "Components", de: "Komponenten",
    fr: "Composants", es: "Componentes", pt: "Componentes",
  },
  precautions: {
    it: "Precauzioni", en: "Precautions", de: "Vorsichtsmaßnahmen",
    fr: "Précautions", es: "Precauciones", pt: "Precauções",
  },
  airIntake: {
    it: "Presa d'aria", en: "Air intake", de: "Lufteinlass",
    fr: "Prise d'air", es: "Toma de aire", pt: "Tomada de ar",
  },
  commissioning: {
    it: "Messa in servizio", en: "Commissioning", de: "Inbetriebnahme",
    fr: "Mise en service", es: "Puesta en marcha", pt: "Comissionamento",
  },

  // PDF metadata box headings (uppercase variants used in the print layout)
  dateBox: { it: "DATA", en: "DATE", de: "DATUM", fr: "DATE", es: "FECHA", pt: "DATA" },
  salesmanBox: {
    it: "VENDITORE", en: "SALESMAN", de: "VERKÄUFER",
    fr: "COMMERCIAL", es: "VENDEDOR", pt: "VENDEDOR",
  },
  customerBox: {
    it: "CLIENTE", en: "CUSTOMER", de: "KUNDE",
    fr: "CLIENT", es: "CLIENTE", pt: "CLIENTE",
  },
  refPrefix: { it: "Rif.", en: "Ref.", de: "Ref.", fr: "Réf.", es: "Ref.", pt: "Ref." },

  // Day-rate suffix used in installation labels
  perDay: {
    it: "/giorno", en: "/day", de: "/Tag",
    fr: "/jour", es: "/día", pt: "/dia",
  },
  tbd: {
    it: "Da definire", en: "TBD", de: "TBD",
    fr: "À définir", es: "Por definir", pt: "A definir",
  },
  offerTitle: {
    it: "TITOLO OFFERTA", en: "OFFER TITLE", de: "ANGEBOTSTITEL",
    fr: "TITRE DE L'OFFRE", es: "TÍTULO DE LA OFERTA", pt: "TÍTULO DA OFERTA",
  },
  layout: {
    it: "LAYOUT", en: "LAYOUT", de: "LAYOUT",
    fr: "LAYOUT", es: "LAYOUT", pt: "LAYOUT",
  },
  afterDiscount: {
    it: "(dopo sconto del {pct}%)", en: "(after {pct}% discount)",
    de: "(nach {pct}% Rabatt)", fr: "(après remise de {pct}%)",
    es: "(después de {pct}% de descuento)", pt: "(após desconto de {pct}%)",
  },
};

export function tOffer(key: string, lang: string | null | undefined): string {
  const l = normalizeOfferLang(lang);
  const entry = D[key];
  if (!entry) return key;
  return entry[l] || entry.en || entry.it || key;
}
