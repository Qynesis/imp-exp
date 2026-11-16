import { byId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { FormSheet, useForm, useToast } from '@/ui'
import { DealerFields } from '../DealerForm'
import { dealerInit, dealerPayload } from '../dealerFormModel'

export function DealerSheet({ dealerId }: { dealerId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm(() => dealerInit(byId(db.dealers, dealerId)))
  return (
    <FormSheet title="Edit dealer" crumb="Dealers" submit="Save dealer" onSubmit={() => {
      const p = dealerPayload(v)
      if (typeof p === 'string') return p
      act('saveDealer', p)
      toast('Dealer updated')
    }}>
      <DealerFields db={db} v={v} set={set} bind={bind} nbind={nbind} idPrefix="edit" />
    </FormSheet>
  )
}
