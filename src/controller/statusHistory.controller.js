import { AsyncHandler } from '../utils/asyncHandler.js'
import {
  CreateStatusHistoryService,
  getStatusHistoryById,
  listMyStatusHistoryService,
} from '../services/statusHistory.service.js'
import { StatusCodes } from 'http-status-codes'
import {
  getTemplateWorkflowStatusService,
  updateAssignedUserStatusService,
} from '../services/templateMaster.service.js'
import { GetAdmin, GetUsersByIdService } from '../services/users.service.js'
import { sendTemplateApprovalNotification, sendTemplateApprovedNotification, sendTemplateRejectedNotification } from '../helper/SendEmail.js'
import {
  CreateTemplateApprovalNotification,
  singleNotification,
} from '../services/notification.service.js'
import { sendNewNotification } from '../socket/notification.socket.js'
import { logger } from '../utils/logger.js'
import { WorkflowApprovalModel } from '../models/workflowApproval.model.js'
import { TemplateSubmissionModel } from '../models/templateSubmission.model.js'
import { io } from '../server.js'

export const createStatusHistory = AsyncHandler(async (req, res) => {
  const data = req.body
  const user = req.currentUser
  const result = await CreateStatusHistoryService({ ...data, approved_by: user._id })
  const check = await getStatusHistoryById(result._id)

  if (io) {
    console.log('[socket] emitting dataCreated for statusHistory')
    io.emit('dataCreated', {
      entity: 'statusHistory',
      data: result,
    })
    console.log('[socket] emitting dataUpdated for statusHistory')
    io.emit('dataUpdated', {
      entity: 'statusHistory',
      data: check,
    })
  }

  res.status(StatusCodes.CREATED).json({
    data: result,
    message: 'Template Status Initiated',
    check,
  })

  if (
    check?.workflow?.workflow?.length - 1 === check?.current_stage &&
    check?.status === 'approved'
  ) {
    await updateAssignedUserStatusService(check?.template_id, {
      user_id: check?.user_id,
      status: 'completed',
    })
    await TemplateSubmissionModel.update(
      { process_approved: true },
      {
        where: { _id: result?.dataValues?.submission_id },
      },
    )
    // Notify assignee: fully approved
    try {
      const assignee = check?.user_id ? await GetUsersByIdService(check.user_id) : null
      if (assignee?.email) {
        await sendTemplateApprovedNotification(
          assignee.email,
          assignee.full_name || assignee.email,
          check?.template?.template_name || 'Template'
        )
      }
    } catch (e) {
      logger.error('Final approval email error:', e)
    }
  }

  if (check?.status === 'approved' && check?.template_id && check?.user_id && check?.approved_by) {
    const updated = await WorkflowApprovalModel.update(
      { reassign_status: true },
      {
        where: {
          template_id: check.template_id,
          user_id: check.user_id,
          status: 'reassigned',
          reassign_user_id: check.approved_by,
          reassign_status: false,
        },
      },
    )
    if (updated[0] > 0) {
      logger.info(
        'Reassign approved: updated reassign_status to true for template',
        check.template_id,
      )
    }
  }

  if (check?.status === 'reject' || check?.status === 'rejected') {
    await updateAssignedUserStatusService(check?.template_id, {
      user_id: check?.user_id,
      status: 'rejected',
    })
    await TemplateSubmissionModel.update(
      { process_approved: true },
      {
        where: { _id: result?.dataValues?.submission_id },
      },
    )
    // Notify assignee: rejected
    try {
      const assignee = check?.user_id ? await GetUsersByIdService(check.user_id) : null
      if (assignee?.email) {
        await sendTemplateRejectedNotification(
          assignee.email,
          assignee.full_name || assignee.email,
          check?.template?.template_name || 'Template'
        )
      }
    } catch (e) {
      logger.error('Rejection email error:', e)
    }
  }

  if (check?.status === 'reassigned' && check?.template_id && check?.user_id) {
    await updateAssignedUserStatusService(check.template_id, {
      user_id: check.user_id,
      status: 're-assign',
    })
  }

  // Notify admin + next approver / reassign user (email + in-app notification)
  try {
    const templateName = check?.template?.template_name || 'Template'
    const templateId = check?.template_id || null
    const assignee = check?.user_id ? await GetUsersByIdService(check.user_id) : null
    const submittedByName = assignee?.full_name || ''
    const approverId = check?.approved_by || null
    const admin = await GetAdmin()

    const notifyRecipient = async (recipientId, recipientEmail, recipientName) => {
      if (!recipientId) return
      await sendTemplateApprovalNotification(
        recipientEmail,
        recipientName,
        templateName,
        submittedByName,
      )
      try {
        const notif = await CreateTemplateApprovalNotification({
          reciverId: recipientId,
          senderId: approverId,
          templateName,
          templateId,
          submittedByName,
        })
        const full = await singleNotification(notif._id)
        if (full) sendNewNotification(full)
      } catch (e) {
        logger.error('CreateTemplateApprovalNotification error:', e)
      }
    }

    if (admin?._id) await notifyRecipient(admin._id, admin.email, admin.full_name)

    if (check?.status === 'reassigned' && check?.reassign_user_id) {
      const reassignToUser = await GetUsersByIdService(check.reassign_user_id)
      if (reassignToUser?._id && reassignToUser?.email) {
        await notifyRecipient(reassignToUser._id, reassignToUser.email, reassignToUser.full_name)
      }
    }

    const steps = check?.workflow?.workflow || []
    const nextStageIndex = check?.current_stage != null ? check.current_stage + 1 : null
    const hasNextStage = steps.length > 0 && nextStageIndex != null && nextStageIndex < steps.length
    if (check?.status === 'approved' && hasNextStage && check?.template_id && check?.user_id) {
      let nextApproverUserId = null
      const reassignRecord = await WorkflowApprovalModel.findOne({
        where: {
          template_id: check.template_id,
          user_id: check.user_id,
          status: 'reassigned',
          reassign_user_id: check.approved_by,
        },
        order: [['createdAt', 'DESC']],
        attributes: ['approved_by'],
        raw: true,
      })
      if (reassignRecord?.approved_by) {
        nextApproverUserId = reassignRecord.approved_by
      } else {
        const workflowStatus = await getTemplateWorkflowStatusService(
          check.template_id,
          check.user_id,
        )
        const chain = workflowStatus?.chain || []
        const nextApproverEntry = chain.find((c) => c.stage_index === nextStageIndex)
        nextApproverUserId = nextApproverEntry?.user_id
      }
      if (nextApproverUserId) {
        const nextApprover = await GetUsersByIdService(nextApproverUserId)
        if (nextApprover?._id && nextApprover?.email) {
          await notifyRecipient(nextApprover._id, nextApprover.email, nextApprover.full_name)
        }
      }
    }
  } catch (err) {
    logger.error('Approval notification error:', err)
  }
})

export const getMyStatusHistory = AsyncHandler(async (req, res) => {
  const user = req.currentUser
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 20
  const offset = (page - 1) * limit
  const search = req.query.search || ''

  const { rows, count } = await listMyStatusHistoryService(user._id, {
    limit,
    offset,
    search,
  })

  res.status(StatusCodes.OK).json({
    data: rows,
    total: count,
    page,
    limit,
  })
})
