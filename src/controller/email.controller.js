import { StatusCodes } from 'http-status-codes'
import { AsyncHandler } from '../utils/asyncHandler.js'
import { transport } from '../config/MailTransporter.js'
import { SendMail } from '../helper/SendEmail.js'

export const verifyTransport = AsyncHandler(async (_req, res) => {
  await transport.verify()
  res.status(StatusCodes.OK).json({ message: 'Transport OK' })
})

export const sendTestMail = AsyncHandler(async (req, res) => {
  const { to, subject, template = 'templateApproved', templateName = 'Test Template', recipientName = 'Test User' } = req.body || {}
  if (!to) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing "to" email' })
  }
  await SendMail(
    template,
    {
      recipientName,
      templateName,
    },
    {
      email: to,
      subject: subject || `Test Email: ${templateName}`,
    },
  )
  res.status(StatusCodes.OK).json({ message: 'Test email sent' })
})

