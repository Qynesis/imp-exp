import { Sheet, useSheetItem } from '@/ui'
import { SendOne } from './SendOne'

/** Send one message from anywhere a person appears: a dealer, a supplier, a driver. */
export function SendMessageSheet({ contactKey }: { contactKey?: string }) {
  const { close } = useSheetItem()
  return (
    <Sheet title="Send a message" crumb="Messages" wide>
      <SendOne presetKey={contactKey} onDone={() => setTimeout(close, 900)} />
    </Sheet>
  )
}
