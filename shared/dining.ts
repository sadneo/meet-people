import { z } from 'zod'

// PostgreSQL has no year zero; keep browser date input and storage in agreement.
export const MenuDateSchema = z.iso.date().refine(date => date >= '0001-01-01', 'Choose a date from year 1 onwards.')
export const DiningQuerySchema = z.object({ date: MenuDateSchema }).strict()

export const DiningItemSchema = z.object({
  external_id: z.string().nullable(),
  name: z.string().min(1),
  station: z.string().nullable(),
  description: z.string().nullable(),
  ingredients: z.string().nullable(),
  image_url: z.string().nullable(),
  price: z.union([z.string(), z.number()]).nullable(),
  nutrition: z.record(z.string(), z.number().nullable()).nullable(),
  serving_size: z.object({ amount: z.union([z.string(), z.number()]).nullable(), unit: z.string().nullable() }).nullable(),
  labels: z.array(z.string()),
})
export const DiningMenuSchema = z.object({
  id: z.uuid(),
  source: z.enum(['nutrislice_sbu', 'sbu_hospital']),
  location_slug: z.string().min(1),
  location_name: z.string().min(1),
  menu_slug: z.string().min(1),
  menu_name: z.string().min(1),
  menu_date: MenuDateSchema,
  source_url: z.string(),
  items: z.array(DiningItemSchema),
  notices: z.array(z.string()),
  last_synced_at: z.iso.datetime({ offset: true }),
})
export const DiningResponseSchema = z.object({ date: MenuDateSchema, menus: z.array(DiningMenuSchema) })
export type DiningItem = z.infer<typeof DiningItemSchema>
export type DiningMenu = z.infer<typeof DiningMenuSchema>

/** Menus follow the campus calendar, even when the device is in another zone. */
export function campusDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (name: string) => parts.find(value => value.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
