/**
 * Country presets: currency, how numbers are grouped, what the tax number is called, and the usual
 * VAT/GST/sales-tax rates as a starting point. Rates change, so every rate stays editable and each change
 * is kept with a note. These are common published rates, not tax advice: check with the tax office.
 */
import type { Currency, TaxKind, TaxRate } from './types'

export interface CountryPreset {
  code: string
  name: string
  currency: Currency
  /** What the tax registration is called on bills. */
  taxNoLabel: string
  /** What the main tax is called. */
  taxName: string
  rates: Omit<TaxRate, 'id'>[]
  /** Shown when the preset is picked. */
  hint: string
}

const r = (name: string, kind: TaxKind, rate: number, appliesTo: TaxRate['appliesTo'], note = ''): Omit<TaxRate, 'id'> => ({ name, kind, rate, appliesTo, active: true, note })

export const COUNTRIES: CountryPreset[] = [
  {
    code: 'BD', name: 'Bangladesh', currency: { code: 'BDT', symbol: 'Tk', grouping: 'lakh' }, taxNoLabel: 'BIN', taxName: 'VAT',
    hint: 'NBR rates: VAT 15% standard; reduced rates for some goods and trading. Import VAT, AT and AIT come from customs.',
    rates: [
      r('VAT 15%', 'vat', 15, 'both', 'Standard rate'),
      r('VAT 10%', 'vat', 10, 'both', 'Reduced rate'),
      r('VAT 7.5%', 'vat', 7.5, 'both', 'Reduced rate'),
      r('VAT 5% (trading)', 'vat', 5, 'sales', 'Trading stage'),
      r('Supplementary duty', 'sd', 0, 'sales', 'Set the SD rate for SD goods'),
      r('AIT / TDS', 'withholding', 5, 'purchases', 'Advance income tax deducted at source'),
    ],
  },
  {
    code: 'CN', name: 'China', currency: { code: 'CNY', symbol: '¥', grouping: 'western' }, taxNoLabel: 'USCC', taxName: 'VAT',
    hint: 'VAT 13% on most goods, 9% on some goods and transport, 6% on services; small-scale taxpayers 3%.',
    rates: [
      r('VAT 13%', 'vat', 13, 'both', 'Most goods'),
      r('VAT 9%', 'vat', 9, 'both', 'Farm goods, transport, some goods'),
      r('VAT 6%', 'vat', 6, 'both', 'Services'),
      r('VAT 3% (small-scale)', 'vat', 3, 'sales', 'Small-scale taxpayer'),
    ],
  },
  {
    code: 'US', name: 'United States', currency: { code: 'USD', symbol: '$', grouping: 'western' }, taxNoLabel: 'EIN', taxName: 'Sales tax',
    hint: 'No VAT. Sales tax is set by each state and city: enter your combined rate. Sales for resale are usually exempt.',
    rates: [
      r('Sales tax', 'sales', 0, 'sales', 'Set your state + local rate'),
      r('Resale (exempt)', 'sales', 0, 'sales', 'With a resale certificate'),
    ],
  },
  {
    code: 'IN', name: 'India', currency: { code: 'INR', symbol: '₹', grouping: 'lakh' }, taxNoLabel: 'GSTIN', taxName: 'GST',
    hint: 'GST slabs. Inside one state the GST splits into CGST and SGST; between states it is IGST.',
    rates: [r('GST 5%', 'gst', 5, 'both'), r('GST 12%', 'gst', 12, 'both'), r('GST 18%', 'gst', 18, 'both'), r('GST 28%', 'gst', 28, 'both'), r('TDS', 'withholding', 1, 'purchases')],
  },
  {
    code: 'PK', name: 'Pakistan', currency: { code: 'PKR', symbol: 'Rs', grouping: 'western' }, taxNoLabel: 'NTN', taxName: 'Sales tax',
    hint: 'General sales tax 18% on goods; services are taxed by provinces.',
    rates: [r('Sales tax 18%', 'sales', 18, 'both'), r('Withholding tax', 'withholding', 4.5, 'purchases')],
  },
  {
    code: 'AE', name: 'United Arab Emirates', currency: { code: 'AED', symbol: 'AED', grouping: 'western' }, taxNoLabel: 'TRN', taxName: 'VAT',
    hint: 'VAT 5% standard; exports are zero-rated.',
    rates: [r('VAT 5%', 'vat', 5, 'both'), r('VAT 0% (export)', 'vat', 0, 'sales', 'Zero-rated')],
  },
  {
    code: 'SA', name: 'Saudi Arabia', currency: { code: 'SAR', symbol: 'SAR', grouping: 'western' }, taxNoLabel: 'VAT no.', taxName: 'VAT',
    hint: 'VAT 15% standard.',
    rates: [r('VAT 15%', 'vat', 15, 'both'), r('VAT 0% (export)', 'vat', 0, 'sales', 'Zero-rated')],
  },
  {
    code: 'GB', name: 'United Kingdom', currency: { code: 'GBP', symbol: '£', grouping: 'western' }, taxNoLabel: 'VAT reg. no.', taxName: 'VAT',
    hint: 'VAT 20% standard, 5% reduced, 0% zero-rated.',
    rates: [r('VAT 20%', 'vat', 20, 'both'), r('VAT 5%', 'vat', 5, 'both'), r('VAT 0%', 'vat', 0, 'both')],
  },
  {
    code: 'EU', name: 'European Union', currency: { code: 'EUR', symbol: '€', grouping: 'western' }, taxNoLabel: 'VAT ID', taxName: 'VAT',
    hint: 'Each country sets its own VAT (about 17% to 27%). Enter yours.',
    rates: [r('VAT standard', 'vat', 20, 'both', 'Set your country’s rate'), r('VAT reduced', 'vat', 10, 'both'), r('VAT 0% (intra-EU / export)', 'vat', 0, 'sales')],
  },
  {
    code: 'MY', name: 'Malaysia', currency: { code: 'MYR', symbol: 'RM', grouping: 'western' }, taxNoLabel: 'SST no.', taxName: 'SST',
    hint: 'Sales tax 10% or 5% on goods; service tax 8%.',
    rates: [r('Sales tax 10%', 'sales', 10, 'sales'), r('Sales tax 5%', 'sales', 5, 'sales'), r('Service tax 8%', 'sales', 8, 'both')],
  },
  {
    code: 'XX', name: 'Other country (set my own)', currency: { code: 'USD', symbol: '$', grouping: 'western' }, taxNoLabel: 'Tax no.', taxName: 'Tax',
    hint: 'Pick your currency and add your own tax rates.',
    rates: [r('Tax', 'vat', 0, 'both', 'Set your rate')],
  },
]

export const countryByCode = (code: string | undefined): CountryPreset => COUNTRIES.find((c) => c.code === code) || COUNTRIES[0]

export const TAX_KINDS: Record<TaxKind, string> = {
  vat: 'VAT', gst: 'GST', sales: 'Sales tax', sd: 'Supplementary duty', withholding: 'Withholding / AIT', income: 'Income tax', other: 'Other tax',
}
/** Taxes that are collected from customers and paid over to the government, net of what was paid on purchases. */
export const isConsumptionTax = (k: TaxKind) => k === 'vat' || k === 'gst' || k === 'sales' || k === 'sd'
