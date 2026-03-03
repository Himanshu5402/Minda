import { TemplateMasterModel } from '../models/templateMaster.model.js'
import { UserModel } from '../models/user.modal.js'
import { WorkflowModel } from '../models/workflow.modal.js'
import { WorkflowApprovalModel } from '../models/workflowApproval.model.js'
import { BadRequestError } from '../utils/errorHandler.js'
import { getCurrentApproverForTemplateAssignee } from './templateMaster.service.js'
import { Op } from 'sequelize'

const VALID_STATUSES = ['approved', 'rejected', 'reassigned']

export const CreateStatusHistoryService = async (data) => {
  // Model accepts "approved" | "rejected" | "reassigned". Normalize incoming status
  const payload = { ...data }
  const s = (payload.status || '').toString().trim().toLowerCase()
  if (s === 'reject' || s === 'rejected') {
    payload.status = 'rejected'
  } else if (s === 'approved' || s === 'approve') {
    payload.status = 'approved'
  } else if (s === 'reassigned' || s === 'reassign') {
    payload.status = 'reassigned'
    payload.reassign_status = false
    if (!payload.reassign_user_id) {
      throw new BadRequestError(
        'reassign_user_id is required when status is reassigned',
        'CreateStatusHistoryService()',
      )
    }
    if (!payload.template_id || !payload.user_id) {
      throw new BadRequestError(
        'template_id and user_id are required for reassign',
        'CreateStatusHistoryService()',
      )
    }
    const current = await getCurrentApproverForTemplateAssignee(
      payload.template_id,
      payload.user_id,
      payload.submission_id,
      payload.edit_count,
    )
    if (String(current.currentApproverUserId) !== String(payload.approved_by)) {
      throw new BadRequestError(
        'Only the current approver can reassign',
        'CreateStatusHistoryService()',
      )
    }
    if (!current.allowedReassignUserIds || current.allowedReassignUserIds.length === 0) {
      throw new BadRequestError(
        'Reassign is not allowed (e.g. HOD can only approve/reject)',
        'CreateStatusHistoryService()',
      )
    }
    if (!current.allowedReassignUserIds.includes(String(payload.reassign_user_id))) {
      throw new BadRequestError(
        'Reassign is only allowed to previous approvers who have already approved',
        'CreateStatusHistoryService()',
      )
    }
  } else if (!payload.status) {
    throw new BadRequestError(
      'status is required (approved, rejected or reassigned)',
      'CreateStatusHistoryService()',
    )
  } else {
    throw new BadRequestError(
      `status must be one of: ${VALID_STATUSES.join(', ')}. Received: ${payload.status}`,
      'CreateStatusHistoryService()',
    )
  }

  // Build insert payload with only model fields to avoid MSSQL invalid column errors
  const createData = {
    template_id: payload.template_id,
    workflow_id: payload.workflow_id,
    user_id: payload.user_id,
    current_stage: payload.current_stage != null ? Number(payload.current_stage) : 0,
    status: payload.status,
    remarks: payload.remarks || null,
    approved_by: payload.approved_by || null,
    reassign_status: payload.status === 'reassigned' ? false : false,
    submission_id: payload.submission_id,
    edit_count: payload.edit_count,
  }
  if (payload.reassign_stage != null) createData.reassign_stage = Number(payload.reassign_stage)
  if (payload.status === 'reassigned' && payload.reassign_user_id)
    createData.reassign_user_id = payload.reassign_user_id

  const result = await WorkflowApprovalModel.create(createData)
  return result
}

export const getStatusHistoryById = async (id) => {
  const result = await WorkflowApprovalModel.findOne({
    where: { _id: id },
    include: [
      //  {model:UserModel,as:"approved_by_user"},
      { model: TemplateMasterModel, as: 'template' },
      { model: WorkflowModel, as: 'workflow' },
      { model: UserModel, as: 'user' },
    ],
  })
  return result
}

export const listMyStatusHistoryService = async (
  approvedByUserId,
  { limit = 20, offset = 0, search = '' } = {},
) => {
  const where = { approved_by: approvedByUserId }
  const include = [
    {
      model: TemplateMasterModel,
      as: 'template',
      attributes: ['_id', 'template_name', 'template_type'],
    },
    {
      model: WorkflowModel,
      as: 'workflow',
      attributes: ['_id', 'name'],
    },
    {
      model: UserModel,
      as: 'user',
      attributes: ['_id', 'full_name', 'email', 'user_id'],
    },
  ]

  if (search && String(search).trim()) {
    // Filter by template name or assignee name/email/user_id
    include[0].where = {
      template_name: { [Op.like]: `%${search.trim()}%` },
    }
    include[0].required = false
    include[2].where = {
      [Op.or]: [
        { full_name: { [Op.like]: `%${search.trim()}%` } },
        { email: { [Op.like]: `%${search.trim()}%` } },
        { user_id: { [Op.like]: `%${search.trim()}%` } },
      ],
    }
    include[2].required = false
  }

  const result = await WorkflowApprovalModel.findAndCountAll({
    where,
    include,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  })

  return result
}
