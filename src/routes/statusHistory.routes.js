import { Router } from 'express'

// --------------- local imports here ------------------
import { createStatusHistory, getMyStatusHistory } from '../controller/statusHistory.controller.js'

const routes = Router()

routes.route('/create').post(createStatusHistory)
routes.route('/my').get(getMyStatusHistory)

export default routes
