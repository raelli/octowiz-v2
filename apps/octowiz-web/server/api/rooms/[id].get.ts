import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'

// Server-only read endpoint. The room ledger uses node:fs, so the read MUST stay on the
// server — never imported into a client bundle. Returns the room's RoomState projection,
// or 404 if the room has no ledger yet. Read-only: no mutation paths here.
export default defineEventHandler(async (event) => {
  const roomId = getRouterParam(event, 'id')
  if (!roomId)
    throw createError({ statusCode: 400, statusMessage: 'missing room id' })

  const { ledgerDir } = useRuntimeConfig(event)
  const ledger = new RoomLedger(new FileLedgerStore(ledgerDir))

  let state
  try {
    state = await ledger.getState(roomId)
  }
  catch {
    // assertSafeRoomId / malformed-ledger errors are a bad request against the read path,
    // not a server fault — surface them as 400 rather than a 500.
    throw createError({ statusCode: 400, statusMessage: 'invalid room id or ledger' })
  }

  if (state === null)
    throw createError({ statusCode: 404, statusMessage: `room "${roomId}" not found` })

  return state
})
