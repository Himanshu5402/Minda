import { Router } from 'express'
import { sendTestMail, verifyTransport } from '../controller/email.controller.js'

const routes = Router()

routes.get('/verify', verifyTransport)
routes.post('/test', sendTestMail)

export default routes

