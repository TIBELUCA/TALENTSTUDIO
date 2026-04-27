import type { AiCompletionMessage } from "./provider";
import type { AiLanguage } from "./types";

const LANGUAGE_INSTRUCTIONS: Record<AiLanguage, string> = {
  en: "Respond in English.",
  it: "Rispondi in italiano. Tutti i testi generati devono essere in italiano professionale.",
};

function systemPreamble(language: AiLanguage = "en"): string {
  return `You are an AI assistant for Talent Studio, a talent-management platform for influencer/creator agencies.
You help talent managers work more efficiently by analyzing inbound briefs, recommending talents, and drafting proposal text.
Your outputs must be structured JSON that matches the requested schema exactly.
You are an assistant — your suggestions require human review and approval before being used.
Always be professional, precise, and conservative in your recommendations.
${LANGUAGE_INSTRUCTIONS[language]}`;
}

export function buildEnquirySummaryPrompt(input: {
  enquirySubject: string;
  enquiryNotes: string;
  customerName: string;
  customerAddress?: string;
  dealerName?: string;
  attachmentNames: string[];
  existingItems: Array<{ machineName: string; quantity: number }>;
  language?: AiLanguage;
}): AiCompletionMessage[] {
  return [
    { role: "system", content: `${systemPreamble(input.language)}

Analyze the enquiry and produce a JSON object with this exact structure:
{
  "summary": "concise 2-3 sentence summary of what the customer needs",
  "customerIntent": "what the customer is trying to achieve",
  "keyRequirements": ["requirement 1", "requirement 2", ...],
  "missingInformation": [{ "field": "fieldName", "label": "Display Label", "importance": "required|recommended|optional", "reason": "why this matters" }],
  "riskFlags": [{ "severity": "low|medium|high", "category": "category", "message": "description", "suggestion": "what to do" }],
  "suggestedPriority": "low|medium|high|urgent",
  "estimatedComplexity": "simple|moderate|complex",
  "confidence": 0.0-1.0
}` },
    { role: "user", content: `Analyze this enquiry:

Subject: ${input.enquirySubject}
Customer: ${input.customerName}${input.customerAddress ? `\nAddress: ${input.customerAddress}` : ""}${input.dealerName ? `\nDealer: ${input.dealerName}` : ""}
Notes/Description: ${input.enquiryNotes || "(none provided)"}
Attachments: ${input.attachmentNames.length > 0 ? input.attachmentNames.join(", ") : "(none)"}
Requested Machines: ${input.existingItems.length > 0 ? input.existingItems.map(i => `${i.machineName} ×${i.quantity}`).join(", ") : "(none specified)"}` },
  ];
}

export function buildMachineRecommendationPrompt(input: {
  requirements: string;
  customerIndustry?: string;
  budget?: string;
  availableMachines: Array<{
    id: number;
    name: string;
    macroType: string | null;
    description: string;
    basePrice: string;
    options: Array<{ id: number; name: string; priceModifier: string }>;
  }>;
  language?: AiLanguage;
}): AiCompletionMessage[] {
  const machineList = input.availableMachines.map(m =>
    `[ID:${m.id}] ${m.name} (${m.macroType ?? "uncategorized"}) — €${m.basePrice}\n  ${m.description.slice(0, 200)}${m.description.length > 200 ? "..." : ""}\n  Options: ${m.options.map(o => `${o.name} (€${o.priceModifier})`).join(", ") || "none"}`
  ).join("\n\n");

  return [
    { role: "system", content: `${systemPreamble(input.language)}

Based on the customer requirements, recommend the most suitable machines from the available catalog.
Produce a JSON object with this exact structure:
{
  "recommendations": [{
    "machineId": number,
    "machineName": "string",
    "score": 0.0-1.0,
    "reasoning": "why this machine fits",
    "assumptions": "what assumptions you made (optional)",
    "suggestedOptions": [{ "optionId": number, "optionName": "string", "reasoning": "why" }],
    "suggestedQuantity": number
  }],
  "generalNotes": "optional overall notes",
  "dataGaps": ["information still needed for better recommendations"],
  "confidence": 0.0-1.0
}
Only recommend machines from the provided catalog. Do not invent machine IDs.` },
    { role: "user", content: `Customer Requirements: ${input.requirements}${input.customerIndustry ? `\nIndustry: ${input.customerIndustry}` : ""}${input.budget ? `\nBudget: ${input.budget}` : ""}

Available Machines:
${machineList}` },
  ];
}

export function buildOfferTextDraftPrompt(input: {
  offerSubject: string;
  customerName: string;
  selectedMachines: Array<{ name: string; description: string; quantity: number }>;
  availableSections: Array<{ id: string; name: string }>;
  availablePresets: Array<{ id: number; title: string; content: string }>;
  notes?: string;
  tone?: "formal" | "concise" | "persuasive";
  language?: AiLanguage;
}): AiCompletionMessage[] {
  const toneInstruction = input.tone
    ? `Use a ${input.tone} tone throughout.`
    : "Use a professional, formal tone.";

  return [
    { role: "system", content: `${systemPreamble(input.language)}

Draft professional offer text sections for a machinery quotation.
${toneInstruction}
Produce a JSON object with this exact structure:
{
  "subject": "refined offer subject line",
  "introduction": "opening paragraph for the offer (optional)",
  "sections": [{
    "sectionId": "section_id",
    "sectionName": "Section Name",
    "draftText": "the drafted text content",
    "notes": "optional notes about the draft"
  }],
  "closingParagraph": "professional closing paragraph (optional)",
  "suggestedPresetIds": [1, 2, ...],
  "riskFlags": [{ "severity": "low|medium|high", "category": "category", "message": "description", "suggestion": "what to do" }],
  "tone": "${input.tone ?? "formal"}",
  "confidence": 0.0-1.0
}
Only reference section IDs and preset IDs from the provided lists.` },
    { role: "user", content: `Draft offer text for:

Subject: ${input.offerSubject}
Customer: ${input.customerName}
${input.notes ? `Additional Notes: ${input.notes}` : ""}

Machines:
${input.selectedMachines.map(m => `- ${m.name} ×${m.quantity}: ${m.description.slice(0, 150)}`).join("\n")}

Available Sections:
${input.availableSections.map(s => `- ${s.id}: ${s.name}`).join("\n")}

Available Presets (terms/conditions templates):
${input.availablePresets.map(p => `- [ID:${p.id}] ${p.title}: ${p.content.slice(0, 100)}...`).join("\n")}` },
  ];
}

export function buildPresetRecommendationPrompt(input: {
  offerSubject: string;
  customerName: string;
  selectedMachines: Array<{
    id: number;
    name: string;
    macroType: string | null;
    options: Array<{ id: number; name: string }>;
  }>;
  availablePresets: Array<{ id: number; title: string; content: string; category?: string }>;
  availableOptions: Array<{ id: number; name: string; machineId: number; machineName: string }>;
  notes?: string;
  language?: AiLanguage;
}): AiCompletionMessage[] {
  return [
    { role: "system", content: `${systemPreamble(input.language)}

Recommend the most relevant presets (terms/conditions templates) and machine options for this offer.
Produce a JSON object with this exact structure:
{
  "suggestedPresets": [{
    "presetId": number,
    "presetTitle": "string",
    "reasoning": "why this preset is relevant",
    "relevanceScore": 0.0-1.0
  }],
  "suggestedOptions": [{
    "optionId": number,
    "optionName": "string",
    "machineId": number,
    "machineName": "string",
    "reasoning": "why this option should be included",
    "compatibilityNotes": "optional compatibility information"
  }],
  "exclusionWarnings": ["optional warnings about incompatible combinations"],
  "generalNotes": "optional overall notes",
  "confidence": 0.0-1.0
}
Only reference preset IDs and option IDs from the provided lists. Do not invent IDs.` },
    { role: "user", content: `Recommend presets and options for:

Subject: ${input.offerSubject}
Customer: ${input.customerName}
${input.notes ? `Notes: ${input.notes}` : ""}

Selected Machines:
${input.selectedMachines.map(m => `- [ID:${m.id}] ${m.name} (${m.macroType ?? "uncategorized"}) — Current options: ${m.options.map(o => o.name).join(", ") || "none"}`).join("\n")}

Available Presets:
${input.availablePresets.map(p => `- [ID:${p.id}] ${p.title}${p.category ? ` (${p.category})` : ""}: ${p.content.slice(0, 120)}...`).join("\n")}

Available Options:
${input.availableOptions.map(o => `- [ID:${o.id}] ${o.name} (for ${o.machineName})`).join("\n")}` },
  ];
}

export function buildAutoQuotePrompt(input: {
  enquirySubject: string;
  enquiryNotes: string;
  customerName: string;
  customerAddress?: string;
  dealerName?: string;
  attachmentNames: string[];
  salesmanNotes?: string;
  availableMachines: Array<{
    id: number;
    name: string;
    macroType: string | null;
    description: string;
    basePrice: string;
    options: Array<{ id: number; name: string; priceModifier: string }>;
  }>;
  availableSections: Array<{ id: string; name: string }>;
  availablePresets: Array<{ id: number; title: string; content: string }>;
  language?: AiLanguage;
}): AiCompletionMessage[] {
  const machineList = input.availableMachines.map(m =>
    `[ID:${m.id}] ${m.name} (${m.macroType ?? "uncategorized"}) — €${m.basePrice}\n  ${m.description.slice(0, 200)}${m.description.length > 200 ? "..." : ""}\n  Options: ${m.options.map(o => `[ID:${o.id}] ${o.name} (€${o.priceModifier})`).join(", ") || "none"}`
  ).join("\n\n");

  return [
    { role: "system", content: `${systemPreamble(input.language)}

You are performing a comprehensive Auto Quote workflow. Given a customer enquiry and the available machine catalog, you must:
1. Summarize the enquiry and identify customer intent
2. Extract structured requirements (machine type, capacity, materials, dimensions, constraints)
3. Recommend the best matching machines and options from the catalog
4. Recommend relevant terms/conditions presets
5. Draft a structured commercial offer
6. Identify missing information and potential risks

IMPORTANT SAFETY RULES:
- Do NOT finalize prices — prices are for reference only, the user will confirm them
- Do NOT mark the offer as sent — this is a draft for human review
- Be conservative in assumptions — flag uncertainty explicitly

Produce a JSON object with this exact structure:
{
  "summary": "concise 2-3 sentence summary of what the customer needs",
  "customerIntent": "what the customer is trying to achieve",
  "extractedRequirements": [{
    "category": "machine_type|capacity|material|dimensions|constraint|other",
    "label": "human-readable label",
    "value": "extracted value or description",
    "confidence": "explicit|inferred|uncertain"
  }],
  "recommendedMachines": [{
    "machineId": number,
    "machineName": "string",
    "score": 0.0-1.0,
    "reasoning": "why this machine fits the requirements",
    "suggestedQuantity": number,
    "suggestedOptions": [{ "optionId": number, "optionName": "string", "reasoning": "why" }]
  }],
  "recommendedPresets": [{
    "presetId": number,
    "presetTitle": "string",
    "reasoning": "why this preset is relevant",
    "relevanceScore": 0.0-1.0
  }],
  "draftSubject": "professional offer subject line",
  "draftIntroduction": "opening paragraph (optional)",
  "draftSections": [{
    "sectionId": "section_id from available sections",
    "sectionName": "Section Name",
    "draftText": "drafted content"
  }],
  "draftClosing": "professional closing paragraph (optional)",
  "missingInformation": [{ "field": "fieldName", "label": "Display Label", "importance": "required|recommended|optional", "reason": "why this matters" }],
  "riskFlags": [{ "severity": "low|medium|high", "category": "category", "message": "description", "suggestion": "what to do" }],
  "suggestedPriority": "low|medium|high|urgent",
  "estimatedComplexity": "simple|moderate|complex",
  "confidence": 0.0-1.0
}
Only reference machine IDs, option IDs, preset IDs, and section IDs from the provided lists. Do not invent IDs.` },
    { role: "user", content: `Generate a complete auto-quote from this enquiry:

Subject: ${input.enquirySubject}
Customer: ${input.customerName}${input.customerAddress ? `\nAddress: ${input.customerAddress}` : ""}${input.dealerName ? `\nDealer: ${input.dealerName}` : ""}
Enquiry Notes: ${input.enquiryNotes || "(none provided)"}${input.salesmanNotes ? `\nSalesman Notes: ${input.salesmanNotes}` : ""}
Attachments: ${input.attachmentNames.length > 0 ? input.attachmentNames.join(", ") : "(none)"}

Available Machines:
${machineList}

Available Document Sections:
${input.availableSections.map(s => `- ${s.id}: ${s.name}`).join("\n")}

Available Presets (terms/conditions):
${input.availablePresets.map(p => `- [ID:${p.id}] ${p.title}: ${p.content.slice(0, 100)}...`).join("\n")}` },
  ];
}

export function buildConfigSafetyGuardPrompt(input: {
  offerSubject: string;
  customerName: string;
  customerAddress?: string;
  totalPrice?: string;
  selectedMachines: Array<{
    name: string;
    quantity: number;
    unitPrice?: string;
    macroType?: string | null;
    options: Array<{ name: string; priceModifier?: string }>;
  }>;
  selectedPresets: Array<{ title: string; content: string }>;
  offerNotes?: string;
  enquiryNotes?: string;
  historicalContext?: string;
  language?: AiLanguage;
}): AiCompletionMessage[] {
  const machineDetails = input.selectedMachines.map(m => {
    const optionList = m.options.length > 0
      ? `\n    Options: ${m.options.map(o => `${o.name}${o.priceModifier ? ` (€${o.priceModifier})` : ""}`).join(", ")}`
      : "\n    Options: (none)";
    return `- ${m.name}${m.macroType ? ` [${m.macroType}]` : ""} ×${m.quantity}${m.unitPrice ? ` @ €${m.unitPrice}` : ""}${optionList}`;
  }).join("\n");

  return [
    { role: "system", content: `${systemPreamble(input.language)}

You are performing a Configuration Safety and Margin Guard review on a commercial offer.
Your job is to analyze the offer configuration to detect:
1. Incompatible or unusual machine and option combinations
2. Missing commercial elements (installation, training, warranty, delivery terms, payment terms, spare parts, documentation)
3. Pricing risks or margin concerns compared to typical industrial machinery offers
4. Configuration patterns that seem incorrect or suboptimal

CRITICAL SAFETY RULES:
- You MUST NOT automatically modify any prices
- You MUST NOT automatically approve or reject offers
- Your output is ADVISORY ONLY — all decisions remain with the human salesperson
- Be thorough but not alarmist — flag genuinely important items
- When uncertain, err on the side of caution and flag for human review

Produce a JSON object with this exact structure:
{
  "configurationIssues": [{
    "category": "incompatible_combo|unusual_config|missing_option|redundant_option",
    "severity": "low|medium|high|critical",
    "machineNames": ["affected machine names"],
    "optionNames": ["affected option names (if any)"],
    "title": "short issue title",
    "description": "detailed description of the issue",
    "suggestedFix": "how to resolve this"
  }],
  "missingElements": [{
    "category": "installation|training|warranty|delivery|payment_terms|spare_parts|documentation|other",
    "element": "what is missing",
    "importance": "required|recommended|optional",
    "description": "why this matters",
    "suggestedAction": "what to add or do"
  }],
  "pricingWarnings": [{
    "type": "below_market|above_market|margin_risk|discount_anomaly|missing_price",
    "severity": "low|medium|high|critical",
    "title": "short warning title",
    "description": "what the pricing concern is",
    "affectedItems": ["items affected"],
    "suggestedAction": "recommended action"
  }],
  "marginRisk": {
    "overallMarginAssessment": "healthy|attention|warning|critical",
    "estimatedMarginCategory": "high|moderate|low|negative",
    "factors": ["factors contributing to the assessment"],
    "recommendations": ["specific recommendations to improve margins"]
  },
  "suggestedFixes": [{
    "issueRef": "reference to the issue this fix addresses",
    "fixType": "add_option|remove_option|replace_machine|add_preset|adjust_quantity|review_pricing|add_terms",
    "title": "short fix title",
    "description": "detailed fix description",
    "priority": "low|medium|high|critical",
    "estimatedImpact": "what improvement this fix would bring"
  }],
  "overallSafetyScore": 0.0-1.0,
  "readyToSend": true/false,
  "blockers": ["critical issues that must be resolved before sending (empty if readyToSend is true)"],
  "advisoryNotes": ["general advisory notes for the salesperson"],
  "confidence": 0.0-1.0
}

The overallSafetyScore should be 1.0 for a perfectly configured offer and decrease based on issues found.
Set readyToSend to false only if there are critical blockers that prevent sending the offer.` },
    { role: "user", content: `Perform a Configuration Safety and Margin Guard review on this offer:

Subject: ${input.offerSubject}
Customer: ${input.customerName}${input.customerAddress ? `\nAddress: ${input.customerAddress}` : ""}${input.totalPrice ? `\nTotal Price: €${input.totalPrice}` : ""}
${input.enquiryNotes ? `\nOriginal Enquiry Notes: ${input.enquiryNotes}` : ""}
${input.offerNotes ? `\nOffer Notes: ${input.offerNotes}` : ""}

Machines and Configuration:
${machineDetails}

Terms & Conditions:
${input.selectedPresets.length > 0 ? input.selectedPresets.map(p => `- ${p.title}: ${p.content.slice(0, 200)}...`).join("\n") : "(none selected)"}
${input.historicalContext ? `\nHistorical Context:\n${input.historicalContext}` : ""}` },
  ];
}

export function buildRiskReviewPrompt(input: {
  offerSubject: string;
  customerName: string;
  customerAddress?: string;
  totalPrice?: string;
  selectedMachines: Array<{ name: string; quantity: number; unitPrice?: string }>;
  selectedPresets: Array<{ title: string; content: string }>;
  offerNotes?: string;
  enquiryNotes?: string;
  language?: AiLanguage;
}): AiCompletionMessage[] {
  return [
    { role: "system", content: `${systemPreamble(input.language)}

Review this commercial offer for risks, missing details, and potential issues.
Be thorough but not alarmist — flag genuinely important items.
Produce a JSON object with this exact structure:
{
  "overallRiskLevel": "low|medium|high",
  "items": [{
    "category": "commercial|technical|communication|pricing|compliance",
    "severity": "low|medium|high",
    "title": "short title",
    "description": "what the issue is",
    "recommendation": "what to do about it",
    "requiresManualReview": true/false
  }],
  "missingCommercialDetails": ["list of missing commercial information"],
  "missingTechnicalDetails": ["list of missing technical specifications"],
  "pricingFlags": ["any pricing concerns or anomalies"],
  "recommendedActions": ["prioritized list of actions before sending the offer"],
  "confidence": 0.0-1.0
}` },
    { role: "user", content: `Review this offer for risks:

Subject: ${input.offerSubject}
Customer: ${input.customerName}${input.customerAddress ? `\nAddress: ${input.customerAddress}` : ""}${input.totalPrice ? `\nTotal Price: €${input.totalPrice}` : ""}
${input.enquiryNotes ? `\nOriginal Enquiry Notes: ${input.enquiryNotes}` : ""}
${input.offerNotes ? `\nOffer Notes: ${input.offerNotes}` : ""}

Machines:
${input.selectedMachines.map(m => `- ${m.name} ×${m.quantity}${m.unitPrice ? ` @ €${m.unitPrice}` : ""}`).join("\n")}

Terms & Conditions:
${input.selectedPresets.length > 0 ? input.selectedPresets.map(p => `- ${p.title}: ${p.content.slice(0, 150)}...`).join("\n") : "(none selected)"}` },
  ];
}
