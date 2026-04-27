import { z } from 'zod';
import { 
  insertCustomerSchema, customers, 
  insertMachineSchema, machines, 
  updateMachineSchema,
  insertMachineOptionSchema, machineOptions,
  insertPresetSchema, presets,
  insertOfferSchema, offers,
  insertOfferItemSchema, offerItems,
  insertOfferItemOptionSchema, offerItemOptions
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  customers: {
    list: {
      method: 'GET' as const,
      path: '/api/customers',
      responses: {
        200: z.array(z.custom<typeof customers.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/customers',
      input: insertCustomerSchema,
      responses: {
        201: z.custom<typeof customers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/customers/:id',
      input: insertCustomerSchema.partial(),
      responses: {
        200: z.custom<typeof customers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/customers/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  machines: {
    list: {
      method: 'GET' as const,
      path: '/api/machines',
      responses: {
        200: z.array(z.custom<typeof machines.$inferSelect & { options: (typeof machineOptions.$inferSelect)[] }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/machines',
      input: insertMachineSchema,
      responses: {
        201: z.custom<typeof machines.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/machines/:id',
      input: updateMachineSchema,
      responses: {
        200: z.custom<typeof machines.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    // We'll handle option creation separately or nested if needed, simplified here
    import: {
      method: 'POST' as const,
      path: '/api/machines/import',
      responses: {
        200: z.object({ machines: z.number(), options: z.number() }),
        400: errorSchemas.validation,
      },
    },
    deleteMachine: {
      method: 'DELETE' as const,
      path: '/api/machines/:id',
      responses: {
        204: z.void(),
      },
    },
  },
  machineOptions: {
    create: {
      method: 'POST' as const,
      path: '/api/machines/:machineId/options',
      input: insertMachineOptionSchema.omit({ machineId: true }),
      responses: {
        201: z.custom<typeof machineOptions.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/machine-options/:optionId',
      input: insertMachineOptionSchema.omit({ machineId: true }).partial(),
      responses: {
        200: z.custom<typeof machineOptions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/machine-options/:optionId',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  presets: {
    list: {
      method: 'GET' as const,
      path: '/api/presets',
      responses: {
        200: z.array(z.custom<typeof presets.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/presets',
      input: insertPresetSchema,
      responses: {
        201: z.custom<typeof presets.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/presets/:id',
      input: insertPresetSchema.partial(),
      responses: {
        200: z.custom<typeof presets.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/presets/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  settings: {
    getDocumentFormat: {
      method: 'GET' as const,
      path: '/api/settings/document-format',
      responses: { 200: z.any() },
    },
    getFamilyDefaults: {
      method: 'GET' as const,
      path: '/api/settings/family-defaults',
      responses: { 200: z.any() },
    },
    saveFamilyDefaults: {
      method: 'PUT' as const,
      path: '/api/settings/family-defaults',
      input: z.record(z.string(), z.record(z.string(), z.string())),
      responses: { 200: z.any() },
    },
    saveDocumentFormat: {
      method: 'PUT' as const,
      path: '/api/settings/document-format',
      input: z.object({
        sections: z.array(z.any()),
        pageBackground: z.string().optional(),
        borderRadius: z.number().optional(),
        borderWidth: z.number().optional(),
        header: z.object({
          logoEnabled: z.boolean(),
          logoUrl: z.string().optional(),
          logoSize: z.number().min(20).max(100).optional(),
          offerNumberEnabled: z.boolean(),
          offerNumberStyle: z.object({
            fontSize: z.number().min(5).max(24),
            fontFamily: z.string(),
            bold: z.boolean(),
            italic: z.boolean(),
            color: z.string(),
          }).optional(),
          dateEnabled: z.boolean(),
          dateStyle: z.object({
            fontSize: z.number().min(5).max(24),
            fontFamily: z.string(),
            bold: z.boolean(),
            italic: z.boolean(),
            color: z.string(),
          }).optional(),
          layout: z.enum(['logo-left', 'logo-right']),
        }).optional(),
        footer: z.object({
          companyDataEnabled: z.boolean(),
          companyLines: z.array(z.string()),
          pageNumberEnabled: z.boolean(),
          fontSize: z.number(),
          fontFamily: z.string().optional(),
        }).optional(),
        offerReferenceFormat: z.object({
          prefix: z.string().max(20),
          separator: z.string().max(5),
          progressivePadding: z.number().int().min(1).max(8),
          versionEnabled: z.boolean(),
          versionSeparator: z.string().min(1).max(5),
          versionInitial: z.number().int().min(0).max(1),
        }).nullable().optional(),
      }),
      responses: { 200: z.any() },
    },
  },
  offers: {
    list: {
      method: 'GET' as const,
      path: '/api/offers',
      responses: {
        200: z.array(z.custom<typeof offers.$inferSelect & { customer: typeof customers.$inferSelect }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/offers',
      // Complex input: Offer + Items + Options
      input: z.object({
        offer: insertOfferSchema,
        items: z.array(z.object({
          machineId: z.number(),
          quantity: z.number(),
          optionIds: z.array(z.number())
        }))
      }),
      responses: {
        201: z.custom<typeof offers.$inferSelect>(),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/offers/:id',
      responses: {
        200: z.custom<typeof offers.$inferSelect & { 
          customer: typeof customers.$inferSelect,
          items: (typeof offerItems.$inferSelect & { 
            options: (typeof offerItemOptions.$inferSelect)[] 
          })[] 
        }>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/offers/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/offers/:id/status',
      input: z.object({ status: z.enum(["Draft", "Sent", "Accepted", "Rejected", "Expired"]) }),
      responses: {
        200: z.custom<typeof offers.$inferSelect>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      },
    },
    createVersion: {
      method: 'POST' as const,
      path: '/api/offers/:id/version',
      responses: {
        201: z.custom<typeof offers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/offers/:id',
      input: z.object({
        offer: z.object({
          customerId: z.number(),
          subject: z.string(),
          salesmanName: z.string(),
          salesmanEmail: z.string().nullable().optional(),
          salesmanMobile: z.string().nullable().optional(),
          totalPrice: z.union([z.number(), z.string()]),
          projectData: z.any().optional(),
          language: z.string().optional(),
          salesScenario: z.enum(["direct", "with_dealer", "to_dealer"]).nullable().optional(),
        }).passthrough(),
        items: z.array(z.object({
          machineId: z.number(),
          quantity: z.number(),
          optionIds: z.array(z.number()),
        }).passthrough()),
      }),
      responses: {
        200: z.custom<typeof offers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
