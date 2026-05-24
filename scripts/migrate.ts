import { getDb, closeDb } from '@/server/db/client'

getDb()
console.log('Migrations applied to', process.env.APP_DB_PATH ?? 'data/app.db')
closeDb()
