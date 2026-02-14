import { StatusCodes } from 'http-status-codes'
import { AsyncHandler } from '../utils/asyncHandler.js'
import {
  addFieldToTemplateService,
  createTemplateService,
  deleteFieldService,
  deleteTemplateService,
  getTemplateByIdService,
  listTemplatesService,
  updateFieldService,
  updateTemplateService,
  getAssignedTemplatesService,
  getTemplateStatusListService,
  getTemplateWorkflowStatusService,
  assignWorkflowToTemplateService,
  updateAssignedUserStatusService,
} from '../services/templateMaster.service.js'

export const createTemplate = AsyncHandler(async (req, res) => {
  const created = await createTemplateService(req.body)
  res.status(StatusCodes.CREATED).json({
    message: 'Template created successfully',
    data: created,
  })
})

export const listTemplates = AsyncHandler(async (req, res) => {
  let { page, limit } = req.query

  page = parseInt(page) || 1
  limit = parseInt(limit) || 10
  const skip = (page - 1) * limit
  const result = await listTemplatesService(skip, limit)
  res.status(StatusCodes.OK).json({
    message: 'Templates fetched successfully',
    data: result,
  })
})

export const getTemplateById = AsyncHandler(async (req, res) => {
  const user = req.currentUser;
  const excludeSubmissionOnly = req.query.preview === 'true';
  const result = await getTemplateByIdService(user.is_admin, req.params.id, user._id, excludeSubmissionOnly)
  res.status(StatusCodes.OK).json({
    message: 'Template fetched successfully',
    data: result,
  })
})

export const updateTemplate = AsyncHandler(async (req, res) => {
  const result = await updateTemplateService(req.params.id, req.body)
  res.status(StatusCodes.OK).json({
    message: 'Template updated successfully',
    data: result,
  })
})

export const addFieldToTemplate = AsyncHandler(async (req, res) => {
  const created = await addFieldToTemplateService(req.params.id, req.body)
  res.status(StatusCodes.CREATED).json({
    message: 'Field added successfully',
    data: created,
  })
})

export const updateField = AsyncHandler(async (req, res) => {
  const result = await updateFieldService(req.params.fieldId, req.body)
  res.status(StatusCodes.OK).json({
    message: 'Field updated successfully',
    data: result,
  })
})

export const deleteField = AsyncHandler(async (req, res) => {
  await deleteFieldService(req.params.fieldId)
  res.status(StatusCodes.OK).json({
    message: 'Field deleted successfully',
  })
})

export const deleteTemplate = AsyncHandler(async (req, res) => {
  await deleteTemplateService(req.params.id)
  res.status(StatusCodes.OK).json({
    message: 'Template deleted successfully',
  })
})

export const getAssignedTemplates = AsyncHandler(async (req, res) => {
  const userId = req.currentUser._id ;
  let { page, limit } = req.query
  page = parseInt(page) || 1
  limit = parseInt(limit) || 10
  const skip = (page - 1) * limit
  const result = await getAssignedTemplatesService(userId, limit, skip)
  res.status(StatusCodes.OK).json({
    message: 'Assigned templates fetched successfully',
    data: result,
  })
})

export const getTemplateStatusList = AsyncHandler(async (req, res) => {
  let { page, limit, search, status } = req.query
  page = parseInt(page) || 1
  limit = parseInt(limit) || 10
  const skip = (page - 1) * limit
  search = typeof search === 'string' ? search.trim() : ''
  status = typeof status === 'string' ? status.trim() : ''

  const userId = req.currentUser?._id || null
  const isAdmin = req.currentUser?.is_admin === true || false

  const result = await getTemplateStatusListService(skip, limit, search, status, userId, isAdmin)
  res.status(StatusCodes.OK).json({
    message: 'Template status list fetched successfully',
    data: result,
  })
})

export const getTemplateWorkflowStatus = AsyncHandler(async (req, res) => {
  const { id: templateId } = req.params
  const assignedUserId = (req.query.assigned_user_id || '').toString().trim() || null
  const result = await getTemplateWorkflowStatusService(templateId, assignedUserId)
  res.status(StatusCodes.OK).json({
    message: 'Template workflow status fetched successfully',
    data: result,
  })
})

export const assignWorkflowToTemplate = AsyncHandler(async (req, res) => {
  const { templateId } = req.params
  const { workflowId } = req.body
  const result = await assignWorkflowToTemplateService(templateId, workflowId)
  res.status(StatusCodes.OK).json({
    message: workflowId ? 'Workflow assigned successfully' : 'Workflow unassigned successfully',
    data: result,
  })
})

export const updateAssignedUserStatus = AsyncHandler(async (req, res) => {
  const { id: templateId } = req.params
  const { user_id, status } = req.body
  const result = await updateAssignedUserStatusService(templateId, { user_id, status })
  res.status(StatusCodes.OK).json({
    message: 'Assigned user status updated',
    data: result,
  })
})
