import { createTestClient } from 'apollo-server-testing'
import { transaction } from 'objection'
import createContext from '@druidjs/app/dist/context'
import { initDb } from '@druidjs/app/dist/context/db'
import { generateToken } from '@druidjs/app/dist/context/auth'
import { resolveApp } from '@druidjs/path-utils'

export async function createTestServer() {
  const app = getDruidInstance()
  const trx = await transaction.start(app.connection)
  
  const mockCtx = { req: { headers: {} } }
  const createMockContext = (_, __, options) => createContext(mockCtx, trx, options)
  app.initialize(createMockContext)

  const client = createTestClient(app.apolloServer)

  const enhanceRequest = (method) => async (args, { silent = false } = {}) => {
    const result = await client[method](args)
    if (result.errors && !silent) console.log(result.errors)
    return result
  }

  const query = enhanceRequest('query')
  const mutate = enhanceRequest('mutate')

  const testServer = {
    db: initDb(trx, app.options),

    setHeaders(headers) {
      mockCtx.req.headers = headers
    },
    query,
    mutate,
    authQuery(userId: number, queryArgs, options) {
      testServer.setHeaders(getAuthHeader(userId))
      return query(queryArgs, options)
    },
    authMutate(userId: number, mutateArgs, options) {
      testServer.setHeaders(getAuthHeader(userId))
      return mutate(mutateArgs, options)
    },
    async cleanup() {
      testServer.setHeaders({})
      await trx.rollback()
    },
    async destroy() {
      await app.connection.destroy()
    }
  }

  return testServer
}


export function getAuthHeader(userId: number) {
  return {
    authorization: `Bearer ${generateToken(userId)}`
  }
}

function getDruidInstance ({ srcDir = './src' } = {}) {
  return require(resolveApp(`./${srcDir}/app`)).default 
}
