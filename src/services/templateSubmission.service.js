import { TemplateSubmissionModel } from '../models/templateSubmission.model.js'
import { TemplateMasterModel } from '../models/templateMaster.model.js'
import { UserModel } from '../models/user.modal.js'
import { RoleModel } from '../models/role.modal.js'
import { WorkflowApprovalModel } from '../models/workflowApproval.model.js'
import { BadRequestError, NotFoundError } from '../utils/errorHandler.js'
import { PlantModel } from '../models/plant.modal.js'
import { TemplateFieldModel } from '../models/templateField.model.js'
import { Op } from 'sequelize'

export const createTemplateSubmissionService = async (data) => {
  const { template_id, user_id, form_data, status, plant_id } = data

  if (!template_id || !user_id) {
    throw new BadRequestError(
      'Template ID and User ID are required',
      'createTemplateSubmissionService()',
    )
  }

  // Verify template exists
  const template = await TemplateMasterModel.findByPk(template_id)
  if (!template) {
    throw new NotFoundError('Template not found', 'createTemplateSubmissionService()')
  }

  // Check if submission already exists for this template and user
  // const existingSubmission = await TemplateSubmissionModel.findOne({
  //   where: {
  //     template_id,
  //     user_id,
  //     plant_id,
  //     process_approved:false
  //   },
  // });

  // if (existingSubmission) {
  //   // Allow updating SUBMITTED submissions - change status to DRAFT when editing
  //   if (existingSubmission.status === "SUBMITTED" && status === "SUBMITTED") {
  //     throw new BadRequestError("Please edit the existing submission first", "createTemplateSubmissionService()");
  //   }

  //   // Update existing submission (DRAFT or SUBMITTED)
  //   await existingSubmission.update({
  //     form_data: form_data || {},
  //     status: status || (existingSubmission.status === "SUBMITTED" ? "DRAFT" : "DRAFT"),
  //   });
  //   return existingSubmission;
  // }

  // Create new submission
  const submission = await TemplateSubmissionModel.create({
    template_id,
    user_id,
    form_data: form_data || {},
    status: status || 'DRAFT',
    plant_id,
  })

  return submission
}

export const updateTemplateSubmissionService = async (submissionId, data) => {
  const submission = await TemplateSubmissionModel.findByPk(submissionId)
  if (!submission) {
    throw new NotFoundError('Submission not found', 'updateTemplateSubmissionService()')
  }

  // Allow editing SUBMITTED submissions - change status to DRAFT when editing
  const updateData = {
    form_data: data.form_data !== undefined ? data.form_data : submission.form_data,
    status:
      data.status !== undefined
        ? data.status
        : submission.status === 'SUBMITTED'
          ? 'DRAFT'
          : submission.status,
    edit_count: data.edit_count,
  }

  await submission.update(updateData)

  return submission
}

export const getTemplateSubmissionService = async (submissionId) => {
  const submission = await TemplateSubmissionModel.findByPk(submissionId, {
    include: [
      {
        model: TemplateMasterModel,
        as: 'template',
        attributes: ['_id', 'template_name', 'template_type'],
      },
      {
        model: UserModel,
        as: 'user',
        attributes: ['_id', 'full_name', 'email', 'user_id'],
      },
    ],
  })

  if (!submission) {
    throw new NotFoundError('Submission not found', 'getTemplateSubmissionService()')
  }

  return submission
}

export const getUserTemplateSubmissionsService = async (
  userId,
  templateId = null,
  plant_id = null,
) => {
  const where = { user_id: userId, plant_id, process_approved: false }
  if (templateId) {
    where.template_id = templateId
  }

  const submissions = await TemplateSubmissionModel.findAll({
    where,
    include: [
      {
        model: TemplateMasterModel,
        as: 'template',
        attributes: ['_id', 'template_name', 'template_type'],
      },
      {
        model: UserModel,
        as: 'user',
        attributes: ['_id', 'full_name', 'email', 'user_id'],
      },
    ],
    order: [['createdAt', 'DESC']],
  })

  return submissions
}

export const getLatestUserSubmissionForTemplateService = async (userId, templateId) => {
  const submission = await TemplateSubmissionModel.findOne({
    where: {
      user_id: userId,
      template_id: templateId,
    },
    order: [['createdAt', 'DESC']],
  })

  return submission
}

export const submitTemplateSubmissionService = async (submissionId) => {
  const submission = await TemplateSubmissionModel.findByPk(submissionId)
  if (!submission) {
    throw new NotFoundError('Submission not found', 'submitTemplateSubmissionService()')
  }

  await submission.update({
    status: 'SUBMITTED',
  })

  return submission
}

export const getTemplateSubmitionDataService = async (isAdmin, user_id, limit, skip) => {
  const result = await TemplateSubmissionModel.findAll({
    where: isAdmin ? { status: 'SUBMITTED' } : { user_id, status: 'SUBMITTED' },
    include: [
      {
        model: TemplateMasterModel,
        as: 'template',
        attributes: ['_id', 'template_name', 'template_type'],
        
      },
      {
        model: UserModel,
        as: 'user',
        attributes: ['_id', 'full_name', 'email', 'user_id', 'hod_id'],
        include: [
          { model: RoleModel, as: 'userRole', attributes: ['_id', 'name'], required: false },
          { model: UserModel, as: 'hod', attributes: ['_id', 'full_name', 'user_id'], required: false },
        ],
      },
      { model: PlantModel, as: 'plant', attributes: ['_id', 'plant_name', 'plant_code'] },
      {
        model: WorkflowApprovalModel,
        as: 'approvals',
        where: { status: 'approved' },
        attributes: ['approved_by', 'current_stage', 'createdAt','status','remarks','reassign_user_id','reassign_status'],
        include: [
          { model: UserModel, as: 'approvedBy', attributes: ['_id', 'full_name', 'user_id'], required: false },
        ],
        required: false,
      },
    ],
    attributes: [
      '_id',
      'template_id',
      'user_id',
      'form_data',
      'status',
      'createdAt',
      'updatedAt',
      'plant_id',
      'submission_id',
      'edit_count',
    ],
    order: [['createdAt', 'ASC']],
    offset: skip,
    limit,
  })

  // Collect base field IDs (strip _index from dynamic keys like fieldId_0, fieldId_1)
  const rawKeys = result.map((sub) => (sub.form_data ? Object.keys(sub.form_data) : [])).flat()
  const baseFieldIds = [
    ...new Set(
      rawKeys.map((k) => {
        const lastUnderscore = k.lastIndexOf('_')
        if (lastUnderscore > 0) {
          const suffix = k.slice(lastUnderscore + 1)
          if (/^\d+$/.test(suffix)) return k.slice(0, lastUnderscore)
        }
        return k
      }),
    ),
  ]

  const data = await TemplateFieldModel.findAll({
    where: {
      _id: { [Op.in]: baseFieldIds },
    },
  })

  const fieldMap = new Map()
  data.forEach((field) => {
    fieldMap.set(field._id, field.field_name)
  })

  const templateIds = [...new Set(result.map((item) => item.template_id))]
  const templateFields = await TemplateFieldModel.findAll({
    where: { template_id: { [Op.in]: templateIds } },
    order: [['sort_order', 'ASC']],
  })

  const templateFieldMap = new Map()
  templateFields.forEach((field) => {
    if (!templateFieldMap.has(field.template_id)) {
      templateFieldMap.set(field.template_id, [])
    }
    templateFieldMap.get(field.template_id).push(field.toJSON())
  })

  return result.map((item) => {
    let submission = item.toJSON()

    if (submission.form_data) {
      const updatedFormData = {}
      let index = 0

      for (const key in submission.form_data) {
        let fieldName = fieldMap.get(key)
        if (!fieldName) {
          const lastUnderscore = key.lastIndexOf('_')
          if (lastUnderscore > 0 && /^\d+$/.test(key.slice(lastUnderscore + 1))) {
            fieldName = fieldMap.get(key.slice(0, lastUnderscore))
          }
        }
        fieldName = fieldName || key
        updatedFormData[`${fieldName}~${index}`] = submission.form_data[key]
        index++
      }

      const allFields = templateFieldMap.get(submission.template_id) || []
      const assignedFields = allFields

      return {
        ...submission,
        filled_data: updatedFormData,
        assigned_fields: assignedFields,
      }
    }

    const allFields = templateFieldMap.get(submission.template_id) || []
    const assignedFields = allFields

    return {
      ...submission,
      assigned_fields: assignedFields,
    }
  })
}
