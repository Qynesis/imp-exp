import { byId, customsCalc, DEFAULT_PORT, DUTIES, num, todayISO, type DutyKey } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

export function CustomsDetailsSheet({ importId }: { importId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const cu = s ? customsCalc(db, s).cu : null
  const [v, , bind, nbind] = useForm(() => ({
    hsCode: cu?.hsCode || '', port: cu?.port || DEFAULT_PORT, cnf: cu?.cnf || '', boeNo: cu?.boeNo || '', boeDate: cu?.boeDate || '', container: cu?.container || '',
    av: cu?.av ? String(cu.av) : '', freeUntil: cu?.freeUntil || '', demurragePerDay: cu?.demurragePerDay ? String(cu.demurragePerDay) : '',
    ...(Object.fromEntries(DUTIES.map(([k]) => [k, cu?.rates[k] ? String(cu.rates[k]) : ''])) as Record<DutyKey, string>),
  }))
  if (!s) return null
  const exp = s.direction === 'export'
  return (
    <FormSheet title={`Customs details · ${s.id}`} crumb="Customs clearance" submit="Save details" wide
      note="Duty rates depend on the HS code. Enter the rates your C&F agent or the customs tariff gives you; the figures here are an estimate until customs assesses the goods."
      onSubmit={() => {
        act('saveCustoms', {
          importId,
          data: {
            hsCode: v.hsCode.trim(), port: v.port.trim(), cnf: v.cnf.trim(), boeNo: v.boeNo.trim(), boeDate: v.boeDate, container: v.container.trim(),
            av: num(v.av), freeUntil: v.freeUntil, demurragePerDay: num(v.demurragePerDay),
            rates: Object.fromEntries(DUTIES.map(([k]) => [k, num(v[k])])),
          },
        })
        toast('Customs details saved')
      }}>
      <Field label="HS code"><input {...bind('hsCode')} placeholder="e.g. 8479.89.00" /></Field>
      <Field label="Port or customs station"><input {...bind('port')} placeholder="e.g. Chattogram port" /></Field>
      <Field label="C&F agent"><input {...bind('cnf')} placeholder="Agent name" /></Field>
      <Field label="Container or AWB number"><input {...bind('container')} placeholder="e.g. MSKU 482915-3" /></Field>
      <Field label={exp ? 'Bill of Export number' : 'Bill of Entry number'}><input {...bind('boeNo')} placeholder="e.g. C-184532" /></Field>
      <Field label={exp ? 'Bill of Export date' : 'Bill of Entry date'}><input type="date" {...bind('boeDate')} max={todayISO()} /></Field>
      <Field label="Assessable value (Tk)" hint="Leave empty to use invoice value plus freight and insurance." wide><input {...nbind('av')} placeholder="Worked out automatically" /></Field>
      {DUTIES.map(([k, label]) => <Field key={k} label={`${label} %`}><input {...nbind(k)} placeholder="0" /></Field>)}
      <Field label="Free time at port ends on"><input type="date" {...bind('freeUntil')} /></Field>
      <Field label="Demurrage per day after that (Tk)"><input {...nbind('demurragePerDay')} placeholder="0" /></Field>
    </FormSheet>
  )
}
